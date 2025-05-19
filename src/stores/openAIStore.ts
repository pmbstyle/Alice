import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import {
  getAssistantData,
  createThread,
  uploadScreenshot,
  listMessages,
  sendMessage,
  runAssistant,
  retrieveRelevantThoughts,
  ttsStream,
  submitToolOutputs,
  listAssistantsAPI,
  createAssistantAPI,
  retrieveAssistantAPI,
  updateAssistantAPI,
  deleteAssistantAPI,
  listModelsAPI,
  type LocalAssistantCreateParams,
  type LocalAssistantUpdateParams,
} from '../api/openAI/assistant'
import { transcribeAudio } from '../api/openAI/stt'
import { useGeneralStore } from './generalStore'
import { useSettingsStore } from './settingsStore'
import { executeFunction } from '../utils/functionCaller'

interface LocalModelStore {
  id: string
}

interface LocalAssistantStore {
  id: string
  name: string | null
  model: string
}

export const useConversationStore = defineStore('conversation', () => {
  const generalStore = useGeneralStore()
  const settingsStore = useSettingsStore()
  const { setAudioState } = generalStore
  const { isRecordingRequested, audioState } = storeToRefs(generalStore)

  const assistant = ref<string>('')
  const thread = ref<string>('')
  const creatingThread = ref<boolean>(false)
  const isInitialized = ref<boolean>(false)
  const availableModels = ref<LocalModelStore[]>([])

  const initialize = async (): Promise<boolean> => {
    const targetAssistantId = settingsStore.config.VITE_OPENAI_ASSISTANT_ID
    if (
      isInitialized.value &&
      assistant.value === targetAssistantId &&
      thread.value
    ) {
      console.log(
        `OpenAI Store already initialized for assistant ${targetAssistantId}. Skipping full re-init.`
      )
      return true
    }

    if (!settingsStore.initialLoadAttempted) {
      await settingsStore.loadSettings()
    }

    const currentTargetAssistantId =
      settingsStore.config.VITE_OPENAI_ASSISTANT_ID

    if (
      settingsStore.isProduction &&
      !settingsStore.areEssentialSettingsProvided
    ) {
      generalStore.statusMessage =
        'Error: Essential settings (including Assistant ID) not configured.'
      console.error(
        'OpenAI Store Initialization aborted: Essential settings missing.'
      )
      isInitialized.value = false
      assistant.value = ''
      thread.value = ''
      return false
    }

    if (!currentTargetAssistantId) {
      generalStore.statusMessage =
        'Assistant not configured. Please select or create one in settings.'
      console.warn(
        'OpenAI Store Initialization deferred: Assistant ID missing.'
      )
      isInitialized.value = false
      assistant.value = ''
      thread.value = ''
      return false
    }

    try {
      console.log(
        'Initializing OpenAI Store with Assistant ID:',
        currentTargetAssistantId
      )
      const assistantData = await retrieveAssistantAPI(currentTargetAssistantId)
      assistant.value = assistantData.id
      console.log('Active Assistant ID loaded and verified:', assistant.value)

      if (assistant.value) {
        if (!thread.value || isInitialized.value === false) {
          await createNewThread()
        } else {
          console.log(
            `[OpenAIStore Initialize] Thread ${thread.value} already exists for assistant ${assistant.value}. Re-using.`
          )
        }
        isInitialized.value = true
        generalStore.statusMessage = 'Stand by'
        console.log('OpenAI Store initialized successfully for chat.')
        return true
      } else {
        console.error(
          'Assistant ID not loaded after retrieveAssistantAPI, cannot create thread.'
        )
        generalStore.statusMessage =
          'Error: Assistant setup failed (ID missing after verification).'
        isInitialized.value = false
        assistant.value = ''
        thread.value = ''
        return false
      }
    } catch (error: any) {
      console.error('Failed to initialize OpenAI Store:', error.message)
      generalStore.statusMessage = `Error: Assistant setup failed (${error.message})`
      isInitialized.value = false
      assistant.value = ''
      thread.value = ''
      return false
    }
  }

  const createNewThread = async () => {
    if (creatingThread.value) return
    creatingThread.value = true
    try {
      thread.value = await createThread()
      console.log('New OpenAI thread created:', thread.value)
      generalStore.chatHistory = []
    } catch (error) {
      console.error('Failed to create new thread:', error)
      generalStore.statusMessage = 'Error: Could not create chat thread'
    } finally {
      creatingThread.value = false
    }
  }

  const getMessages = async (last = false) => {
    if (!isInitialized.value || !thread.value) {
      console.warn(
        'OpenAI store not ready for getMessages (not initialized or no thread).'
      )
      return
    }
    try {
      await listMessages(thread.value, last)
      console.log('Messages listed from thread.')
    } catch (error) {
      console.error('Failed to list messages:', error)
    }
  }

  const sendMessageToThread = async (message: any, store = true) => {
    if (!isInitialized.value || !thread.value || !assistant.value) {
      console.warn('OpenAI store not ready for sendMessageToThread.')
      return false
    }
    try {
      await sendMessage(
        thread.value,
        message as OpenAI.Beta.Threads.Messages.MessageCreateParams,
        assistant.value,
        store
      )
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      generalStore.statusMessage = 'Error: Could not send message'
      return false
    }
  }

  const chat = async (memories: any) => {
    if (!isInitialized.value || !thread.value || !assistant.value) {
      generalStore.statusMessage =
        'Error: Chat not ready (AI not fully initialized).'
      setAudioState('IDLE')
      console.warn(
        'OpenAI store not initialized or assistant/thread missing. Cannot start chat.'
      )
      return
    }

    setAudioState('WAITING_FOR_RESPONSE')

    let currentSentence = ''
    let messageId: string | null = null
    let assistantResponseStarted = false

    async function processChunk(chunk: any) {
      if (
        chunk.event === 'thread.message.created' &&
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
        }
      }

      if (
        chunk.event === 'thread.message.delta' &&
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
        }

        if (textChunk.match(/[.!?]\s*$/) || textChunk.endsWith('\n')) {
          if (currentSentence.trim()) {
            const ttsResponse = await ttsStream(currentSentence.trim())
            const queued = generalStore.queueAudioForPlayback(ttsResponse)
            if (queued && audioState.value !== 'SPEAKING') {
              setAudioState('SPEAKING')
            }
            currentSentence = ''
          }
        }
      }
    }

    async function handleToolCalls(runId: string, toolCalls: any[]) {
      const toolOutputs: OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput[] =
        []

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
            const ttsResponse = await ttsStream(toolStatusMessage)
            const queued = generalStore.queueAudioForPlayback(ttsResponse)
            if (queued && audioState.value !== 'SPEAKING') {
              setAudioState('SPEAKING')
            }
          } catch (err) {
            console.warn('TTS failed for system message:', err)
          }

          try {
            const result = await executeFunction(functionName, functionArgs)
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: result,
            })
          } catch (error: any) {
            const errorMessage = `Error: ${error.message || 'Function execution failed'}`
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: errorMessage,
            })
            generalStore.chatHistory.unshift({
              id: 'error-' + Date.now(),
              role: 'system',
              content: [
                {
                  type: 'text',
                  text: {
                    value: `Error using tool: ${functionName}. Details: ${errorMessage}`,
                    annotations: [],
                  },
                },
              ],
            })
          }
        }
      }

      if (toolOutputs.length > 0 && runId) {
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
          setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
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
      } else if (toolOutputs.length === 0 && runId) {
        if (
          audioState.value === 'WAITING_FOR_RESPONSE' &&
          generalStore.audioQueue.length === 0
        ) {
          setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
        }
      }
    }

    async function processRunStream(
      runStream: OpenAI.Beta.AssistantStreamManager<OpenAI.Beta.AssistantStreamEvent>
    ) {
      let runId: string | null = null
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
            await handleToolCalls(
              runId,
              chunk.data.required_action.submit_tool_outputs.tool_calls
            )
            return
          }
          if (chunk.event === 'thread.run.failed') {
            console.error('Run failed:', chunk.data)
            generalStore.statusMessage = `Error: Assistant run failed. ${chunk.data?.last_error?.message || ''}`
            break
          }
          if (chunk.event === 'thread.run.completed') {
            console.log('Run completed successfully.')
          }
        }
        if (currentSentence.trim()) {
          const ttsResponse = await ttsStream(currentSentence.trim())
          const queued = generalStore.queueAudioForPlayback(ttsResponse)
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
    newMessage: string | any
  ): Promise<{
    message: OpenAI.Beta.Threads.Messages.MessageCreateParams | null
    history: string
  }> => {
    let thoughtsStringForPrompt = ''
    let userMessagePayload: OpenAI.Beta.Threads.Messages.MessageCreateParams

    if (typeof newMessage === 'string') {
      userMessagePayload = { role: 'user', content: newMessage }
    } else if (
      typeof newMessage === 'object' &&
      newMessage.role === 'user' &&
      (typeof newMessage.content === 'string' ||
        Array.isArray(newMessage.content))
    ) {
      userMessagePayload = { role: 'user', content: newMessage.content }
    } else {
      console.error(
        '[OpenAIStore createOpenAIPrompt] Invalid message format provided to createOpenAIPrompt:',
        JSON.stringify(newMessage, null, 2)
      )
      return { message: null, history: [] }
    }

    let textContentForThoughtRetrieval = ''
    if (typeof userMessagePayload.content === 'string') {
      textContentForThoughtRetrieval = userMessagePayload.content
    } else if (Array.isArray(userMessagePayload.content)) {
      textContentForThoughtRetrieval = userMessagePayload.content
        .filter((part: any) => part.type === 'text')
        .map((part: any, index: number) => {
          let value = ''
          if (part.text && typeof part.text === 'string') {
            value = part.text
          } else if (part.text && typeof part.text.value === 'string') {
            value = part.text.value
          } else {
            console.warn(
              `[OpenAIStore createOpenAIPrompt] part.text for part ${index} is not in an expected string format:`,
              JSON.stringify(part.text)
            )
          }
          return value
        })
        .join(' ')
    }

    if (textContentForThoughtRetrieval.trim()) {
      try {
        let relevantThoughtTexts = await retrieveRelevantThoughts(
          textContentForThoughtRetrieval
        )

        const currentQueryText = textContentForThoughtRetrieval
          .toLowerCase()
          .trim()
        relevantThoughtTexts = relevantThoughtTexts.filter(thought => {
          return thought.toLowerCase().trim() !== currentQueryText
        })

        if (relevantThoughtTexts.length > 0) {
          thoughtsStringForPrompt = relevantThoughtTexts
            .map(text => `- ${text}`)
            .join('\n')
        }
      } catch (error) {
        console.error(
          '[OpenAIStore createOpenAIPrompt] Failed to retrieve relevant thoughts for prompt:',
          error
        )
        thoughtsStringForPrompt = ''
      }
    } else {
      console.warn(
        '[OpenAIStore createOpenAIPrompt] textContentForThoughtRetrieval was empty or whitespace. Skipping thought retrieval.'
      )
    }

    return {
      message: userMessagePayload,
      history: thoughtsStringForPrompt,
    }
  }

  const uploadScreenshotToOpenAI = async (
    screenshotDataURI: string
  ): Promise<string | null> => {
    if (!screenshotDataURI) return null
    try {
      const fileId = await uploadScreenshot(screenshotDataURI)
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
      case 'get_calendar_events':
        return '🗓️ Fetching your schedule...'
      case 'create_calendar_event':
        return '🗓️ Adding to your calendar...'
      case 'update_calendar_event':
        return '🗓️ Updating your calendar...'
      case 'delete_calendar_event':
        return '🗑️ Removing from your calendar...'
      default:
        return `⚙️ Using tool: ${toolName}...`
    }
  }

  async function fetchAssistants(): Promise<LocalAssistantStore[]> {
    try {
      const assistantsPage = await listAssistantsAPI({ limit: 100 })
      return assistantsPage.data.map(a => ({
        id: a.id,
        name: a.name,
        model: a.model,
      }))
    } catch (error) {
      console.error('Failed to fetch assistants:', error)
      generalStore.statusMessage = 'Error: Could not fetch your assistants.'
      return []
    }
  }

  async function createNewAssistant(
    params: LocalAssistantCreateParams
  ): Promise<LocalAssistantStore | null> {
    try {
      const newAssistant = await createAssistantAPI(params)
      console.log('Assistant created:', newAssistant)
      return {
        id: newAssistant.id,
        name: newAssistant.name,
        model: newAssistant.model,
      }
    } catch (error: any) {
      console.error('Failed to create assistant:', error)
      generalStore.statusMessage = `Error: Could not create new assistant. ${error.message}`
      return null
    }
  }

  async function fetchAssistantDetails(
    assistantId: string
  ): Promise<any | null> {
    try {
      const detailedAssistant = await retrieveAssistantAPI(assistantId)
      return detailedAssistant
    } catch (error: any) {
      console.error('Failed to fetch assistant details:', error)
      generalStore.statusMessage = `Error: Could not fetch details for assistant ${assistantId}. ${error.message}`
      return null
    }
  }

  async function updateExistingAssistant(
    assistantId: string,
    params: LocalAssistantUpdateParams
  ): Promise<LocalAssistantStore | null> {
    try {
      const updatedAssistant = await updateAssistantAPI(assistantId, params)
      console.log('Assistant updated:', updatedAssistant)
      return {
        id: updatedAssistant.id,
        name: updatedAssistant.name,
        model: updatedAssistant.model,
      }
    } catch (error: any) {
      console.error('Failed to update assistant:', error)
      generalStore.statusMessage = `Error: Could not update assistant ${assistantId}. ${error.message}`
      return null
    }
  }

  async function deleteExistingAssistant(
    assistantId: string
  ): Promise<boolean> {
    try {
      await deleteAssistantAPI(assistantId)
      console.log('Assistant deleted:', assistantId)
      if (assistant.value === assistantId) {
        assistant.value = ''
        isInitialized.value = false
        thread.value = ''
        generalStore.chatHistory = []
        if (
          settingsStore.isProduction &&
          settingsStore.settings.VITE_OPENAI_ASSISTANT_ID === assistantId
        ) {
          settingsStore.updateSetting('VITE_OPENAI_ASSISTANT_ID', '')
        }
      }
      return true
    } catch (error: any) {
      console.error('Failed to delete assistant:', error)
      generalStore.statusMessage = `Error: Could not delete assistant ${assistantId}. ${error.message}`
      return false
    }
  }

  async function fetchModels() {
    try {
      const modelsData = await listModelsAPI()
      availableModels.value = modelsData
        .filter(model => model.id.startsWith('gpt-'))
        .map(m => ({ id: m.id }))
      console.log('Available models fetched:', availableModels.value.length)
    } catch (error) {
      console.error('Failed to fetch models:', error)
      generalStore.statusMessage = 'Error: Could not fetch AI models.'
      availableModels.value = []
    }
  }

  async function setActiveAssistant(newAssistantId: string): Promise<boolean> {
    if (
      assistant.value === newAssistantId &&
      isInitialized.value &&
      thread.value
    ) {
      console.log(
        `Assistant ${newAssistantId} is already active and initialized with thread ${thread.value}.`
      )
      return true
    }

    generalStore.statusMessage = `Setting active assistant to ${newAssistantId}...`
    console.log(`Attempting to set active assistant to ${newAssistantId}`)

    isInitialized.value = false
    thread.value = ''
    generalStore.chatHistory = []
    assistant.value = ''

    try {
      const assistantData = await retrieveAssistantAPI(newAssistantId)
      assistant.value = assistantData.id

      if (settingsStore.isProduction) {
        settingsStore.updateSetting('VITE_OPENAI_ASSISTANT_ID', newAssistantId)
      }

      await createNewThread()
      isInitialized.value = true
      generalStore.statusMessage = 'Assistant changed. Ready for chat.'
      console.log(
        `Switched to assistant ${newAssistantId}. New thread: ${thread.value}`
      )
      return true
    } catch (error: any) {
      console.error(
        `Failed to switch to assistant ${newAssistantId}:`,
        error.message
      )
      generalStore.statusMessage = `Error: Could not switch to assistant. ${error.message}`
      isInitialized.value = false
      return false
    }
  }

  return {
    assistant,
    thread,
    isInitialized,
    availableModels,
    initialize,
    createNewThread,
    sendMessageToThread,
    chat,
    transcribeAudioMessage,
    createOpenAIPrompt,
    uploadScreenshotToOpenAI,
    getMessages,
    fetchAssistants,
    createNewAssistant,
    fetchAssistantDetails,
    updateExistingAssistant,
    deleteExistingAssistant,
    fetchModels,
    setActiveAssistant,
  }
})
