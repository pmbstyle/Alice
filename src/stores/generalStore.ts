import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useGeneralStore = defineStore('general', () => {
  const messages = ref<any>([])
  const provider = ref<string>('')

  const recognizedText = ref<string>('')
  const isRecordingRequested = ref<boolean>(false)
  const isRecording = ref<boolean>(false)
  const audioPlayer = ref<HTMLAudioElement | null>(null)
  const aiVideo = ref<HTMLVideoElement | null>(null)
  const videoSource = ref<string>('')
  const isPlaying = ref<boolean>(false)
  const isInProgress = ref<boolean>(false)
  const isProcessingRequest = ref<boolean>(false)
  const chatHistory = ref<
    {
      role: string
      content: {
        type: 'text'
        text: { value: string; annotations: any[] }[]
      }[]
      id?: string
    }[]
  >([])

  const statusMessage = ref<string>('Ready to chat')
  const audioContext = ref<AudioContext | null>(null)
  const audioSource = ref<AudioBufferSourceNode | null>(null)
  const chatInput = ref<string>('')

  const openChat = ref<boolean>(false)
  const isMinimized = ref<boolean>(false)

  const storeMessage = ref<boolean>(false)

  const takingScreenShot = ref<boolean>(false)
  const updateVideo = ref<(type: string) => void>(() => {})

  const setProvider = (provider: string) => {
    provider = provider || 'openai'
  }

  return {
    provider,
    setProvider,
    messages,
    recognizedText,
    isRecordingRequested,
    isRecording,
    audioPlayer,
    aiVideo,
    videoSource,
    isPlaying,
    isInProgress,
    isProcessingRequest,
    chatHistory,
    statusMessage,
    audioContext,
    audioSource,
    chatInput,
    openChat,
    isMinimized,
    storeMessage,
    takingScreenShot,
    updateVideo,
  }
})
