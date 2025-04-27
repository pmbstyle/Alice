<template>
  <div class="h-screen flex w-full items-center justify-start relative">
    <div
      class="avatar-wrapper flex container h-full items-center justify-center relative z-2"
      :class="{ mini: isMinimized }"
    >
      <div class="avatar" :class="{ open: openSidebar }">
        <div
          class="avatar-ring"
          :class="{
            'ring-green-500!': isPlaying,
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
            class="max-w-screen-md rounded-full"
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
      <Sidebar @processRequest="processRequest" />
    </div>
  </div>
</template>

<script setup lang="ts">
import Actions from './Actions.vue'
import Sidebar from './Sidebar.vue'
import { bg } from '../utils/assetsImport'
import { setVideo } from '../utils/videoProcess'
import { float32ArrayToWav } from '../utils/audioProcess'
import { ref, onMounted, nextTick } from 'vue'
import { useGeneralStore } from '../stores/generalStore'
import { useConversationStore } from '../stores/openAIStore'
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
  openSidebar,
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

const stopListening = () => {
  if (myvad) {
    try {
      myvad.pause()
      myvad.destroy()
      myvad = null
    } catch (error) {
      console.error('Error stopping VAD:', error)
    }
  }

  if (processingDebounceTimer.value) {
    clearTimeout(processingDebounceTimer.value)
    processingDebounceTimer.value = null
  }

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

  if (audioPlayer.value) {
    audioPlayer.value.pause()
    audioPlayer.value.removeAttribute('src')
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
              try {
                mediaSource.endOfStream()
              } catch (e) {
                console.warn('MediaSource already ended or closed:', e)
              }
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
                    try {
                      sourceBuffer.appendBuffer(value)
                      sourceBuffer.addEventListener('updateend', pushChunk, {
                        once: true,
                      })
                    } catch (e) {
                      console.warn(
                        'Error appending buffer, source may be closed:',
                        e
                      )
                    }
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
