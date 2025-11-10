import type { Ref } from 'vue'
import type {
  AppChatMessageContentPart,
  ChatMessage,
} from '../../types/chat'

function generateLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export interface HistoryManager {
  addMessageToHistory(message: ChatMessage): string
  updateMessageApiIdByTempId(tempId: string, apiMsgId: string): void
  appendMessageDeltaByTempId(tempId: string, delta: string): void
  addContentPartToMessageByTempId(
    tempId: string,
    part: AppChatMessageContentPart
  ): void
  updateImageContentPartByGenerationId(
    tempMessageId: string,
    imageGenerationId: string,
    newPath: string,
    newAbsolutePath: string,
    isPartialUpdate: boolean,
    partialIndexUpdate?: number
  ): void
  updateMessageContentByTempId(
    tempId: string,
    newContent: string | AppChatMessageContentPart[]
  ): void
  updateMessageApiResponseIdByTempId(
    tempId: string,
    apiResponseId: string
  ): void
  addToolCallToMessageByTempId(tempId: string, toolCall: any): void
  updateMessageToolCallsByTempId(tempId: string, toolCalls: any[]): void
}

export function createHistoryManager(
  chatHistory: Ref<ChatMessage[]>
): HistoryManager {
  const findMessageIndexByTempId = (tempId: string): number => {
    return chatHistory.value.findIndex(m => m.local_id_temp === tempId)
  }

  const addMessageToHistory = (message: ChatMessage): string => {
    const localId = message.local_id_temp || generateLocalId()

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

  const updateMessageApiIdByTempId = (
    tempId: string,
    apiMsgId: string
  ): void => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      chatHistory.value[index].api_message_id = apiMsgId
    } else {
      console.warn(
        `updateMessageApiIdByTempId: Message with tempId ${tempId} not found.`
      )
    }
  }

  const ensureTextArray = (
    message: ChatMessage
  ): AppChatMessageContentPart[] => {
    if (typeof message.content === 'string') {
      message.content = [{ type: 'app_text', text: message.content }]
    } else if (!Array.isArray(message.content)) {
      message.content = []
    }
    return message.content as AppChatMessageContentPart[]
  }

  const appendMessageDeltaByTempId = (
    tempId: string,
    delta: string
  ): void => {
    const index = findMessageIndexByTempId(tempId)
    if (index === -1) {
      console.warn(
        `[HistoryManager appendMessageDelta] Message with tempId ${tempId} not found for delta: "${delta.substring(0, 30)}..."`
      )
      return
    }

    const message = chatHistory.value[index]
    const contentParts = ensureTextArray(message)

    let firstTextPart = contentParts.find(
      p => p.type === 'app_text'
    ) as AppChatMessageContentPart | undefined

    if (!firstTextPart) {
      firstTextPart = { type: 'app_text', text: '' }
      contentParts.unshift(firstTextPart)
    }
    firstTextPart.text = (firstTextPart.text || '') + delta

    const fullText = firstTextPart.text
    if (
      fullText.match(/^Error:\s*\d+\s+/) ||
      fullText.match(/^Error:\s*[A-Za-z]/)
    ) {
      const errorText = fullText.replace(/^Error:\s*/i, '')
      const errorContent: AppChatMessageContentPart = {
        type: 'app_error',
        text: errorText,
        errorType: 'api_error',
        errorCode: null,
        errorParam: null,
        originalError: { message: errorText },
      }

      const textIndex = contentParts.findIndex(p => p.type === 'app_text')
      if (textIndex !== -1) {
        contentParts[textIndex] = errorContent
      }
    }
  }

  const addContentPartToMessageByTempId = (
    tempId: string,
    part: AppChatMessageContentPart
  ): void => {
    const index = findMessageIndexByTempId(tempId)
    if (index === -1) {
      console.warn(
        `[HistoryManager addContentPart] Message with tempId ${tempId} not found.`
      )
      return
    }

    const message = chatHistory.value[index]
    if (typeof message.content === 'string') {
      message.content = [
        { type: 'app_text', text: message.content },
        part,
      ]
    } else if (Array.isArray(message.content)) {
      message.content.push(part)
    } else {
      message.content = [part]
    }
  }

  const updateImageContentPartByGenerationId = (
    tempMessageId: string,
    imageGenerationId: string,
    newPath: string,
    newAbsolutePath: string,
    isPartialUpdate: boolean,
    partialIndexUpdate?: number
  ): void => {
    const messageIndex = findMessageIndexByTempId(tempMessageId)
    if (messageIndex === -1) {
      console.warn(
        `[HistoryManager updateImagePart] Message with tempId ${tempMessageId} not found.`
      )
      return
    }

    const message = chatHistory.value[messageIndex]
    const imagePart: AppChatMessageContentPart = {
      type: 'app_generated_image_path',
      path: newPath,
      absolutePathForOpening: newAbsolutePath,
      imageGenerationId,
      isPartial: isPartialUpdate,
      partialIndex: partialIndexUpdate,
    }

    if (Array.isArray(message.content)) {
      const existingIndex = message.content.findIndex(
        p =>
          p.type === 'app_generated_image_path' &&
          p.imageGenerationId === imageGenerationId
      )
      if (existingIndex !== -1) {
        const existing = message.content[
          existingIndex
        ] as AppChatMessageContentPart
        existing.path = newPath
        existing.absolutePathForOpening = newAbsolutePath
        existing.isPartial = isPartialUpdate
        if (isPartialUpdate && partialIndexUpdate !== undefined) {
          existing.partialIndex = partialIndexUpdate
        } else if (!isPartialUpdate) {
          delete existing.partialIndex
        }
        return
      }

      message.content.push(imagePart)
    } else {
      message.content = [imagePart]
    }
  }

  const updateMessageContentByTempId = (
    tempId: string,
    newContent: string | AppChatMessageContentPart[]
  ): void => {
    const index = findMessageIndexByTempId(tempId)
    if (index === -1) {
      console.warn(
        `updateMessageContentByTempId: Message with tempId ${tempId} not found.`
      )
      return
    }
    if (typeof newContent === 'string') {
      chatHistory.value[index].content = [
        { type: 'app_text', text: newContent },
      ]
    } else {
      chatHistory.value[index].content = newContent
    }
  }

  const updateMessageApiResponseIdByTempId = (
    tempId: string,
    apiResponseId: string
  ): void => {
    const index = findMessageIndexByTempId(tempId)
    if (index !== -1) {
      chatHistory.value[index].api_response_id = apiResponseId
    }
  }

  const addToolCallToMessageByTempId = (
    tempId: string,
    toolCall: any
  ): void => {
    const index = findMessageIndexByTempId(tempId)
    if (index === -1) {
      console.warn(
        `addToolCallToMessageByTempId: Message with tempId ${tempId} not found.`
      )
      return
    }

    if (!chatHistory.value[index].tool_calls) {
      chatHistory.value[index].tool_calls = []
    }

    const toolCalls = chatHistory.value[index].tool_calls!
    if (!toolCalls.find((tc: any) => tc.id === toolCall.id)) {
      toolCalls.push(toolCall)
    }
  }

  const updateMessageToolCallsByTempId = (
    tempId: string,
    toolCalls: any[]
  ): void => {
    const index = findMessageIndexByTempId(tempId)
    if (index === -1) {
      console.warn(
        `updateMessageToolCallsByTempId: Message with tempId ${tempId} not found.`
      )
      return
    }
    chatHistory.value[index].tool_calls = toolCalls
  }

  return {
    addMessageToHistory,
    updateMessageApiIdByTempId,
    appendMessageDeltaByTempId,
    addContentPartToMessageByTempId,
    updateImageContentPartByGenerationId,
    updateMessageContentByTempId,
    updateMessageApiResponseIdByTempId,
    addToolCallToMessageByTempId,
    updateMessageToolCallsByTempId,
  }
}

