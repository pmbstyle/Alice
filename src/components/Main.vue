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
          <div ref="screenPreviewRef" class="screen-preview-container"></div>
          <Actions
            @takeScreenShot="takeScreenShot"
            @toggleRecording="toggleRecording"
            @toggleScreenShare="toggleScreenShare"
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
import { ScreenCapture } from '../utils/screenCapture.ts'

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
  isScreenSharing,
  screenStream,
} = storeToRefs(generalStore)

const { webSocketStatus } = storeToRefs(conversationStore)

const aiVideoRef = ref<HTMLVideoElement | null>(null)
const screenPreviewRef = ref<HTMLElement | null>(null)

let audioContext: AudioContext | null = null
let audioWorkletNode: AudioWorkletNode | null = null
let mediaStreamSource: MediaStreamAudioSourceNode | null = null
let audioStreamForRecorder: MediaStream | null = null

let screenCapture: ScreenCapture | null = null
let screenCaptureIntervalId: number | null = null
const screenCaptureFps = 5

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function ensureWebSocketConnection(): Promise<boolean> {
  if (webSocketStatus.value === 'OPEN') {
    return true
  }

  logger.warn(
    `Action attempted while WebSocket status is ${webSocketStatus.value}.`
  )

  if (webSocketStatus.value === 'CONNECTING') {
    statusMessage.value = 'Connecting... Please wait.'
    await new Promise(resolve => setTimeout(resolve, 700))
    if (webSocketStatus.value === 'OPEN') return true
    logger.error('WebSocket connection attempt timed out.')
    statusMessage.value = 'Connection Timeout.'
    return false
  }

  if (
    webSocketStatus.value === 'CLOSED' ||
    webSocketStatus.value === 'ERROR' ||
    webSocketStatus.value === 'IDLE'
  ) {
    logger.info('Attempting to re-initialize session...')
    statusMessage.value = 'Reconnecting...'
    try {
      await conversationStore.initializeSession()
      await new Promise(resolve => setTimeout(resolve, 700))
      if (webSocketStatus.value === 'OPEN') {
        logger.info('Reconnection successful.')
        statusMessage.value = 'Ready'
        return true
      } else {
        throw new Error(
          `Failed to reconnect, status is ${webSocketStatus.value}`
        )
      }
    } catch (error) {
      logger.error('Error during session re-initialization:', error)
      statusMessage.value = 'Connection Error.'
      return false
    }
  }

  logger.error(
    `Action blocked due to unexpected WebSocket status: ${webSocketStatus.value}`
  )
  statusMessage.value = 'Connection Issue'
  return false
}

function prepareUIForRecording(): void {
  statusMessage.value = 'Listening...'
  isRecording.value = true
  updateVideo.value('PROCESSING')

  chatHistory.value = chatHistory.value.filter(
    msg =>
      !(msg.role === 'user' && msg.parts[0]?.text?.startsWith('[User Speaking'))
  )

  const placeholderMessage: Content = {
    role: 'user',
    parts: [{ text: '[User Speaking...]' }],
  }
  chatHistory.value.unshift(placeholderMessage)
  storeMessage.value = false
}

