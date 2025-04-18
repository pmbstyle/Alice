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
            'ring-error': webSocketStatus === 'ERROR',
            'w-[200px] h-[200px]': isMinimized,
            'w-[480px] h-[480px]': !isMinimized && isElectron,
            'w-[430px] h-[430px]': !isElectron,
          }"
          :style="{
            backgroundImage: `url('${bg}')`,
            backgroundPositionY: !isMinimized ? '-62px' : '-25px',
          }"
        >
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
import { Content } from '../api/gemini/liveApiClient'

const generalStore = useGeneralStore()
const conversationStore = useConversationStore()
const isElectron = typeof window !== 'undefined' && (window as any).electron

const {
  isRecordingRequested,
  isRecording,
  aiVideo,
  videoSource,
  isPlaying,
  statusMessage,
  openChat,
  isMinimized,
  storeMessage,
  takingScreenShot,
  updateVideo,
  isProcessingRequest,
  chatHistory,
} = storeToRefs(generalStore)

const { webSocketStatus } = storeToRefs(conversationStore)

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
    if (
      webSocketStatus.value === 'CLOSED' ||
      webSocketStatus.value === 'ERROR' ||
      webSocketStatus.value === 'IDLE'
    ) {
      try {
        await conversationStore.initializeSession()
        await new Promise(resolve => setTimeout(resolve, 200))
        if (webSocketStatus.value !== 'OPEN') {
          statusMessage.value = 'Connection Failed.'
          isRecordingRequested.value = false
          return
        }
      } catch (error) {
        statusMessage.value = 'Connection Error.'
        isRecordingRequested.value = false
        return
      }
    } else {
      isRecordingRequested.value = false
      return
    }
  }

  statusMessage.value = 'Listening...'
  isRecording.value = true
  updateVideo.value('PROCESSING')

  const historyWithoutPlaceholder = chatHistory.value.filter(
    msg =>
      !(msg.role === 'user' && msg.parts[0]?.text?.startsWith('[User Speaking'))
  )
  chatHistory.value = historyWithoutPlaceholder
  const placeholderMessage: Content = {
    role: 'user',
    parts: [{ text: '[User Speaking...]' }],
  }
  chatHistory.value.unshift(placeholderMessage)
  storeMessage.value = false

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
    } catch (moduleError: any) {
      if (!moduleError.message.includes('already added')) {
        console.error('Failed to load AudioWorklet module:', moduleError)
        throw moduleError
      }
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
            console.warn('WebSocket closed while recording. Stopping.')
            handleRecordingError('WebSocket closed')
          }
        } catch (error) {
          console.error('Error converting/sending worklet audio chunk:', error)
          handleRecordingError('Audio send error')
        }
      } else if (event.data.event === 'error') {
        console.error('Error from AudioWorkletProcessor:', event.data.error)
        handleRecordingError('Audio processing error')
      }
    }
    mediaStreamSource.connect(audioWorkletNode)
  } catch (error) {
    console.error('Error in startListening (getUserMedia or Worklet):', error)
    handleRecordingError(
      `Mic/Setup Error: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const stopListening = (manualStop = false) => {
  if (!isRecording.value && !audioStreamForRecorder && !audioContext) {
    isRecording.value = false
    isRecordingRequested.value = false
    return
  }

  const wasRecording = isRecording.value
  isRecording.value = false

  if (mediaStreamSource && audioWorkletNode) {
    try {
      mediaStreamSource.disconnect(audioWorkletNode)
    } catch (e) {
      console.warn('Error disconnecting mediaStreamSource:', e)
    }
  } else if (mediaStreamSource) {
    try {
      mediaStreamSource.disconnect()
    } catch (e) {
      console.warn('Error disconnecting mediaStreamSource (no worklet):', e)
    }
  }
  if (audioWorkletNode && audioContext?.destination) {
    try {
      audioWorkletNode.port.close()
    } catch (e) {
      console.warn('Error closing worklet port:', e)
    }
  }
  mediaStreamSource = null
  audioWorkletNode = null
  if (audioStreamForRecorder) {
    audioStreamForRecorder.getTracks().forEach(track => {
      track.stop()
    })
    audioStreamForRecorder = null
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext
      .close()
      .catch(e => console.warn('Error closing AudioContext:', e))
    audioContext = null
  }

  if (wasRecording) {
    chatHistory.value = chatHistory.value.filter(
      msg =>
        !(
          msg.role === 'user' &&
          msg.parts[0]?.text?.startsWith('[User Speaking')
        )
    )

    if (!manualStop) {
      storeMessage.value = true
      conversationStore.completeUserTurn()
    } else {
      console.log('Manual stop: Discarding current user audio input.')
      statusMessage.value = 'Ready'
      updateVideo.value('STAND_BY')
    }
  } else {
    isRecordingRequested.value = false
    if (statusMessage.value === 'Listening...') {
      if (!isPlaying.value && !isProcessingRequest.value) {
        statusMessage.value = 'Ready'
        updateVideo.value('STAND_BY')
      }
    }
  }
}

const handleRecordingError = (contextMessage: string = 'Recording error.') => {
  console.error(`handleRecordingError called: ${contextMessage}`)
  statusMessage.value = contextMessage
  isRecordingRequested.value = false
  stopListening(true)
  if (!isPlaying.value) updateVideo.value('STAND_BY')
}

const toggleRecording = () => {
  if (!isRecordingRequested.value) {
    if (isPlaying.value) {
      console.log('User started recording, interrupting playback.')
      generalStore.forceStopAudioPlayback()
      setTimeout(() => {
        isRecordingRequested.value = true
        startListening()
      }, 50)
    } else {
      isRecordingRequested.value = true
      startListening()
    }
  } else {
    isRecordingRequested.value = false
    statusMessage.value = 'Ready'
    if (isPlaying.value) {
      console.log('User stopped recording, stopping playback.')
      generalStore.forceStopAudioPlayback()
    }
    stopListening(true)
  }
}

const processRequest = async (text: string) => {
  if (!text.trim()) return
  if (isRecording.value || isRecordingRequested.value) {
    console.log('User sent text while recording, stopping recording first.')
    isRecordingRequested.value = false
    stopListening(true)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (isPlaying.value) {
    console.log('User sent text, stopping playback.')
    generalStore.forceStopAudioPlayback()
  }
  await conversationStore.sendTextMessage(text)
  scrollChat()
}

const takeScreenShot = async () => {
  if (!isElectron) {
    statusMessage.value = 'Screenshots not available.'
    return
  }
  if (takingScreenShot.value) {
    console.warn('Screenshot process already in progress.')
    return
  }
  if (isRecording.value || isRecordingRequested.value) {
    console.log('Stopping recording before taking screenshot.')
    isRecordingRequested.value = false
    stopListening(true)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  if (isPlaying.value) {
    console.log('Stopping playback before taking screenshot.')
    generalStore.forceStopAudioPlayback()
  }
  takingScreenShot.value = true
  statusMessage.value = 'Select screen area...'
  try {
    await window.ipcRenderer.invoke('show-overlay')
  } catch (error) {
    console.error('Error showing overlay:', error)
    statusMessage.value = 'Overlay Error'
    takingScreenShot.value = false
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
  generalStore.aiVideo = aiVideoRef.value

  generalStore.updateVideo = async (type: string) => {
    const newSrc = setVideo(type)
    const videoElement = generalStore.aiVideo
    if (videoElement && videoElement.currentSrc !== newSrc) {
      generalStore.videoSource = newSrc
      await nextTick()
      try {
        videoElement.load()
        await videoElement.play()
      } catch (error) {
        console.warn(`Video play failed for ${type}:`, error)
        setTimeout(
          () =>
            videoElement
              .play()
              .catch(e => console.warn('Retry play failed:', e)),
          100
        )
      }
    } else if (videoElement && videoElement.paused) {
      try {
        await videoElement.play()
      } catch (e) {
        /* Ignore */
      }
    }
  }

  try {
    await conversationStore.initializeSession()
    if (webSocketStatus.value === 'OPEN') {
      statusMessage.value = 'Ready'
      generalStore.updateVideo('STAND_BY')
    } else if (webSocketStatus.value !== 'CONNECTING') {
      statusMessage.value = 'Connection Error.'
      generalStore.updateVideo('STAND_BY')
    } else {
      generalStore.updateVideo('PROCESSING')
    }
  } catch (error) {
    console.error('Failed to initialize Gemini session on mount:', error)
    statusMessage.value = 'Initialization Failed.'
    generalStore.updateVideo('STAND_BY')
  }

  if (isElectron) {
    window.ipcRenderer.on('screenshot-captured', async () => {
      if (!takingScreenShot.value) return
      try {
        statusMessage.value = 'Processing screenshot...'
        updateVideo.value('PROCESSING')
        const dataURI = await window.ipcRenderer.invoke('get-screenshot')
        if (dataURI && typeof dataURI === 'string') {
          const base64Data = dataURI.split(',')[1]
          if (base64Data) {
            await conversationStore.sendImageInput(
              base64Data,
              'image/png',
              'Describe this screenshot.'
            )
          } else {
            throw new Error('Could not extract Base64 data from URI.')
          }
        } else {
          throw new Error('Received invalid data URI for screenshot.')
        }
      } catch (error) {
        console.error('Error processing screenshot:', error)
        statusMessage.value = 'Screenshot Error'
        updateVideo.value('STAND_BY')
      } finally {
        takingScreenShot.value = false
        window.ipcRenderer
          .invoke('hide-overlay')
          .catch(err => console.error('Error hiding overlay:', err))
      }
    })
  }

  watch(webSocketStatus, (newStatus, oldStatus) => {
    if (newStatus === 'ERROR' || newStatus === 'CLOSED') {
      statusMessage.value =
        newStatus === 'ERROR' ? 'Connection Error' : 'Disconnected'
      if (isRecordingRequested.value || isRecording.value) {
        handleRecordingError('Connection lost')
      }
      if (isPlaying.value) {
        generalStore.forceStopAudioPlayback()
      }
      if (!isPlaying.value) updateVideo.value('STAND_BY')
    } else if (newStatus === 'OPEN' && oldStatus === 'CONNECTING') {
      statusMessage.value = 'Ready'
      if (!isPlaying.value) updateVideo.value('STAND_BY')
    } else if (newStatus === 'CONNECTING') {
      statusMessage.value = 'Connecting...'
      if (!isPlaying.value) updateVideo.value('PROCESSING')
    }
  })
})

onUnmounted(() => {
  stopListening(true)
  if (isPlaying.value) generalStore.forceStopAudioPlayback()
  conversationStore.closeSession()
  if (isElectron) window.ipcRenderer.removeAllListeners('screenshot-captured')
  if (audioContext && audioContext.state !== 'closed') {
    audioContext
      .close()
      .catch(e => console.warn('Error closing AudioContext on unmount:', e))
    audioContext = null
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
  transition: ring-color 0.3s ease-in-out;

  &.ring-error {
    @apply ring-red-500;
  }
}
.avatar {
  transition: all 0.1s ease-in-out;
  &.open {
    @apply pr-[505px];
  }
}
</style>
