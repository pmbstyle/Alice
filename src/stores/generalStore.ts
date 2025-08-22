import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { setVideo } from '../utils/videoProcess'
import eventBus from '../utils/eventBus'
import type { AppChatMessageContentPart } from '../types/chat'

export type AudioState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING_AUDIO'
  | 'WAITING_FOR_RESPONSE'
  | 'SPEAKING'
  | 'CONFIG'
  | 'GENERATING_IMAGE'

export interface AppChatMessageContentPart {
  type: 'app_text' | 'app_image_uri' | 'app_generated_image_path' | 'app_file'
  text?: string
  uri?: string
  path?: string
  absolutePathForOpening?: string
  imageGenerationId?: string
  isPartial?: boolean
  partialIndex?: number
  fileId?: string
  fileName?: string
}

export interface ChatMessage {
  local_id_temp?: string
  api_message_id?: string
  api_response_id?: string
  role: 'user' | 'assistant' | 'system' | 'developer' | 'tool'
  content: string | AppChatMessageContentPart[]
  tool_call_id?: string
  name?: string
  tool_calls?: any[]
}

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
        statusMessage.value = awaitingWakeWord.value ? 'Waiting for wake word...' : 'Listening...'
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

  const findMessageIndexByTempId = (tempId: string): number => {
    return chatHistory.value.findIndex(m => m.local_id_temp === tempId)
  }

  const addMessageToHistory = (message: ChatMessage): string => {
    const localId =
      message.local_id_temp ||
      `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    const messageToStore: ChatMessage = {
      ...message,
      local_id_temp: localId,
      content: Array.isArray(message.content)
        ? message.content.map(part => ({ ...part }))
        : message.content,
    }

    chatHistory.value.unshift(messageToStore)
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
      if (typeof message.content === 'string') {
        message.content = [{ type: 'app_text', text: message.content }]
      } else if (!Array.isArray(message.content)) {
        message.content = []
      }

      let firstTextPart = message.content.find(p => p.type === 'app_text') as
        | AppChatMessageContentPart
        | undefined

      if (!firstTextPart) {
        firstTextPart = { type: 'app_text', text: '' }
        message.content.unshift(firstTextPart)
      }
      firstTextPart.text = (firstTextPart.text || '') + delta

      const fullText = firstTextPart.text
      if (
        fullText.match(/^Error:\s*\d+\s+/) ||
        fullText.match(/^Error:\s*[A-Za-z]/)
      ) {
        const errorText = fullText.replace(/^Error:\s*/i, '')
        const errorContent = {
          type: 'app_error' as const,
          text: errorText,
          errorType: 'api_error',
          errorCode: null,
          errorParam: null,
          originalError: { message: errorText },
        }

        const textIndex = message.content.findIndex(p => p.type === 'app_text')
        if (textIndex !== -1) {
          message.content[textIndex] = errorContent
        }
      }
    } else {
      console.warn(
        `[GeneralStore appendMessageDelta] Message with tempId ${tempId} not found for delta: "${delta.substring(0, 30)}..."`
      )
    }
  }

  const addContentPartToMessageByTempId = (
    tempId: string,
    part: AppChatMessageContentPart
  ) => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      const message = chatHistory.value[index]
      if (typeof message.content === 'string') {
        message.content = [{ type: 'app_text', text: message.content }, part]
      } else if (Array.isArray(message.content)) {
        message.content.push(part)
      } else {
        message.content = [part]
      }
    } else {
      console.warn(
        `[GeneralStore addContentPartToMessageByTempId] Message with tempId ${tempId} not found.`
      )
    }
  }

  const updateImageContentPartByGenerationId = (
    tempMessageId: string,
    imageGenerationId: string,
    newPath: string,
    newAbsolutePath: string,
    isPartialUpdate: boolean,
    partialIndexUpdate?: number
  ) => {
    const messageIndex = findMessageIndexByTempId(tempMessageId)
    if (messageIndex !== -1) {
      const message = chatHistory.value[messageIndex]
      if (Array.isArray(message.content)) {
        let imagePartIndex = message.content.findIndex(
          p =>
            p.type === 'app_generated_image_path' &&
            p.imageGenerationId === imageGenerationId
        )

        if (imagePartIndex !== -1) {
          const partToUpdate = message.content[
            imagePartIndex
          ] as AppChatMessageContentPart
          partToUpdate.path = newPath
          partToUpdate.absolutePathForOpening = newAbsolutePath
          partToUpdate.isPartial = isPartialUpdate
          if (isPartialUpdate && partialIndexUpdate !== undefined) {
            partToUpdate.partialIndex = partialIndexUpdate
          } else if (!isPartialUpdate) {
            delete partToUpdate.partialIndex
          }
        } else {
          message.content.push({
            type: 'app_generated_image_path',
            path: newPath,
            absolutePathForOpening: newAbsolutePath,
            imageGenerationId: imageGenerationId,
            isPartial: isPartialUpdate,
            partialIndex: partialIndexUpdate,
          })
        }
      } else {
        message.content = [
          {
            type: 'app_generated_image_path',
            path: newPath,
            absolutePathForOpening: newAbsolutePath,
            imageGenerationId: imageGenerationId,
            isPartial: isPartialUpdate,
            partialIndex: partialIndexUpdate,
          },
        ]
      }
    } else {
      console.warn(
        `[GeneralStore updateImagePart] Message with tempId ${tempMessageId} not found.`
      )
    }
  }

  const updateMessageContentByTempId = (
    tempId: string,
    newContent: string | any[]
  ) => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      if (typeof newContent === 'string') {
        chatHistory.value[index].content = [
          { type: 'app_text', text: newContent },
        ]
      } else {
        chatHistory.value[index].content = newContent
      }
    } else {
      console.warn(
        `updateMessageContentByTempId: Message with tempId ${tempId} not found.`
      )
    }
  }

  const updateMessageApiResponseIdByTempId = (
    tempId: string,
    apiResponseId: string
  ) => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      chatHistory.value[index].api_response_id = apiResponseId
    }
  }

  const addToolCallToMessageByTempId = (tempId: string, toolCall: any) => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      if (!chatHistory.value[index].tool_calls) {
        chatHistory.value[index].tool_calls = []
      }
      if (
        !chatHistory.value[index].tool_calls!.find(
          (tc: any) => tc.id === toolCall.id
        )
      ) {
        chatHistory.value[index].tool_calls!.push(toolCall)
      }
    } else {
      console.warn(
        `addToolCallToMessageByTempId: Message with tempId ${tempId} not found.`
      )
    }
  }

  const updateMessageToolCallsByTempId = (tempId: string, toolCalls: any[]) => {
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