async function setupAudioWorklet(): Promise<boolean> {
  try {
    if (audioContext && audioContext.state !== 'closed') {
      await audioContext
        .close()
        .catch(e => logger.warn('Closing prev AudioContext error:', e))
    }
    audioContext = new AudioContext({ sampleRate: 16000 })

    try {
      await audioContext.audioWorklet.addModule(
        '/js/worklets/audio-processor.js'
      )
    } catch (moduleError: any) {
      if (!moduleError.message.includes('already added')) throw moduleError
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
    logger.error('AudioWorklet setup error:', error)
    return false
  }
}

function setupAudioWorkletMessageHandler(): void {
  if (!audioWorkletNode) return
  audioWorkletNode.port.onmessage = async event => {
    if (!isRecording.value) return

    if (event.data.event === 'chunk') {
      const int16Buffer = event.data.data.int16arrayBuffer
      try {
        if (webSocketStatus.value !== 'OPEN') {
          logger.warn(
            `WebSocket not OPEN (${webSocketStatus.value}), skipping audio chunk send.`
          )
          if (isRecording.value) {
            handleRecordingError('WebSocket closed during send')
          }
          return
        }
        const base64Chunk = arrayBufferToBase64(int16Buffer)
        await conversationStore.sendAudioChunk(base64Chunk)
      } catch (error) {
        logger.error('Error sending audio chunk:', error)
        handleRecordingError('Audio send error')
      }
    } else if (event.data.event === 'error') {
      logger.error('AudioWorkletProcessor error:', event.data.error)
      handleRecordingError('Audio processing error')
    }
  }
}

const startListening = async () => {
  if (!(await ensureWebSocketConnection())) {
    isRecordingRequested.value = false
    return
  }

  if (isScreenSharing.value) {
    logger.info('Audio recording starting: Pausing screen frames.')
    stopScreenFrameInterval()
  }

  isRecordingRequested.value = true
  prepareUIForRecording()

  try {
    if (!(await setupAudioWorklet())) {
      throw new Error('Audio worklet setup failed')
    }
    logger.info('Audio recording started successfully.')
  } catch (error) {
    logger.error('Error during startListening:', error)
    handleRecordingError(
      `Mic/Setup Error: ${error instanceof Error ? error.message : String(error)}`
    )

    isRecording.value = false
    isRecordingRequested.value = false

    if (isScreenSharing.value) {
      logger.info('Resuming screen frames after failed audio start.')
      startScreenFrameInterval()
    }
  }
}

function cleanupAudioResources(): void {
  logger.debug('Cleaning up audio resources...')
  if (mediaStreamSource && audioWorkletNode)
    try {
      mediaStreamSource.disconnect(audioWorkletNode)
    } catch (e) {
      /* Ign */
    }
  else if (mediaStreamSource)
    try {
      mediaStreamSource.disconnect()
    } catch (e) {
      /* Ign */
    }
  if (audioWorkletNode)
    try {
      audioWorkletNode.port.close()
    } catch (e) {
      /* Ign */
    }
  if (audioStreamForRecorder) {
    audioStreamForRecorder.getTracks().forEach(track => track.stop())
    audioStreamForRecorder = null
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(e => logger.warn('AudioContext close error:', e))
    audioContext = null
  }
  mediaStreamSource = null
  audioWorkletNode = null
  logger.debug('Audio resources cleanup complete.')
}

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
      logger.info(
        'Recording ended naturally (end of speech?), completing user turn.'
      )
      storeMessage.value = true
      conversationStore.completeUserTurn()
    } else {
      logger.info('Manual stop: Discarding current audio input.')
      if (
        !isProcessingRequest.value &&
        !isPlaying.value &&
        !isScreenSharing.value
      ) {
        statusMessage.value = 'Ready'
        updateVideo.value('STAND_BY')
      } else if (isScreenSharing.value) {
        statusMessage.value = 'Screen sharing active'
      }
    }
  } else {
    isRecordingRequested.value = false
    if (statusMessage.value === 'Listening...') {
      if (
        !isPlaying.value &&
        !isProcessingRequest.value &&
        !isScreenSharing.value
      ) {
        statusMessage.value = 'Ready'
        updateVideo.value('STAND_BY')
      } else if (isScreenSharing.value) {
        statusMessage.value = 'Screen sharing active'
      }
    }
  }
}

const stopListening = (manualStop = false) => {
  if (!isRecording.value && !audioStreamForRecorder) {
    isRecording.value = false
    isRecordingRequested.value = false
    return
  }
  const wasRecording = isRecording.value
  isRecording.value = false

  cleanupAudioResources()
  handleRecordingCompletion(wasRecording, manualStop)

  if (isScreenSharing.value && manualStop) {
    logger.info('Audio stopped manually: Resuming screen frames.')
    startScreenFrameInterval()
  } else if (isScreenSharing.value && !manualStop) {
    logger.info('Audio stopped naturally: Screen sharing remains paused.')
  }
}

const handleRecordingError = (contextMessage: string = 'Recording error.') => {
  logger.error(`Recording Error: ${contextMessage}`)
  statusMessage.value = `Mic Error: ${contextMessage.substring(0, 30)}`
  isRecordingRequested.value = false
  stopListening(true)
  if (
    !isPlaying.value &&
    !isProcessingRequest.value &&
    !isScreenSharing.value
  ) {
    updateVideo.value('STAND_BY')
  }
}

const toggleRecording = () => {
  if (!isRecordingRequested.value) startRecording()
  else stopRecording()
}

