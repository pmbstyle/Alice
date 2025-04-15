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
          <audio ref="audioPlayerRef" class="hidden"></audio>
          <video
            class="max-w-screen-md rounded-full ring"
            :class="{
              'h-[200px]': isMinimized,
              'h-[480px]': !isMinimized && isElectron,
              'h-[430px]': !isElectron,
            }"
            ref="aiVideoRef"
            :src="videoSource"
            loop
            muted
            autoplay
            playsinline
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
import { ref, onMounted, nextTick, onUnmounted, watch } from 'vue'
import { useGeneralStore } from '../stores/generalStore.ts'
import { useConversationStore } from '../stores/conversationStore.ts'
import { storeToRefs } from 'pinia'

const generalStore = useGeneralStore()
const conversationStore = useConversationStore()
const isElectron = typeof window !== 'undefined' && (window as any).electron

const {
  recognizedText,
  isRecordingRequested,
  isRecording,
  audioPlayer,
  aiVideo,
  videoSource,
  isPlaying,
  statusMessage,
  chatInput,
  openChat,
  isMinimized,
  storeMessage,
  takingScreenShot,
  updateVideo,
  isTTSProcessing,
} = storeToRefs(generalStore)

const { webSocketStatus } = storeToRefs(conversationStore)

const audioPlayerRef = ref<HTMLAudioElement | null>(null)
const aiVideoRef = ref<HTMLVideoElement | null>(null)

let audioContext: AudioContext | null = null
let audioWorkletNode: AudioWorkletNode | null = null
let mediaStreamSource: MediaStreamAudioSourceNode | null = null
let audioStreamForRecorder: MediaStream | null = null

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

