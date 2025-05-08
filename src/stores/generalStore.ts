import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { setVideo } from '../utils/videoProcess'

export type AudioState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING_AUDIO'
  | 'WAITING_FOR_RESPONSE'
  | 'SPEAKING'
  | 'CONFIG'

export const useGeneralStore = defineStore('general', () => {
  const audioState = ref<AudioState>('IDLE')
  const isRecordingRequested = ref<boolean>(false)
  const isTTSEnabled = ref<boolean>(true)

  const provider = ref<string>('')
  const recognizedText = ref<string>('')
  const chatHistory = ref<
    {
      role: string
      content: {
        type: 'text'
        text: { value: string; annotations: any[] }
      }[]
      id?: string
    }[]
  >([])
  const chatInput = ref<string>('')
  const statusMessage = ref<string>('Stand by')
  const openSidebar = ref<boolean>(false)
  const isMinimized = ref<boolean>(false)
  const takingScreenShot = ref<boolean>(false)

  const audioPlayer = ref<HTMLAudioElement | null>(null)
  const aiVideo = ref<HTMLVideoElement | null>(null)
  const videoSource = ref<string>(setVideo('STAND_BY'))
  const audioQueue = ref<Response[]>([])

  const storeMessage = ref<boolean>(false)
  const sideBarView = ref<string>('')
  const forceOpenSettings = ref<boolean>(false)

  const setProvider = (providerName: string) => {
    provider.value = providerName || 'openai'
  }

  const setAudioState = (newState: AudioState) => {
    if (audioState.value === newState) return
    console.log(`Audio state changing: ${audioState.value} -> ${newState}`)
    audioState.value = newState

    switch (newState) {
      case 'IDLE':
        statusMessage.value = isRecordingRequested.value
          ? 'Mic Ready'
          : 'Stand by'
        break
      case 'LISTENING':
        statusMessage.value = 'Listening...'
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

  const queueAudioForPlayback = (audioResponse: Response) => {
    if (!isTTSEnabled.value) {
      console.log('TTS disabled, discarding audio chunk.')
      return false
    }
    audioQueue.value.push(audioResponse)
    console.log(`Audio chunk added to queue. Size: ${audioQueue.value.length}`)
    return true
  }

  return {
    audioState,
    isRecordingRequested,
    isTTSEnabled,
    provider,
    recognizedText,
    chatHistory,
    chatInput,
    statusMessage,
    openSidebar,
    isMinimized,
    takingScreenShot,
    storeMessage,
    audioPlayer,
    aiVideo,
    videoSource,
    audioQueue,
    setProvider,
    setAudioState,
    queueAudioForPlayback,
    forceOpenSettings,
    sideBarView,
  }
})