function startRecording(): void {
  if (isPlaying.value) {
    logger.info('Interrupting playback to start recording.')
    generalStore.forceStopAudioPlayback()
    setTimeout(() => {
      startListening()
    }, 100)
  } else {
    startListening()
  }
}

function stopRecording(): void {
  logger.info('Manual stop recording requested.')
  isRecordingRequested.value = false
  stopListening(true)
}

const processRequest = async (text: string) => {
  if (!text.trim()) return
  if (!(await ensureWebSocketConnection())) {
    statusMessage.value = 'Cannot send: Not connected.'
    return
  }

  let wasRecording = isRecording.value || isRecordingRequested.value
  let wasSharing = isScreenSharing.value
  let didPauseSharing = false

  if (wasRecording) {
    logger.info('Stopping recording for text.')
    stopRecording()
    await new Promise(r => setTimeout(r, 150))
  }
  if (isPlaying.value) {
    logger.info('Stopping playback for text.')
    generalStore.forceStopAudioPlayback()
    await new Promise(r => setTimeout(r, 50))
  }
  if (wasSharing) {
    logger.info('Pausing screen share for text.')
    stopScreenFrameInterval()
    didPauseSharing = true
  }

  try {
    await conversationStore.sendTextMessage(text)
  } catch (error) {
    logger.error('Failed to send text message:', error)
    statusMessage.value = 'Error sending message.'
    return
  }

  if (didPauseSharing && isScreenSharing.value) {
    await new Promise(r => setTimeout(r, 300))
    logger.info('Resuming screen frames after text input.')
    startScreenFrameInterval()
  }
}

const takeScreenShot = async () => {
  if (!isElectron) {
    statusMessage.value = 'Screenshots unavailable.'
    return
  }
  if (takingScreenShot.value || isScreenSharing.value) {
    logger.warn('Screenshot/Share busy.')
    return
  }

  let wasRecording = isRecording.value || isRecordingRequested.value
  if (wasRecording) {
    logger.info('Stopping recording for screenshot.')
    stopRecording()
    await new Promise(r => setTimeout(r, 100))
  }
  if (isPlaying.value) {
    logger.info('Stopping playback for screenshot.')
    generalStore.forceStopAudioPlayback()
    await new Promise(r => setTimeout(r, 50))
  }

  takingScreenShot.value = true
  statusMessage.value = 'Select screen area...'
  try {
    await window.ipcRenderer.invoke('show-overlay')
  } catch (error) {
    logger.error('Overlay error:', error)
    statusMessage.value = 'Overlay Error'
    takingScreenShot.value = false
  }
}

async function processScreenshot(dataURI: string): Promise<void> {
  try {
    const base64Data = dataURI.split(',')[1]
    if (!base64Data) throw new Error('Could not extract Base64 data.')
    await conversationStore.sendImageInput(
      base64Data,
      'image/png',
      'Describe this screenshot.'
    )
  } catch (error) {
    logger.error('Screenshot processing error:', error)
    throw error
  }
}

const startScreenFrameInterval = () => {
  stopScreenFrameInterval()

  if (!isScreenSharing.value || !screenCapture?.isInitialized) {
    logger.warn('Conditions not met to start screen frame interval.')
    return
  }
  if (isRecording.value || isRecordingRequested.value) {
    logger.info(
      'Audio recording active, deferring screen frame interval start.'
    )
    return
  }

  const intervalMs = 1000 / screenCaptureFps
  logger.info(`Starting screen frame interval (${screenCaptureFps} FPS)`)

  screenCaptureIntervalId = window.setInterval(async () => {
    if (
      !isScreenSharing.value ||
      !screenCapture?.isInitialized ||
      isRecording.value ||
      isRecordingRequested.value ||
      webSocketStatus.value !== 'OPEN'
    ) {
      const reason = !isScreenSharing.value
        ? 'sharing stopped'
        : !screenCapture?.isInitialized
          ? 'capture not init'
          : isRecording.value || isRecordingRequested.value
            ? 'recording started'
            : 'WebSocket not OPEN'
      logger.warn(`Stopping screen frame interval (${reason}).`)
      stopScreenFrameInterval()
      if (webSocketStatus.value !== 'OPEN' && isScreenSharing.value) {
        logger.error(
          'WebSocket closed during screen share interval. Stopping flow.'
        )
        await stopScreenShareFlow()
      }
      return
    }

    const imageData = await screenCapture.capture()
    if (imageData) {
      try {
        conversationStore.sendScreenFrame(imageData).catch(async err => {
          logger.error('Error sending screen frame:', err)
          if (
            err instanceof Error &&
            (err.message.includes('CLOSED') ||
              err.message.includes('WebSocket not ready'))
          ) {
            logger.error(
              'Stopping screen share due to send error (WebSocket closed).'
            )
            await stopScreenShareFlow()
          }
        })
      } catch (sendError) {
        logger.error('Sync error during sendScreenFrame call:', sendError)
      }
    }
  }, intervalMs)
}