const startListening = async () => {
  if (webSocketStatus.value !== 'OPEN') {
    statusMessage.value = 'Connecting...'
    console.warn('Attempted startListening before WebSocket was OPEN.')
    return
  }

  if (!isRecordingRequested.value || isRecording.value || isPlaying.value) {
    console.log(
      `StartListening skipped: requested=${isRecordingRequested.value}, recording=${isRecording.value}, playing=${isPlaying.value}`
    )
    return
  }

  statusMessage.value = 'Listening...'
  isRecording.value = true

  const lastHistoryItem = generalStore.chatHistory[0]
  if (
    !lastHistoryItem ||
    lastHistoryItem.role !== 'user' ||
    !lastHistoryItem.parts[0]?.text?.startsWith('[User Speaking')
  ) {
    generalStore.chatHistory.unshift({
      role: 'user',
      parts: [{ text: '[User Speaking...]' }],
    })
  }
  generalStore.storeMessage = true

  try {
    if (audioContext && audioContext.state !== 'closed') {
      await audioContext
        .close()
        .catch(e => console.warn('Error closing previous AudioContext:', e))
    }
    audioContext = new AudioContext({ sampleRate: 16000 })

    try {
      await audioContext.audioWorklet.addModule(
        '/js/worklets/audio-processor.js'
      )
    } catch (moduleError) {
      console.error('Failed to load AudioWorklet module:', moduleError)
      throw moduleError
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    audioStreamForRecorder = stream

    mediaStreamSource = audioContext.createMediaStreamSource(stream)
    audioWorkletNode = new AudioWorkletNode(
      audioContext,
      'audio-recorder-worklet'
    )

    audioWorkletNode.port.onmessage = async event => {
      if (!isRecording.value) return

      if (event.data.event === 'chunk') {
        const int16Buffer = event.data.data.int16arrayBuffer
        try {
          const base64Chunk = arrayBufferToBase64(int16Buffer)
          if (webSocketStatus.value === 'OPEN') {
            await conversationStore.sendAudioChunk(base64Chunk)
          } else {
            console.warn('WebSocket closed before audio chunk could be sent.')
            handleRecordingError()
          }
        } catch (error) {
          console.error('Error converting/sending worklet audio chunk:', error)
          handleRecordingError()
        }
      } else if (event.data.event === 'error') {
        console.error('Error from AudioWorkletProcessor:', event.data.error)
        handleRecordingError()
      }
    }

    mediaStreamSource.connect(audioWorkletNode)
  } catch (error) {
    console.error('Error in startListening (getUserMedia or Worklet):', error)
    handleRecordingError()
  }
}

const stopListening = () => {
  console.log('stopListening called (cleanup only)...')

  if (!isRecording.value && !audioStreamForRecorder) {
    console.log('...already stopped/cleaned up.')
    return
  }

  isRecording.value = false

  if (mediaStreamSource) {
    try {
      mediaStreamSource.disconnect()
    } catch (e) {}
    mediaStreamSource = null
  }
  if (audioWorkletNode) {
    try {
      audioWorkletNode.disconnect()
    } catch (e) {}
    audioWorkletNode = null
  }

  if (audioStreamForRecorder) {
    audioStreamForRecorder.getTracks().forEach(track => track.stop())
    audioStreamForRecorder = null
  }

  if (audioContext && audioContext.state !== 'closed') {
    audioContext
      .close()
      .catch(e => console.warn('Error closing AudioContext:', e))
    audioContext = null
  }
}

const handleRecordingError = () => {
  console.error('handleRecordingError called.')
  statusMessage.value = 'Recording error.'
  isRecordingRequested.value = false
  stopListening()
}

const toggleRecording = () => {
  if (isPlaying.value) {
    console.log('Playback active, stopping playback first.')
    togglePlaying()
    setTimeout(() => {
      proceedWithToggleRecording()
    }, 150)
  } else {
    proceedWithToggleRecording()
  }
}

const proceedWithToggleRecording = () => {
  if (isPlaying.value) {
    console.warn('Still playing audio, cannot start recording yet.')
    return
  }
  isRecordingRequested.value = !isRecordingRequested.value
  if (isRecordingRequested.value) {
    startListening()
  } else {
    statusMessage.value = 'Processing...'
    stopListening()
    conversationStore.completeUserTurn()
  }
}

const togglePlaying = () => {
  if (!generalStore.audioPlayer) return

  if (isPlaying.value) {
    console.log('togglePlaying: Stopping playback.')
    generalStore.audioPlayer.pause()
    generalStore.audioPlayer.src = ''
    generalStore.audioQueue.length = 0
    isPlaying.value = false
    isTTSProcessing.value = false
    statusMessage.value = 'Muted.'
    updateVideo.value('STAND_BY')

    if (isRecordingRequested.value && !isRecording.value) {
      console.log(
        'togglePlaying: Restarting listening after stopping playback.'
      )
      startListening()
    }
  } else {
    if (generalStore.audioQueue.length > 0) {
      console.log('togglePlaying: Resuming playback from queue.')
      generalStore.playNextAudio()
    } else {
      console.log('Toggle Playing: No audio in queue to resume.')
      if (!isProcessingRequest.value) {
        statusMessage.value = 'Ready.'
        updateVideo.value('STAND_BY')
      }
    }
  }
}

const processRequest = async (text: string) => {
  await conversationStore.sendTextMessage(text)
  scrollChat()
}

const takeScreenShot = async () => {
  if (!isElectron) {
    statusMessage.value = 'Screenshots not available.'
    return
  }
  if (!takingScreenShot.value) {
    takingScreenShot.value = true
    statusMessage.value = 'Select screen area...'
    await (window as any).electron.showOverlay()
  }
}

const scrollChat = () => {
  nextTick(() => {
    const chatHistoryElement = document.getElementById('chatHistory')
    if (chatHistoryElement) {
      chatHistoryElement.scrollTo({
        top: chatHistoryElement.scrollHeight,
        behavior: 'smooth',
      })
    }
  })
}

onMounted(async () => {
  generalStore.audioPlayer = audioPlayerRef.value
  generalStore.aiVideo = aiVideoRef.value

  try {
    await conversationStore.initializeSession()
    generalStore.updateVideo('STAND_BY')
  } catch (error) {
    console.error('Failed to initialize Gemini session on mount:', error)
  }

  generalStore.updateVideo = async (type: string) => {
    const newSrc = setVideo(type)
    if (generalStore.aiVideo && generalStore.aiVideo.src !== newSrc) {
      generalStore.videoSource = newSrc
      await nextTick()
      try {
        await generalStore.aiVideo.play()
      } catch (error) {
        console.warn('Video play failed:', error)
      }
    }
  }
  generalStore.updateVideo('STAND_BY')

  if (isElectron) {
    window.ipcRenderer.on('screenshot-captured', async () => {
      try {
        console.log('IPC: screenshot-captured event received')
        statusMessage.value = 'Processing screenshot...'
        const dataURI = await window.ipcRenderer.invoke('get-screenshot')
        if (dataURI) {
          const base64Data = dataURI.split(',')[1]
          if (base64Data) {
            await conversationStore.sendImageInput(
              base64Data,
              'image/png',
              'Describe this screenshot.'
            )
          } else {
            throw new Error('Could not extract Base64 data.')
          }
        } else {
          throw new Error('Received null data URI.')
        }
      } catch (error) {
        console.error('Error processing screenshot:', error)
        statusMessage.value = 'Error processing screenshot'
        generalStore.takingScreenShot = false
      }
    })
  }

  watch(webSocketStatus, (newStatus, oldStatus) => {
    console.log(`WebSocket status changed: ${oldStatus} -> ${newStatus}`)
    if (newStatus === 'ERROR' || newStatus === 'CLOSED') {
      if (isRecordingRequested.value) {
        isRecordingRequested.value = false
        handleRecordingError()
        statusMessage.value = 'Connection lost.'
      }
    }
  })
})

onUnmounted(() => {
  stopListening()
  conversationStore.closeSession()
  if (isElectron) {
    window.ipcRenderer.removeAllListeners('screenshot-captured')
  }
})
</script>

<style scoped lang="postcss">
.avatar-wrapper {
  height: 500px;
  &.mini {
    height: 200px;
  }
}
.avatar-ring {
  @apply rounded-full ring ring-offset-base-100 ring-offset-2 relative overflow-hidden !flex justify-center items-center z-20 bg-no-repeat bg-cover bg-center shadow-md;
}
.avatar {
  transition: all 0.1s ease-in-out;
  &.open {
    @apply pr-[505px];
  }
}
</style>
