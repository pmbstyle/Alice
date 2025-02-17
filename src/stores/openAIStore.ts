import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import {
  getAssistantData,
  createThread,
  visionMessage,
  listMessages,
  sendMessage,
  runAssistant,
  retrieveRelevantMemories,
  ttsStream,
} from '../api/openAI/assistant'
import { transcribeAudio } from '../api/openAI/stt'
import { useGeneralStore } from './generalStore'

export const useConversationStore = defineStore('conversation', () => {
  const {
    messages,
    chatHistory,
    statusMessage,
    updateVideo,
    isProcessingRequest,
    isTTSProcessing,
  } = storeToRefs(useGeneralStore())
  const generalStore = useGeneralStore()

  const assistant = ref<string>('')
  getAssistantData().then(data => {
    assistant.value = data.id
  })

  const thread = ref<string>('')

  const createNewThread = async () => {
    thread.value = await createThread()
  }

  const getMessages = async (threadId: string, last: boolean = false) => {
    messages.value = await listMessages(threadId, last)
  }

  const sendMessageToThread = async (message: any, store: boolean = true) => {
    await sendMessage(thread.value, message, assistant.value, store)
    getMessages(thread.value)
  }

  const chat = async (memories: any) => {
    statusMessage.value = 'Thinking...'
    updateVideo.value('PROCESSING')
    isProcessingRequest.value = true
    isTTSProcessing.value = true
    const run = await runAssistant(thread.value, assistant.value, memories)

    let currentSentence = ''
    let messageId: string | null = null

    for await (const chunk of run) {
      if (
        chunk.event === 'thread.message.created' &&
        chunk.data.assistant_id === assistant.value
      ) {
        messageId = chunk.data.id
        if (messageId) {
          chatHistory.value.unshift({
            id: messageId,
            role: 'assistant',
            content: [{ type: 'text', text: { value: '', annotations: [] } }],
          })
        }
      }

      if (
        chunk.event === 'thread.message.delta' &&
        chunk.data.delta?.content[0].type === 'text'
      ) {
        const textChunk = chunk.data.delta?.content[0].text.value
        currentSentence += textChunk

        if (messageId) {
          const existingMessageIndex = chatHistory.value.findIndex(
            m => m.id === messageId
          )
          if (existingMessageIndex > -1) {
            chatHistory.value[existingMessageIndex].content[0].text.value +=
              textChunk
          }
        }

        if (textChunk.match(/[.!?]\s*$/)) {
          const audioResponse = await ttsStream(currentSentence)
          generalStore.playAudio(audioResponse)
          currentSentence = ''
        }
      }
    }

    if (currentSentence.trim().length > 0) {
      const audioResponse = await ttsStream(currentSentence)
      generalStore.playAudio(audioResponse, true)
    }

    generalStore.storeMessage = false
    isProcessingRequest.value = false
    isTTSProcessing.value = false 
  }

  const transcribeAudioMessage = async (audioBuffer: Buffer) => {
    const response = await transcribeAudio(audioBuffer)
    return response
  }

  const createOpenAIPrompt = async (
    newMessage: string,
    store: boolean = true
  ) => {
    let memoryMessages: any[] = []
    if (store) {
      const relevantMemories = await retrieveRelevantMemories(newMessage)
      memoryMessages = relevantMemories.map(memory => ({
        role: 'assistant',
        content: memory,
      }))
    }
    let userMessage = { role: 'user', content: newMessage }
    return {
      message: userMessage,
      history: memoryMessages,
    }
  }
  const describeImage = async (image: string) => {
    const response = await visionMessage(image)
    return response
  }

  return {
    assistant,
    thread,
    createNewThread,
    getMessages,
    sendMessageToThread,
    chat,
    transcribeAudioMessage,
    createOpenAIPrompt,
    describeImage,
  }
})
