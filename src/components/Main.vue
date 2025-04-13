<template>
  <div class="h-screen flex w-full items-center justify-start relative">
    <div
      class="avatar-wrapper flex container h-full items-center justify-center relative z-2"
      :class="{ mini: isMinimized }"
    >
      <div class="avatar" :class="{ open: openChat }">
        <div
          class="avatar-ring"
          :class="{
            'ring-success': isPlaying,
            'w-[200px] h-[200px]': isMinimized,
            'w-[480px] h-[480px]': !isMinimized && isElectron,
            'w-[430px] h-[430px]': !isElectron,
          }"
          :style="{
            backgroundImage: `url('${bg}'`,
            backgroundPositionY: !isMinimized ? '-62px' : '-25px',
          }"
        >
          <audio ref="audioPlayer" class="hidden"></audio>
          <video
            class="max-w-screen-md rounded-full ring"
            :class="{
              'h-[200px]': isMinimized,
              'h-[480px]': !isMinimized && isElectron,
              'h-[430px]': !isElectron,
            }"
            ref="aiVideo"
            :src="videoSource"
            loop
            muted
            :autoplay="isPlaying"
          ></video>
          <Actions
            @takeScreenShot="takeScreenShot"
            @togglePlaying="togglePlaying"
            @toggleRecording="toggleRecording"
            :isElectron="isElectron"
          />
        </div>
      </div>
      <Chat @processRequest="processRequest" />
    </div>
  </div>
</template>

<script setup lang="ts">
import Actions from './Actions.vue'
import Chat from './Chat.vue'
import { bg } from '../utils/assetsImport.ts'
import { setVideo } from '../utils/videoProcess.ts'
import { ref, onMounted, nextTick } from 'vue'
import { useGeneralStore } from '../stores/generalStore.ts'
import { useConversationStore } from '../stores/openAIStore.ts'
import { storeToRefs } from 'pinia'

const generalStore = useGeneralStore()
const conversationStore = useConversationStore()
const isElectron = typeof window !== 'undefined' && window?.electron

const {
  recognizedText,
  isRecordingRequested,
  isRecording,
  audioPlayer,
  aiVideo,
  videoSource,
  isPlaying,
  statusMessage,
  audioContext,
  audioSource,
  chatInput,
  openChat,
  isMinimized,
  storeMessage,
  takingScreenShot,
  updateVideo,
  isTTSProcessing,
} = storeToRefs(generalStore)
generalStore.setProvider('openai')

let mediaRecorder: MediaRecorder | null = null
let audioChunks: BlobPart[] = []

const recordingConfig = {
  silenceThreshold: 43,
  minRMSValue: 1e-10,
  bufferLength: 10,
  silenceTimeout: 499,
  fftSize: 2048,
  vadBufferSize: 10,
}

const screenShot = ref<string>('')
const screenshotReady = ref<boolean>(false)

const vadBuffer = {
  samples: [] as boolean[],
  add(isSpeaking: boolean) {
    this.samples.push(isSpeaking)
    if (this.samples.length > recordingConfig.vadBufferSize) {
      this.samples.shift()
    }
  },
  isActive() {
    const activeCount = this.samples.filter(x => x).length
    return activeCount > recordingConfig.vadBufferSize * 0.3
  },
}

