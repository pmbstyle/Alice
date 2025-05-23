import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { setVideo } from '../utils/videoProcess'
import type { ChatMessage, AppChatMessageContentPart } from './openAIStore'
import type { OpenAI } from 'openai'

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
  const recognizedText = ref<string>('')
  const chatHistory = ref<ChatMessage[]>([])
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

  const queueAudioForPlayback = (audioResponse: Response): boolean => {
    if (!isTTSEnabled.value) return false
    audioQueue.value.push(audioResponse)
    return true
  }

  const findMessageIndexByTempId = (tempId: string): number => {
    return chatHistory.value.findIndex(m => m.local_id_temp === tempId)
  }

  const addMessageToHistory = (message: ChatMessage): string => {
    const localId =
      message.local_id_temp ||
      `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const messageWithId = { ...message, local_id_temp: localId }

    chatHistory.value.unshift(messageWithId)
    return localId
  }

  const updateMessageApiIdByTempId = (tempId: string, apiMsgId: string) => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      chatHistory.value[index].api_message_id = apiMsgId
    } else {
      console.warn(
        `updateMessageApiIdByTempId: Message with tempId ${tempId} not found.`
      )
    }
  }

  const appendMessageDeltaByTempId = (tempId: string, delta: string) => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      const message = chatHistory.value[index]
      if (
        typeof message.content !== 'string' &&
        Array.isArray(message.content)
      ) {
        let firstTextPart = message.content.find(p => p.type === 'app_text') as
          | AppChatMessageContentPart
          | undefined

        if (!firstTextPart) {
          firstTextPart = { type: 'app_text', text: '' }
          message.content.unshift(firstTextPart)
        }
        firstTextPart.text = (firstTextPart.text || '') + delta
      } else if (typeof message.content === 'string') {
        message.content += delta
      } else {
        console.warn(
          `appendMessageDeltaByTempId: Message (tempId ${tempId}) has unexpected content structure. Initializing with delta.`,
          message.content
        )
        message.content = [{ type: 'app_text', text: delta }]
      }
    } else {
      console.warn(
        `appendMessageDeltaByTempId: Message with tempId ${tempId} not found.`
      )
    }
  }

  const updateMessageContentByTempId = (
    tempId: string,
    newContentText: string
  ) => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      chatHistory.value[index].content = [
        { type: 'app_text', text: newContentText },
      ]
    } else {
      console.warn(
        `updateMessageContentByTempId: Message with tempId ${tempId} not found.`
      )
    }
  }

  const updateMessageApiResponseIdByTempId = (tempId: string, apiResponseId: string) => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      chatHistory.value[index].api_response_id = apiResponseId
    }
  }

  const addToolCallToMessageByTempId = (
    tempId: string,
    toolCall: any
  ) => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      if (!chatHistory.value[index].tool_calls) {
        chatHistory.value[index].tool_calls = []
      }
      if (
        !chatHistory.value[index].tool_calls!.find((tc: any) => tc.id === toolCall.id)
      ) {
        chatHistory.value[index].tool_calls!.push(toolCall)
      }
    } else {
      console.warn(
        `addToolCallToMessageByTempId: Message with tempId ${tempId} not found.`
      )
    }
  }

  const updateMessageToolCallsByTempId = (
    tempId: string,
    toolCalls: any[]
  ) => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      chatHistory.value[index].tool_calls = toolCalls
    } else {
      console.warn(
        `updateMessageToolCallsByTempId: Message with tempId ${tempId} not found.`
      )
    }
  }

  const stopPlaybackAndClearQueue = () => {
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
    setAudioState,
    queueAudioForPlayback,
    addMessageToHistory,
    updateMessageApiIdByTempId,
    appendMessageDeltaByTempId,
    updateMessageContentByTempId,
    updateMessageApiResponseIdByTempId,
    addToolCallToMessageByTempId,
    updateMessageToolCallsByTempId,
    stopPlaybackAndClearQueue,
  }
})
