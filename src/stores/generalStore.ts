import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import eventBus from '../utils/eventBus'
import type { ChatMessage } from '../types/chat'
import { createHistoryManager } from '../modules/conversation/historyManager'
import { useCustomAvatarsStore } from './customAvatarsStore'

export type AudioState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING_AUDIO'
  | 'WAITING_FOR_RESPONSE'
  | 'SPEAKING'
  | 'CONFIG'
  | 'GENERATING_IMAGE'

export const useGeneralStore = defineStore('general', () => {
  const customAvatarsStore = useCustomAvatarsStore()
  const audioState = ref<AudioState>('IDLE')
  const isRecordingRequested = ref<boolean>(false)
  const isTTSEnabled = ref<boolean>(true)
  const recognizedText = ref<string>('')
  const chatHistory = ref<ChatMessage[]>([])
  const historyManager = createHistoryManager(chatHistory)
  const {
    addMessageToHistory,
    updateMessageApiIdByTempId,
    appendMessageDeltaByTempId,
    addContentPartToMessageByTempId,
    updateImageContentPartByGenerationId,
    updateMessageContentByTempId,
    updateMessageApiResponseIdByTempId,
    addToolCallToMessageByTempId,
    updateMessageToolCallsByTempId,
  } = historyManager
  const chatInput = ref<string>('')
  const statusMessage = ref<string>('Stand by')
  const openSidebar = ref<boolean>(false)
  const isMinimized = ref<boolean>(false)
  const takingScreenShot = ref<boolean>(false)
  const audioPlayer = ref<HTMLAudioElement | null>(null)
  const aiVideo = ref<HTMLVideoElement | null>(null)
  const avatarFallbackImage = ref<string | null>(null)
  const mediaReadyStateThreshold =
    typeof HTMLMediaElement !== 'undefined'
      ? HTMLMediaElement.HAVE_CURRENT_DATA
      : 2
  const videoSource = ref<string>(
    customAvatarsStore.builtInAvatar.stateVideos.standby
  )
  const audioQueue = ref<Response[]>([])
  const sideBarView = ref<string>('chat')
  const attachedFile = ref<File | null>(null)
  const awaitingWakeWord = ref<boolean>(false)
  const wakeWordDetected = ref<boolean>(false)

  const setAudioState = (newState: AudioState) => {
    if (audioState.value === newState) return
    audioState.value = newState
    switch (newState) {
      case 'IDLE':
        statusMessage.value = isRecordingRequested.value
          ? 'Mic Ready'
          : 'Stand by'
        break
      case 'LISTENING':
        statusMessage.value = awaitingWakeWord.value
          ? 'Waiting for wake word...'
          : 'Listening...'
        break
      case 'PROCESSING_AUDIO':
        statusMessage.value = 'Processing audio...'
        break
      case 'WAITING_FOR_RESPONSE':
        statusMessage.value = 'Thinking...'
        break
      case 'SPEAKING':
        statusMessage.value = 'Speaking...'
        break
      case 'CONFIG':
        statusMessage.value = 'Setting up...'
        break
      case 'GENERATING_IMAGE':
        statusMessage.value = 'Creating image...'
        break
      default:
        statusMessage.value = 'Unknown state'
        break
    }
  }

  const getVideoForState = (state: AudioState) => {
    const activeAvatar = customAvatarsStore.activeAvatar
    switch (state) {
      case 'SPEAKING':
        return activeAvatar.stateVideos.speaking
      case 'PROCESSING_AUDIO':
      case 'WAITING_FOR_RESPONSE':
      case 'GENERATING_IMAGE':
        return activeAvatar.stateVideos.thinking
      case 'CONFIG':
        return (
          activeAvatar.stateVideos.config ||
          customAvatarsStore.builtInAvatar.stateVideos.config ||
          activeAvatar.stateVideos.standby
        )
      case 'LISTENING':
      case 'IDLE':
      default:
        return activeAvatar.stateVideos.standby
    }
  }

  // Cache the current frame so the avatar circle never flashes empty between state swaps.
  const captureCurrentVideoFrame = (): string | null => {
    if (typeof document === 'undefined') return null
    if (!aiVideo.value) return null
    const videoEl = aiVideo.value
    const width = videoEl.videoWidth
    const height = videoEl.videoHeight
    if (!width || !height) return null

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null

    try {
      context.drawImage(videoEl, 0, 0, width, height)
      return canvas.toDataURL('image/jpeg', 0.85)
    } catch (error) {
      console.warn('Failed to capture avatar frame:', error)
      return null
    }
  }

  const updateAvatarFallbackImage = () => {
    const frame = captureCurrentVideoFrame()
    if (frame) {
      avatarFallbackImage.value = frame
    }
  }

  const syncVideoSource = (state: AudioState) => {
    const newSource = getVideoForState(state)
    if (!aiVideo.value) {
      videoSource.value = newSource
      return
    }
    if (videoSource.value !== newSource) {
      updateAvatarFallbackImage()
      videoSource.value = newSource
      aiVideo.value.load()
    }
    aiVideo.value
      .play()
      .catch(e => console.warn('Video play interrupted or failed:', e))
  }

  const handleVideoLoadedData = () => {
    updateAvatarFallbackImage()
  }

  watch(
    aiVideo,
    (newVideo, oldVideo) => {
      oldVideo?.removeEventListener('loadeddata', handleVideoLoadedData)
      if (newVideo) {
        newVideo.addEventListener('loadeddata', handleVideoLoadedData)
        if (newVideo.readyState >= mediaReadyStateThreshold) {
          updateAvatarFallbackImage()
        }
      }
    },
    { immediate: true }
  )

  watch(
    audioState,
    newState => {
      syncVideoSource(newState)
    },
    { immediate: true }
  )

  watch(
    () => customAvatarsStore.activeAvatarId,
    () => {
      syncVideoSource(audioState.value)
    }
  )

  customAvatarsStore.ensureInitialized().catch(error => {
    console.warn('Failed to initialize custom avatars store:', error)
  })

  const queueAudioForPlayback = (audioResponse: Response): boolean => {
    if (!isTTSEnabled.value) return false
    if (!audioResponse || audioResponse.status === 204) return false
    audioQueue.value.push(audioResponse)
    return true
  }

  const stopPlaybackAndClearQueue = () => {
    eventBus.emit('cancel-tts')
    if (audioPlayer.value) {
      audioPlayer.value.pause()
      if (audioPlayer.value.src && audioPlayer.value.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioPlayer.value.src)
      }
      audioPlayer.value.src = ''
      audioPlayer.value.onended = null
      audioPlayer.value.onerror = null
    }
    audioQueue.value = []
  }

  return {
    audioState,
    isRecordingRequested,
    isTTSEnabled,
    recognizedText,
    chatHistory,
    chatInput,
    statusMessage,
    openSidebar,
    isMinimized,
    takingScreenShot,
    audioPlayer,
    aiVideo,
    videoSource,
    avatarFallbackImage,
    audioQueue,
    sideBarView,
    attachedFile,
    awaitingWakeWord,
    wakeWordDetected,
    setAudioState,
    queueAudioForPlayback,
    addMessageToHistory,
    updateMessageApiIdByTempId,
    appendMessageDeltaByTempId,
    addContentPartToMessageByTempId,
    updateImageContentPartByGenerationId,
    updateMessageContentByTempId,
    updateMessageApiResponseIdByTempId,
    addToolCallToMessageByTempId,
    updateMessageToolCallsByTempId,
    stopPlaybackAndClearQueue,
  }
})
