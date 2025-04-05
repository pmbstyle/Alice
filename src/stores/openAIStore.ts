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
  submitToolOutputs,
} from '../api/openAI/assistant'
import { transcribeAudio } from '../api/openAI/stt'
import { useGeneralStore } from './generalStore'
import { executeFunction } from '../utils/functionCaller'

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
    
    let runStatus = null
    let runId = null
  
    // Define processChunk function to handle message chunks
    async function processChunk(chunk) {
      // Handle message creation
      if (
        (chunk.event === 'thread.message.created' || chunk.event === 'thread.message.createddata') &&
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
  
      // Handle text chunks
      if (
        (chunk.event === 'thread.message.delta' || chunk.event === 'thread.message.deltadata') &&
        chunk.data.delta?.content?.[0]?.type === 'text'
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
  
    for await (const chunk of run) {
      // Process every chunk first
      await processChunk(chunk)
      
      if (
        chunk.event === 'thread.run.requires_action' && 
        chunk.data.required_action?.type === 'submit_tool_outputs'
      ) {
        runId = chunk.data.id
        runStatus = 'requires_action'
        
        const toolCalls = chunk.data.required_action.submit_tool_outputs.tool_calls
        
        if (!messageId) {
          chatHistory.value.unshift({
            id: 'temp-' + Date.now(),
            role: 'assistant',
            content: [{ 
              type: 'text', 
              text: { 
                value: `I'm checking that for you...`, 
                annotations: [] 
              } 
            }],
          })
        }
        
        // Process each tool call
        const toolOutputs = []
        for (const toolCall of toolCalls) {
          if (toolCall.type === 'function') {
            const functionName = toolCall.function.name
            const functionArgs = toolCall.function.arguments
            
            try {
              const result = await executeFunction(functionName, functionArgs)
              
              // Add the result to tool outputs
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: result
              })
              
              statusMessage.value = `Function ${functionName} executed successfully`
            } catch (error) {
              console.error(`Error executing function ${functionName}:`, error)
              statusMessage.value = `Error`
              
              // Add error result to tool outputs
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: `Error: ${error.message || 'Unknown error occurred during function execution'}`
              })
            }
          }
        }
        
        // Submit the tool outputs back to the OpenAI API
        if (toolOutputs.length > 0) {          
          try {
            const updatedRun = await submitToolOutputs(thread.value, runId, toolOutputs, assistant.value)
            
            for await (const updatedChunk of updatedRun) {
              await processChunk(updatedChunk)
            }
          } catch (error) {
            console.error('Error submitting tool outputs or processing response:', error)
            statusMessage.value = 'Error'
            isProcessingRequest.value = false
            isTTSProcessing.value = false
            
            chatHistory.value.unshift({
              id: 'error-' + Date.now(),
              role: 'assistant',
              content: [{ 
                type: 'text', 
                text: { 
                  value: `I'm sorry, but I encountered an error while processing your request. Please try again.`, 
                  annotations: [] 
                } 
              }],
            })
          }
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
