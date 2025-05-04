import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import {
  getAssistantData,
  createThread,
  uploadScreenshot,
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
  const generalStore = useGeneralStore()
  const { setAudioState, queueAudioForPlayback } = generalStore
  const { isRecordingRequested, audioState, chatHistory, messages } =
    storeToRefs(generalStore)

  const assistant = ref<string>('')
  const thread = ref<string>('')

  const initialize = async () => {
    try {
      const data = await getAssistantData()
      assistant.value = data.id
      console.log('Assistant ID loaded:', assistant.value)
      if (assistant.value) {
        await createNewThread()
      } else {
        console.error('Assistant ID not loaded, cannot create thread.')
        generalStore.statusMessage = 'Error: Assistant setup failed'
      }
    } catch (error) {
      console.error('Failed to initialize OpenAI Store:', error)
      generalStore.statusMessage = 'Error: Assistant setup failed'
    }
  }
  initialize()

  const createNewThread = async () => {
    try {
      thread.value = await createThread()
      console.log('New OpenAI thread created:', thread.value)
      generalStore.chatHistory = []
      generalStore.messages = []
    } catch (error) {
      console.error('Failed to create new thread:', error)
      generalStore.statusMessage = 'Error: Could not create chat thread'
    }
  }

  const getMessages = async (last: boolean = false) => {
    if (!thread.value) {
      console.warn('Cannot get messages, thread ID not available.')
      return
    }
    try {
      generalStore.messages = await listMessages(thread.value, last)
    } catch (error) {
      console.error('Failed to list messages:', error)
    }
  }

  const sendMessageToThread = async (message: any, store: boolean = true) => {
    if (!thread.value || !assistant.value) {
      console.warn('Cannot send message, thread or assistant ID not available.')
      return false
    }
    try {
      await sendMessage(thread.value, message, assistant.value, store)
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      generalStore.statusMessage = 'Error: Could not send message'
      return false
    }
  }

  const chat = async (memories: any) => {
    if (!thread.value || !assistant.value) {
      console.error('Chat aborted: Thread or Assistant ID missing.')
      generalStore.statusMessage = 'Error: Chat not initialized'
      setAudioState('IDLE')
      return
    }

    setAudioState('WAITING_FOR_RESPONSE')

    let currentSentence = ''
    let messageId: string | null = null
    let assistantResponseStarted = false

    async function processChunk(chunk) {
      if (
        (chunk.event === 'thread.message.created' ||
          chunk.event === 'thread.message.createddata') &&
        chunk.data.assistant_id === assistant.value &&
        !assistantResponseStarted
      ) {
        messageId = chunk.data.id
        if (messageId) {
          assistantResponseStarted = true
          generalStore.chatHistory.unshift({
            id: messageId,
            role: 'assistant',
            content: [{ type: 'text', text: { value: '', annotations: [] } }],
          })
          console.log('Assistant message placeholder added, ID:', messageId)
        }
      }

      if (
        (chunk.event === 'thread.message.delta' ||
          chunk.event === 'thread.message.deltadata') &&
        chunk.data.delta?.content?.[0]?.type === 'text' &&
        messageId
      ) {
        const textChunk = chunk.data.delta.content[0].text.value || ''
        currentSentence += textChunk

        const existingMessageIndex = generalStore.chatHistory.findIndex(
          m => m.id === messageId
        )
        if (existingMessageIndex > -1) {
          generalStore.chatHistory[
            existingMessageIndex
          ].content[0].text.value += textChunk
        } else {
          console.warn(
            "Received text delta but couldn't find message placeholder with ID:",
            messageId
          )
        }

        if (textChunk.match(/[.!?]\s*$/) || textChunk.endsWith('\n')) {
          if (currentSentence.trim()) {
            const queued = generalStore.queueAudioForPlayback(
              await ttsStream(currentSentence.trim())
            )
            if (queued && audioState.value !== 'SPEAKING') {
              setAudioState('SPEAKING')
            }
            currentSentence = ''
          }
        }
      }
    }

    async function handleToolCalls(runId: string, toolCalls: any[]) {
      const toolOutputs = []

      for (const toolCall of toolCalls) {
        if (toolCall.type === 'function') {
          const functionName = toolCall.function.name
          const functionArgs = toolCall.function.arguments
          const toolStatusMessage = getToolStatusMessage(functionName)

          generalStore.chatHistory.unshift({
            id: 'system-' + Date.now(),
            role: 'system',
            content: [
              {
                type: 'text',
                text: { value: toolStatusMessage, annotations: [] },
              },
            ],
          })

          try {
            const queued = generalStore.queueAudioForPlayback(
              await ttsStream(toolStatusMessage)
            )
            if (queued && audioState.value !== 'SPEAKING') {
              setAudioState('SPEAKING')
            }
          } catch (err) {
            console.warn('TTS failed for system message:', err)
          }

          try {
            console.log(
              `Executing tool: ${functionName} with args: ${functionArgs}`
            )
            const result = await executeFunction(functionName, functionArgs)
            console.log(`Tool ${functionName} result:`, result)
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: result,
            })
          } catch (error: any) {
            console.error(`Error executing function ${functionName}:`, error)
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: `Error: ${error.message || 'Function execution failed'}`,
            })
            generalStore.chatHistory.unshift({
              id: 'error-' + Date.now(),
              role: 'system',
              content: [
                {
                  type: 'text',
                  text: {
                    value: `Error using tool: ${functionName}`,
                    annotations: [],
                  },
                },
              ],
            })
          }
        }
      }

      if (toolOutputs.length > 0 && runId) {
        console.log('Submitting tool outputs:', toolOutputs)
        try {
          const continuedRunStream = await submitToolOutputs(
            thread.value,
            runId,
            toolOutputs
          )
          await processRunStream(continuedRunStream)
        } catch (error) {
          console.error('Error submitting tool outputs:', error)
          generalStore.statusMessage = 'Error: Tool submission failed'
          setAudioState('IDLE')
          generalStore.chatHistory.unshift({
            id: 'error-' + Date.now(),
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: {
                  value: `I encountered an issue using my tools. Please try again.`,
                  annotations: [],
                },
              },
            ],
          })
        }
      } else if (toolOutputs.length === 0) {
        console.log('No tool outputs to submit.')
      }
    }

    async function processRunStream(runStream) {
      let runId = null

      try {
        for await (const chunk of runStream) {
          if (chunk.data?.id && chunk.event.startsWith('thread.run.')) {
            runId = chunk.data.id
          }

          await processChunk(chunk)

          if (
            chunk.event === 'thread.run.requires_action' &&
            chunk.data.required_action?.type === 'submit_tool_outputs' &&
            runId
          ) {
            console.log('Run requires action (tool calls). Run ID:', runId)
            await handleToolCalls(
              runId,
              chunk.data.required_action.submit_tool_outputs.tool_calls
            )
            return
          }

          if (chunk.event === 'thread.run.failed') {
            console.error('Run failed:', chunk.data)
            generalStore.statusMessage = 'Error: Assistant run failed'
            break
          }
          if (chunk.event === 'thread.run.completed') {
            console.log('Run completed successfully.')
          }
        }

        if (currentSentence.trim()) {
          console.log(
            'Processing remaining sentence fragment for TTS:',
            currentSentence
          )
          const queued = generalStore.queueAudioForPlayback(
            await ttsStream(currentSentence.trim())
          )
          if (queued && audioState.value !== 'SPEAKING') {
            setAudioState('SPEAKING')
          }
        }
      } catch (error) {
        console.error('Error processing run stream:', error)
        generalStore.statusMessage = 'Error: Processing response failed'
        generalStore.chatHistory.unshift({
          id: 'error-' + Date.now(),
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: {
                value: `I had trouble processing that. Please try again.`,
                annotations: [],
              },
            },
          ],
        })
      } finally {
        if (
          audioState.value === 'WAITING_FOR_RESPONSE' &&
          generalStore.audioQueue.length === 0
        ) {
          setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
        }
        generalStore.storeMessage = false
      }
    }

    try {
      const runStream = await runAssistant(
        thread.value,
        assistant.value,
        memories
      )
      await processRunStream(runStream)
    } catch (error) {
      console.error('Error starting assistant run:', error)
      generalStore.statusMessage = 'Error: Could not start assistant'
      setAudioState('IDLE')
      generalStore.chatHistory.unshift({
        id: 'error-' + Date.now(),
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: {
              value: `I couldn't start processing your request. Please check the connection or try again.`,
              annotations: [],
            },
          },
        ],
      })
    }
  }

  const transcribeAudioMessage = async (
    audioBuffer: Buffer
  ): Promise<string> => {
    try {
      const response = await transcribeAudio(audioBuffer)
      return response || ''
    } catch (error) {
      console.error('Transcription failed:', error)
      generalStore.statusMessage = 'Error: Transcription service failed'
      return ''
    }
  }

  const createOpenAIPrompt = async (
    newMessage: string | any,
    store: boolean = true
  ) => {
    let memoryMessages: any[] = []
    let userMessage: any

    if (typeof newMessage === 'string') {
      userMessage = {
        role: 'user',
        content: [{ type: 'text', text: newMessage }],
      }
    } else if (
      typeof newMessage === 'object' &&
      newMessage.role &&
      newMessage.content
    ) {
      if (!Array.isArray(newMessage.content)) {
        if (typeof newMessage.content === 'string') {
          userMessage = {
            role: newMessage.role,
            content: [{ type: 'text', text: newMessage.content }],
          }
        } else {
          console.error('Invalid message content format:', newMessage.content)
          return { message: null, history: [] }
        }
      } else {
        userMessage = newMessage
      }
    } else {
      console.error(
        'Invalid message format provided to createOpenAIPrompt:',
        newMessage
      )
      return { message: null, history: [] }
    }

    if (store && userMessage) {
      const textContent = userMessage.content
        .filter(item => item.type === 'text' && item.text)
        .map(item =>
          typeof item.text === 'string' ? item.text : item.text.value || ''
        )
        .join(' ')

      if (textContent.trim()) {
        try {
          const relevantMemories = await retrieveRelevantMemories(textContent)
          memoryMessages = relevantMemories
            .filter(memory => memory)
            .map(memory => ({
              role: 'assistant',
              content: [
                {
                  type: 'text',
                  text: `[Thought from past conversation: ${memory}]`,
                },
              ],
            }))
          console.log('Retrieved relevant memories:', memoryMessages.length)
        } catch (error) {
          console.error('Failed to retrieve relevant memories:', error)
        }
      }
    }

    return {
      message: userMessage,
      history: memoryMessages,
    }
  }

  const uploadScreenshotToOpenAI = async (
    screenshotDataURI: string
  ): Promise<string | null> => {
    if (!screenshotDataURI) return null
    try {
      const fileId = await uploadScreenshot(screenshotDataURI)
      console.log('Screenshot uploaded, File ID:', fileId)
      return fileId
    } catch (error) {
      console.error('Error uploading screenshot:', error)
      generalStore.statusMessage = 'Error: Screenshot upload failed'
      return null
    }
  }

  function getToolStatusMessage(toolName: string): string {
    switch (toolName) {
      case 'perform_web_search':
        return '🔍 Searching the web...'
      case 'get_weather_forecast':
        return '🌦️ Checking the skies...'
      case 'get_current_datetime':
        return '🕒 Looking at the clock...'
      case 'open_path':
        return '📂 Opening that for you...'
      case 'manage_clipboard':
        return '📋 Working with your clipboard...'
      case 'get_website_context':
        return '🌐 Reading the page...'
      case 'search_torrents':
        return '🧲 Looking for torrents...'
      case 'add_torrent_to_qb':
        return '🚀 Starting your download...'
      case 'save_memory':
        return '🧠 Got it, remembering that...'
      case 'recall_memories':
        return '🧠 Let me think back...'
      case 'delete_memory':
        return '🗑️ Forgetting that now...'
      default:
        return `⚙️ Using tool: ${toolName}...`
    }
  }

  return {
    assistant,
    thread,
    createNewThread,
    sendMessageToThread,
    chat,
    transcribeAudioMessage,
    createOpenAIPrompt,
    uploadScreenshotToOpenAI,
    getMessages,
  }
})