const startListening = () => {
  if (!isRecordingRequested.value || isTTSProcessing.value) return
  statusMessage.value = 'Listening'
  recognizedText.value = ''

  const mediaDevices =
    navigator.mediaDevices ||
    (navigator as any).webkitGetUserMedia ||
    (navigator as any).mozGetUserMedia

  mediaDevices
    .getUserMedia({ audio: true })
    .then(stream => {
      const audioContext = new window.AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = recordingConfig.fftSize
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      source.connect(analyser)

      mediaRecorder = new MediaRecorder(stream)
      mediaRecorder.start()

      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        try {
          statusMessage.value = 'Stop listening'
          if (!isRecordingRequested.value) return

          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' })
          const arrayBuffer = await audioBlob.arrayBuffer()
          const transcription = await conversationStore.transcribeAudioMessage(
            arrayBuffer as Buffer
          )
          recognizedText.value = transcription

          if (transcription.trim()) {
            storeMessage.value = true
            processRequest(transcription)
          } else {
            statusMessage.value = 'No speech detected'
            toggleRecording()
          }
        } catch (error) {
          statusMessage.value = 'Error processing audio'
          console.error('Error processing audio:', error)
          handleRecordingError()
        }
      }

      let silenceCounter = 0
      const rmsBuffer = Array(recordingConfig.bufferLength).fill(0)

      const detectSilence = () => {
        analyser.getByteTimeDomainData(dataArray)

        let sumSquares = 0.0
        for (let i = 0; i < bufferLength; i++) {
          const normalized = dataArray[i] / 128.0 - 1.0
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / bufferLength)

        const gatedRMS = noiseGate(rms, recordingConfig.minRMSValue)

        rmsBuffer.shift()
        rmsBuffer.push(gatedRMS)

        const avgRMS =
          rmsBuffer.reduce((sum, val) => sum + val, 0) / rmsBuffer.length
        const db =
          20 * Math.log10(Math.max(avgRMS, recordingConfig.minRMSValue)) * -1

        const isSilent = db > recordingConfig.silenceThreshold
        vadBuffer.add(!isSilent)

        if (isSilent && !vadBuffer.isActive()) {
          silenceCounter++
        } else {
          silenceCounter = 0
        }

        if (silenceCounter > recordingConfig.silenceTimeout) {
          stopListening()
          silenceCounter = 0
        } else {
          requestAnimationFrame(detectSilence)
        }
      }

      detectSilence()
    })
    .catch(error => handleRecordingError())

  isRecording.value = true
}

const noiseGate = (rms: number, threshold: number) => {
  return rms < threshold ? 0 : rms
}

const handleRecordingError = async () => {
  statusMessage.value = 'Recording error, retrying...'
  isRecording.value = false
  audioChunks = []

  if (mediaRecorder) {
    const tracks = mediaRecorder.stream.getTracks()
    tracks.forEach(track => track.stop())
  }

  await new Promise(resolve => setTimeout(resolve, 1000))
  if (isRecordingRequested.value) {
    startListening()
  }
}

const stopListening = () => {
  if (!mediaRecorder) return
  mediaRecorder.stop()
  audioChunks = []
  isRecording.value = false
}

const toggleRecording = () => {
  isRecordingRequested.value = !isRecordingRequested.value
  if (!isRecordingRequested.value) {
    stopListening()
  } else {
    isRecording.value = true
    startListening()
  }
}

const togglePlaying = () => {
  if (isPlaying.value) {
    audioPlayer.value?.pause()
    updateVideo.value('STAND_BY')
    statusMessage.value = 'Stand by'

    if (audioContext.value) {
      audioContext.value.close()
      audioContext.value = null
    }

    generalStore.audioQueue = []

    isPlaying.value = false
    if (isRecordingRequested.value) {
      isRecording.value = true
      startListening()
    }
  } else {
    audioSource.value?.start()
    isPlaying.value = true
  }
}

generalStore.playAudio = async (audioResponse: Response) => {
  if (!audioPlayer.value) return

  generalStore.audioQueue.push(audioResponse)

  if (!isPlaying.value) {
    playNextAudio()
  }
}