const stopScreenFrameInterval = () => {
  if (screenCaptureIntervalId) {
    clearInterval(screenCaptureIntervalId)
    screenCaptureIntervalId = null
    logger.info('Screen capture interval cleared.')
  }
}

const initializeScreenCapture = () => {
  if (!isElectron || screenCapture) return
  logger.info('Initializing ScreenCapture instance...')
  screenCapture = new ScreenCapture({
    width: 640,
    quality: 0.5,
    onStop: () => {
      logger.info('onStop callback triggered (browser UI/track ended).')
      if (isScreenSharing.value) {
        stopScreenFrameInterval()
        stopScreenShareFlow()
      } else {
        logger.warn('onStop called but isScreenSharing is already false.')
      }
    },
  })
  nextTick(() => {
    if (screenPreviewRef.value)
      screenCapture!.setPreviewElement(screenPreviewRef.value)
  })
}

const startScreenShareFlow = async () => {
  if (!isElectron) {
    statusMessage.value = 'Screen sharing unavailable.'
    return
  }
  if (isScreenSharing.value || takingScreenShot.value) {
    logger.warn('Share/Screenshot busy.')
    return
  }
  if (!(await ensureWebSocketConnection())) {
    statusMessage.value = 'Cannot start share: Not connected.'
    return
  }

  if (isRecording.value || isRecordingRequested.value) {
    logger.info('Stopping recording for share.')
    stopRecording()
    await new Promise(r => setTimeout(r, 100))
  }
  if (isPlaying.value) {
    logger.info('Stopping playback for share.')
    generalStore.forceStopAudioPlayback()
    await new Promise(r => setTimeout(r, 50))
  }

  initializeScreenCapture()

  try {
    statusMessage.value = 'Starting screen share...'
    updateVideo.value('PROCESSING')
    logger.warn('Current implementation shares the primary screen only.')
    statusMessage.value = 'Starting share (Primary Screen)...'

    const stream = await screenCapture!.initialize()
    screenStream.value = stream
    isScreenSharing.value = true
    statusMessage.value = 'Screen sharing active'
    logger.info('Screen sharing started successfully.')
    startScreenFrameInterval()
  } catch (error: any) {
    logger.error('Failed to start screen sharing:', error)
    statusMessage.value = `Screen Share Error: ${error.message.substring(0, 40)}`

    isScreenSharing.value = false
    screenStream.value = null
    if (!isProcessingRequest.value && !isPlaying.value && !isRecording.value)
      updateVideo.value('STAND_BY')
  }
}

const stopScreenShareFlow = async () => {
  if (
    !isScreenSharing.value &&
    !screenCapture?.isInitialized &&
    !screenCaptureIntervalId
  ) {
    logger.info('Stop screen share called but seems already stopped/cleaned.')
    isScreenSharing.value = false
    return
  }
  logger.info('Stopping screen share flow...')
  stopScreenFrameInterval()

  if (screenCapture) {
    screenCapture.dispose()
  }

  screenStream.value = null
  isScreenSharing.value = false

  if (!isProcessingRequest.value && !isPlaying.value && !isRecording.value) {
    statusMessage.value = 'Ready'
    updateVideo.value('STAND_BY')
  } else {
    if (statusMessage.value === 'Screen sharing active') {
      statusMessage.value = 'Screen sharing stopped'
    }
  }
  logger.info('Screen sharing stopped.')
}

const toggleScreenShare = async () => {
  if (isScreenSharing.value) await stopScreenShareFlow()
  else await startScreenShareFlow()
}

