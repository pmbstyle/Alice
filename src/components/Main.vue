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
import * as vad from '@ricky0123/vad-web'

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
let myvad: vad.MicVAD | null = null
const isProcessingAudio = ref(false)
const processingDebounceTimer = ref<number | null>(null)

const screenShot = ref<string>('')
const screenshotReady = ref<boolean>(false)

const startListening = () => {
  if (!isRecordingRequested.value || isTTSProcessing.value) return
  statusMessage.value = 'Listening'
  recognizedText.value = ''

  if (myvad) {
    try {
      myvad.pause()
      myvad = null
    } catch (error) {
      console.error('Error cleaning up previous VAD instance:', error)
    }
  }

  vad.MicVAD.new({
    baseAssetPath: './',
    onnxWASMBasePath: './',
    onSpeechStart: () => {
      isRecording.value = true
    },
    onSpeechEnd: (audio: Float32Array) => {
      if (isRecording.value && !isProcessingAudio.value) {
        stopRecording(audio)
      }
    },
  })
    .then(vadInstance => {
      myvad = vadInstance
      myvad.start()
    })
    .catch(err => {
      console.error('VAD initialization error:', err)
      statusMessage.value = 'Error initializing VAD'
    })
}

const stopRecording = (audio: Float32Array) => {
  if (mediaRecorder) {
    mediaRecorder.stop()
    mediaRecorder = null
  }

  if (processingDebounceTimer.value) {
    clearTimeout(processingDebounceTimer.value)
  }

  processingDebounceTimer.value = window.setTimeout(() => {
    if (!isProcessingAudio.value) {
      processAudioRecording(audio)
    }
  }, 300)
}

const processAudioRecording = async (audio?: Float32Array) => {
  if (isProcessingAudio.value) return

  try {
    isProcessingAudio.value = true
    statusMessage.value = 'Processing audio...'

    if (audio && audio.length > 0) {
      const wavBuffer = float32ArrayToWav(audio, 16000)
      const transcription =
        await conversationStore.transcribeAudioMessage(wavBuffer)

      recognizedText.value = transcription

      if (transcription.trim()) {
        processRequest(transcription)
      } else {
        statusMessage.value = 'No speech detected'
      }
    } else {
      statusMessage.value = 'No audio data captured'
    }
  } catch (error) {
    console.error('Error processing audio:', error)
    statusMessage.value = 'Error processing audio'
  } finally {
    audioChunks = []
    stopListening()
    isProcessingAudio.value = false
  }
}

const float32ArrayToWav = (
  samples: Float32Array,
  sampleRate: number
): ArrayBuffer => {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(view, 8, 'WAVE')

  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)

  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let index = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    const val = s < 0 ? s * 0x8000 : s * 0x7fff
    view.setInt16(index, val, true)
    index += 2
  }

  return buffer
}

const writeString = (view: DataView, offset: number, string: string): void => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

const stopListening = () => {
  if (myvad) {
    try {
      myvad.pause()
      myvad = null
    } catch (error) {
      console.error('Error stopping VAD:', error)
    }
  }

  if (processingDebounceTimer.value) {
    clearTimeout(processingDebounceTimer.value)
    processingDebounceTimer.value = null
  }

  statusMessage.value = 'Stopped Listening'
  isRecording.value = false
}

const toggleRecording = () => {
  isRecordingRequested.value = !isRecordingRequested.value

  if (!isRecordingRequested.value) {
    stopListening()
  } else {
    if (myvad) {
      try {
        myvad.pause()
        myvad = null
      } catch (error) {
        console.error('Error cleaning up VAD:', error)
      }
    }
    isProcessingAudio.value = false
    if (processingDebounceTimer.value) {
      clearTimeout(processingDebounceTimer.value)
      processingDebounceTimer.value = null
    }
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
  &:hover {
    :deep(.inside-actions) {
      @apply opacity-100;
    }
  }
}
</style>