const playNextAudio = async () => {
  if (generalStore.audioQueue.length === 0) {
    isPlaying.value = false
    statusMessage.value = 'Stand by'
    if (isRecordingRequested.value) {
      startListening()
    }
    return
  }

  if (isRecording.value) {
    stopListening()
  }

  isPlaying.value = true
  const audioResponse = generalStore.audioQueue.shift()

  if (audioPlayer.value && audioResponse) {
    const mediaSource = new MediaSource()
    audioPlayer.value.src = URL.createObjectURL(mediaSource)

    audioPlayer.value.addEventListener(
      'ended',
      () => {
        playNextAudio()
      },
      { once: true }
    )

    mediaSource.addEventListener('sourceopen', () => {
      const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg')
      const reader = audioResponse.body?.getReader()

      if (!reader) {
        console.error('Failed to get reader from audio response body.')
        return
      }

      function pushChunk() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              mediaSource.endOfStream()
              return
            }
            try {
              if (!sourceBuffer.updating) {
                sourceBuffer.appendBuffer(value)
                sourceBuffer.addEventListener('updateend', pushChunk, {
                  once: true,
                })
              } else {
                sourceBuffer.addEventListener(
                  'updateend',
                  () => {
                    sourceBuffer.appendBuffer(value)
                    sourceBuffer.addEventListener('updateend', pushChunk, {
                      once: true,
                    })
                  },
                  { once: true }
                )
              }
            } catch (error) {
              console.error('Failed to append audio chunk:', error)
            }
          })
          .catch(err => {
            console.error('Error reading audio stream:', err)
          })
      }

      pushChunk()
    })

    await audioPlayer.value.play()
    statusMessage.value = 'Speaking...'
  }
}

const processRequest = async (text: string) => {
  updateVideo.value('PROCESSING')

  let messageContent: any[] = [{ type: 'text', text: text }]

  if (screenshotReady.value && screenShot.value) {
    try {
      const fileId = await conversationStore.uploadScreenshotToOpenAI(
        screenShot.value
      )

      messageContent.push({
        type: 'image_file',
        image_file: {
          file_id: fileId,
        },
      })

      screenshotReady.value = false
      screenShot.value = ''
    } catch (error) {
      console.error('Error uploading screenshot:', error)
      statusMessage.value = 'Error uploading screenshot'
    }
  }

  const userMessage = {
    role: 'user',
    content: messageContent,
  }

  generalStore.chatHistory.unshift({
    role: 'user',
    content: [
      {
        type: 'text',
        text: { value: text, annotations: [] },
      },
    ],
  })

  scrollChat()

  const prompt = await conversationStore.createOpenAIPrompt(
    userMessage,
    storeMessage.value
  )

  await conversationStore.sendMessageToThread(
    prompt.message,
    storeMessage.value
  )

  chatInput.value = ''
  await conversationStore.chat(prompt.history)
}

const takeScreenShot = async () => {
  if (!takingScreenShot.value) {
    takingScreenShot.value = true
    statusMessage.value = 'Taking a screenshot'
    await window.electron.showOverlay()
  }
}

const scrollChat = () => {
  const chatHistoryElement = document.getElementById('chatHistory')
  if (chatHistoryElement) {
    chatHistoryElement.scrollTo({
      top: chatHistoryElement.scrollHeight,
      behavior: 'smooth',
    })
  }
}

onMounted(async () => {
  await conversationStore.createNewThread()
  updateVideo.value = async (type: string) => {
    const playVideo = async (videoType: string) => {
      videoSource.value = setVideo(videoType)
      await nextTick()
      aiVideo.value?.play()
    }
    await playVideo(type)
  }
  updateVideo.value('STAND_BY')

  if (isElectron) {
    window.ipcRenderer.on('screenshot-captured', async () => {
      try {
        const dataURI = await window.ipcRenderer.invoke('get-screenshot')
        screenShot.value = dataURI
        screenshotReady.value = true
        statusMessage.value = 'Screenshot ready'
      } catch (error) {
        console.error('Error retrieving screenshot:', error)
        statusMessage.value = 'Error taking screenshot'
      } finally {
        takingScreenShot.value = false
      }
    })
  }
})
</script>

<style scoped lang="postcss">
.avatar-wrapper {
  height: 500px;
  &.mini {
    height: 200px;
  }
  .avatar-ring {
    @apply rounded-full ring ring-offset-base-100 ring-offset-2
    relative overflow-hidden !flex justify-center items-center
    z-20 bg-no-repeat bg-cover bg-center shadow-md;
  }
}

.avatar {
  transition: all 0.1s ease-in-out;
  &.open {
    @apply pr-[505px];
  }
}
</style>