onMounted(async () => {
  generalStore.aiVideo = aiVideoRef.value

  generalStore.updateVideo = async (type: string) => {
    const newSrc = setVideo(type)
    const videoElement = generalStore.aiVideo
    if (!videoElement) return
    const currentFullUrl = videoElement.currentSrc
    const newFullUrl = new URL(newSrc, window.location.href).href

    if (currentFullUrl !== newFullUrl) {
      logger.debug(`Updating video source to: ${type}`)
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
    } else if (videoElement.paused) {
      try {
        await videoElement.play()
      } catch (e) {
        /* Ignore */
      }
    }
  }

  try {
    if (isElectron) initializeScreenCapture()
    await conversationStore.initializeSession()

    if (webSocketStatus.value === 'OPEN') {
      statusMessage.value = 'Ready'
      generalStore.updateVideo('STAND_BY')
    } else if (webSocketStatus.value !== 'CONNECTING') {
      statusMessage.value = 'Connection Error.'
      generalStore.updateVideo('STAND_BY')
    } else {
      statusMessage.value = 'Connecting...'
      generalStore.updateVideo('PROCESSING')
    }
  } catch (error) {
    logger.error('Mount init error:', error)
    statusMessage.value = 'Initialization Failed.'
    generalStore.updateVideo('STAND_BY')
  }

  if (isElectron) {
    window.ipcRenderer?.on('screenshot-captured', async () => {
      if (!takingScreenShot.value) return
      try {
        statusMessage.value = 'Processing screenshot...'
        updateVideo.value('PROCESSING')
        const dataURI = await window.ipcRenderer?.invoke('get-screenshot')
        if (dataURI && typeof dataURI === 'string')
          await processScreenshot(dataURI)
        else throw new Error('Invalid screenshot data URI.')
      } catch (error) {
        logger.error('Screenshot processing error:', error)
        statusMessage.value = 'Screenshot Error'
        updateVideo.value('STAND_BY')
      } finally {
        takingScreenShot.value = false
        window.ipcRenderer
          ?.invoke('hide-overlay')
          .catch(err => logger.error('Error hiding overlay:', err))
      }
    })
  }

  watch(webSocketStatus, (newStatus, oldStatus) => {
    logger.info(`WebSocket Status changed: ${oldStatus} -> ${newStatus}`)
    if (newStatus === 'ERROR' || newStatus === 'CLOSED') {
      statusMessage.value =
        newStatus === 'ERROR' ? 'Connection Error' : 'Disconnected'
      if (isRecording.value || isRecordingRequested.value)
        handleRecordingError('Connection lost')
      if (isPlaying.value) generalStore.forceStopAudioPlayback()
      if (isScreenSharing.value) {
        logger.warn('WS closed/error, stopping screen share.')
        stopScreenShareFlow()
      }
      if (!isPlaying.value && !isRecording.value && !isScreenSharing.value)
        updateVideo.value('STAND_BY')
    } else if (newStatus === 'OPEN' && oldStatus !== 'OPEN') {
      if (
        !isPlaying.value &&
        !isRecording.value &&
        !isProcessingRequest.value &&
        !isScreenSharing.value
      ) {
        statusMessage.value = 'Ready'
        updateVideo.value('STAND_BY')
      }
    } else if (newStatus === 'CONNECTING') {
      statusMessage.value = 'Connecting...'
      if (!isPlaying.value && !isRecording.value)
        updateVideo.value('PROCESSING')
    }
  })

  watch(
    screenPreviewRef,
    newEl => {
      if (screenCapture && newEl) screenCapture.setPreviewElement(newEl)
      else if (screenCapture && !newEl) screenCapture.setPreviewElement(null)
    },
    { immediate: true }
  )
})

onUnmounted(() => {
  logger.info('Main component unmounting...')
  stopListening(true)
  if (isPlaying.value) generalStore.forceStopAudioPlayback()
  stopScreenShareFlow()
  conversationStore.closeSession()
  if (isElectron) window.ipcRenderer?.removeAllListeners('screenshot-captured')
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(e => logger.warn('AudioCtx close error:', e))
  }
  if (screenCapture) {
    screenCapture.dispose()
    screenCapture = null
  }
  logger.info('Main component cleanup complete.')
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
.screen-preview-container {
  position: absolute;
  bottom: 70px;
  left: 10px;
  width: 160px;
  height: 90px;
  background-color: rgba(0, 0, 0, 0.6);
  border: 1px solid #555;
  border-radius: 4px;
  overflow: hidden;
  z-index: 30;
  display: none;
}
.screen-preview-container video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.avatar-wrapper.mini .screen-preview-container {
  width: 80px;
  height: 45px;
  bottom: 40px;
  left: 5px;
}
</style>
