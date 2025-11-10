import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { setVideo } from '../utils/videoProcess'
import eventBus from '../utils/eventBus'
import type { ChatMessage } from '../types/chat'
import { createHistoryManager } from '../modules/conversation/historyManager'

export type AudioState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING_AUDIO'
  | 'WAITING_FOR_RESPONSE'
  | 'SPEAKING'
  | 'CONFIG'
  | 'GENERATING_IMAGE'

export const useGeneralStore = defineStore('general', () => {
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
  const videoSource = ref<string>(setVideo('STAND_BY'))
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

  watch(
    audioState,
    newState => {
      if (aiVideo.value) {
        let targetVideoType = 'STAND_BY'
        switch (newState) {
          case 'SPEAKING':
            targetVideoType = 'SPEAKING'
            break
          case 'PROCESSING_AUDIO':
          case 'WAITING_FOR_RESPONSE':
          case 'GENERATING_IMAGE':
            targetVideoType = 'PROCESSING'
            break
          case 'CONFIG':
            targetVideoType = 'CONFIG'
            break
          case 'LISTENING':
          case 'IDLE':
          default:
            targetVideoType = 'STAND_BY'
            break
        }
        const newSource = setVideo(targetVideoType)
        if (videoSource.value !== newSource) {
          videoSource.value = newSource
          aiVideo.value.load()
          aiVideo.value
            .play()
            .catch(e => console.warn('Video play interrupted or failed:', e))
        } else if (aiVideo.value.paused) {
          aiVideo.value
            .play()
            .catch(e => console.warn('Video play interrupted or failed:', e))
        }
      }
    },
    { immediate: true }
  )

  const queueAudioForPlayback = (audioResponse: Response): boolean => {
    if (!isTTSEnabled.value) return false
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
