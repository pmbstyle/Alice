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
import { Content } from '../types/geminiTypes'
import { Logger } from '../utils/logger'

const logger = new Logger('MainComponent')

const generalStore = useGeneralStore()
const conversationStore = useConversationStore()
const isElectron = typeof window !== 'undefined' && (window as any).electron

const {
  isRecordingRequested,
  isRecording,
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

/**
 * Converts an ArrayBuffer to a base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Handles WebSocket connection for audio recording
 * @returns {Promise<boolean>} True if connection was successful
 */
async function ensureWebSocketConnection(): Promise<boolean> {
  if (webSocketStatus.value === 'OPEN') {
    return true
  }

  statusMessage.value = 'Connecting...'
  logger.warn('Attempted startListening before WebSocket was OPEN.')

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
        return false
      }
      return true
    } catch (error) {
      statusMessage.value = 'Connection Error.'
      isRecordingRequested.value = false
      return false
    }
  }

  isRecordingRequested.value = false
  return false
}

/**
 * Prepares the UI state for recording
 */
function prepareUIForRecording(): void {
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
}

/**
 * Sets up the audio processing worklet
 */
async function setupAudioWorklet(): Promise<boolean> {
  try {
    if (audioContext && audioContext.state !== 'closed') {
      await audioContext
        .close()
        .catch(e => logger.warn('Error closing previous AudioContext:', e))
    }

    audioContext = new AudioContext({ sampleRate: 16000 })

    try {
      await audioContext.audioWorklet.addModule(
        '/js/worklets/audio-processor.js'
      )
    } catch (moduleError: any) {
      if (!moduleError.message.includes('already added')) {
        logger.error('Failed to load AudioWorklet module:', moduleError)
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

    setupAudioWorkletMessageHandler()

    mediaStreamSource.connect(audioWorkletNode)
    return true
  } catch (error) {
    logger.error('Error setting up audio worklet:', error)
    return false
  }
}

/**
 * Sets up the message handler for the audio worklet
 */
function setupAudioWorkletMessageHandler(): void {
  if (!audioWorkletNode) return

  audioWorkletNode.port.onmessage = async event => {
    if (!isRecording.value) return

    if (event.data.event === 'chunk') {
      const int16Buffer = event.data.data.int16arrayBuffer
      try {
        const base64Chunk = arrayBufferToBase64(int16Buffer)
        if (webSocketStatus.value === 'OPEN') {
          await conversationStore.sendAudioChunk(base64Chunk)
        } else {
          logger.warn('WebSocket closed while recording. Stopping.')
          handleRecordingError('WebSocket closed')
        }
      } catch (error) {
        logger.error('Error converting/sending worklet audio chunk:', error)
        handleRecordingError('Audio send error')
      }
    } else if (event.data.event === 'error') {
      logger.error('Error from AudioWorkletProcessor:', event.data.error)
      handleRecordingError('Audio processing error')
    }
  }
}

/**
 * Starts the audio recording process
 */
const startListening = async () => {
  if (!(await ensureWebSocketConnection())) {
    return
  }

  prepareUIForRecording()

  try {
    if (!(await setupAudioWorklet())) {
      throw new Error('Failed to set up audio worklet')
    }
  } catch (error) {
    logger.error('Error in startListening (getUserMedia or Worklet):', error)
    handleRecordingError(
      `Mic/Setup Error: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Cleans up audio resources
 */
function cleanupAudioResources(): void {
  if (mediaStreamSource && audioWorkletNode) {
    try {
      mediaStreamSource.disconnect(audioWorkletNode)
    } catch (e) {
      logger.warn('Error disconnecting mediaStreamSource:', e)
    }
  } else if (mediaStreamSource) {
    try {
      mediaStreamSource.disconnect()
    } catch (e) {
      logger.warn('Error disconnecting mediaStreamSource (no worklet):', e)
    }
  }

  if (audioWorkletNode && audioContext?.destination) {
    try {
      audioWorkletNode.port.close()
    } catch (e) {
      logger.warn('Error closing worklet port:', e)
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
      .catch(e => logger.warn('Error closing AudioContext:', e))
    audioContext = null
  }
}

/**
 * Handles completion of recording
 * @param {boolean} manualStop Whether the recording was stopped manually
 */
function handleRecordingCompletion(
  wasRecording: boolean,
  manualStop: boolean
): void {
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
      logger.info('Manual stop: Discarding current user audio input.')
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

/**
 * Stops the audio recording
 * @param {boolean} manualStop Whether the recording was stopped manually
 */
const stopListening = (manualStop = false) => {
  if (!isRecording.value && !audioStreamForRecorder && !audioContext) {
    isRecording.value = false
    isRecordingRequested.value = false
    return
  }

  const wasRecording = isRecording.value
  isRecording.value = false

  cleanupAudioResources()

  handleRecordingCompletion(wasRecording, manualStop)
}

/**
 * Handles recording errors
 * @param {string} contextMessage Error message
 */
const handleRecordingError = (contextMessage: string = 'Recording error.') => {
  logger.error(`handleRecordingError called: ${contextMessage}`)
  statusMessage.value = contextMessage
  isRecordingRequested.value = false
  stopListening(true)
  if (!isPlaying.value) updateVideo.value('STAND_BY')
}

/**
 * Toggles recording state on/off
 */
const toggleRecording = () => {
  if (!isRecordingRequested.value) {
    startRecording()
  } else {
    stopRecording()
  }
}

/**
 * Starts recording
 */
function startRecording(): void {
  if (isPlaying.value) {
    logger.info('User started recording, interrupting playback.')
    generalStore.forceStopAudioPlayback()
    setTimeout(() => {
      isRecordingRequested.value = true
      startListening()
    }, 50)
  } else {
    isRecordingRequested.value = true
    startListening()
  }
}

/**
 * Stops recording
 */
function stopRecording(): void {
  isRecordingRequested.value = false
  statusMessage.value = 'Ready'
  if (isPlaying.value) {
    logger.info('User stopped recording, stopping playback.')
    generalStore.forceStopAudioPlayback()
  }
  stopListening(true)
}

/**
 * Processes a text request
 * @param {string} text Text to process
 */
const processRequest = async (text: string) => {
  if (!text.trim()) return

  if (isRecording.value || isRecordingRequested.value) {
    logger.info('User sent text while recording, stopping recording first.')
    isRecordingRequested.value = false
    stopListening(true)
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  if (isPlaying.value) {
    logger.info('User sent text, stopping playback.')
    generalStore.forceStopAudioPlayback()
  }

  await conversationStore.sendTextMessage(text)
  scrollChat()
}

/**
 * Initiates screenshot process
 */
const takeScreenShot = async () => {
  if (!isElectron) {
    statusMessage.value = 'Screenshots not available.'
    return
  }

  if (takingScreenShot.value) {
    logger.warn('Screenshot process already in progress.')
    return
  }

  if (isRecording.value || isRecordingRequested.value) {
    logger.info('Stopping recording before taking screenshot.')
    isRecordingRequested.value = false
    stopListening(true)
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  if (isPlaying.value) {
    logger.info('Stopping playback before taking screenshot.')
    generalStore.forceStopAudioPlayback()
  }

  takingScreenShot.value = true
  statusMessage.value = 'Select screen area...'
  try {
    await window.ipcRenderer.invoke('show-overlay')
  } catch (error) {
    logger.error('Error showing overlay:', error)
    statusMessage.value = 'Overlay Error'
    takingScreenShot.value = false
  }
}

/**
 * Process captured screenshot
 */
async function processScreenshot(dataURI: string): Promise<void> {
  try {
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
  } catch (error) {
    logger.error('Error processing screenshot data:', error)
    throw error
  }
}

/**
 * Scrolls chat to the latest message
 */
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

/**
 * Component initialization
 */
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
        logger.warn(`Video play failed for ${type}:`, error)
        setTimeout(
          () =>
            videoElement
              .play()
              .catch(e => logger.warn('Retry play failed:', e)),
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
    logger.error('Failed to initialize Gemini session on mount:', error)
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
          await processScreenshot(dataURI)
        } else {
          throw new Error('Received invalid data URI for screenshot.')
        }
      } catch (error) {
        logger.error('Error processing screenshot:', error)
        statusMessage.value = 'Screenshot Error'
        updateVideo.value('STAND_BY')
      } finally {
        takingScreenShot.value = false
        window.ipcRenderer
          .invoke('hide-overlay')
          .catch(err => logger.error('Error hiding overlay:', err))
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

/**
 * Clean up on component unmount
 */
onUnmounted(() => {
  stopListening(true)
  if (isPlaying.value) generalStore.forceStopAudioPlayback()
  conversationStore.closeSession()

  if (isElectron) window.ipcRenderer.removeAllListeners('screenshot-captured')

  if (audioContext && audioContext.state !== 'closed') {
    audioContext
      .close()
      .catch(e => logger.warn('Error closing AudioContext on unmount:', e))
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
