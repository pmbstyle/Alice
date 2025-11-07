import { ref, onUnmounted } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import type OpenAI from 'openai'
import * as api from '../services/apiService'
import { useGeneralStore } from './generalStore'
import type { AudioState } from './generalStore'
import { useSettingsStore } from './settingsStore'
import { executeFunction } from '../utils/functionCaller'
import eventBus from '../utils/eventBus'
import { createStreamHandler } from '../modules/conversation/streamHandler'
import { createToolCallHandler } from '../modules/conversation/toolCallHandler'
import { createApiInputBuilder } from '../modules/conversation/apiInputBuilder'
import { createSummarizer } from '../modules/conversation/summarizer'
import { createSpeechQueueManager } from '../modules/conversation/speechQueue'
import { createTurnManager } from '../modules/conversation/turnManager'
import { createReminderHandler } from '../modules/conversation/reminderHandler'
import { createChatOrchestrator } from '../modules/conversation/chatOrchestrator'
import { createBackendService } from '../modules/conversation/backendService'
import type {
  ToolCallHandlerDependencies,
} from '../modules/conversation/types'
import type { ApiInputBuilderDependencies } from '../modules/conversation/apiInputBuilder'
import type { SummarizerDependencies } from '../modules/conversation/summarizer'
import type { SpeechQueueDependencies } from '../modules/conversation/speechQueue'
import type { TurnManagerDependencies } from '../modules/conversation/turnManager'
import type { ReminderHandlerDependencies } from '../modules/conversation/reminderHandler'
import type { ChatDependencies } from '../modules/conversation/chatOrchestrator'
import { createBackendService } from '../modules/conversation/backendService'

import type { AppChatMessageContentPart, ChatMessage } from '../types/chat'

function parseErrorMessage(error: any): AppChatMessageContentPart {
  let errorMessage = error.message || 'Unknown error occurred'
  let errorType = 'unknown_error'
  let errorCode = null
  let errorParam = null

  if (error.error) {
    const apiError = error.error
    errorMessage = apiError.message || errorMessage
    errorType = apiError.type || errorType
    errorCode = apiError.code
    errorParam = apiError.param
  }

  errorMessage = errorMessage.replace(/^Error:\s*/i, '')

  return {
    type: 'app_error',
    text: errorMessage,
    errorType,
    errorCode,
    errorParam,
    originalError: error,
  }
}

export const useConversationStore = defineStore('conversation', () => {
  const generalStore = useGeneralStore()
  const settingsStore = useSettingsStore()
  const {
    setAudioState,
    queueAudioForPlayback,
    updateImageContentPartByGenerationId,
  } = generalStore
  const {
    isRecordingRequested,
    audioState,
    chatHistory,
    audioQueue,
    audioPlayer,
  } = storeToRefs(generalStore)

  const currentResponseId = ref<string | null>(null)
  const currentConversationTurnId = ref<string | null>(null)
  const isInitialized = ref<boolean>(false)
  const availableModels = ref<OpenAI.Models.Model[]>([])
  const isSummarizing = ref<boolean>(false)
  const ttsAbortController = ref<AbortController | null>(null)
  const llmAbortController = ref<AbortController | null>(null)
  const ephemeralEmotionalContext = ref<string | null>(null)

  const chatWithCleanHistory = async () => {
    console.log(
      '[Clean Recovery] Starting fresh conversation without tool-related messages'
    )
    const cleanHistory = chatHistory.value.filter(msg => {
      if (msg.role === 'user') return true

      if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) return false

        if (
          !msg.content ||
          (Array.isArray(msg.content) &&
            msg.content.every((c: any) => !c.text || c.text.trim() === ''))
        )
          return false

        return true
      }

      return false
    })

    console.log(
      `[Clean Recovery] Filtered conversation from ${chatHistory.value.length} to ${cleanHistory.length} messages`
    )

    const originalHistory = [...chatHistory.value]
    chatHistory.value = cleanHistory

    try {
      return await chat()
    } finally {
      chatHistory.value = originalHistory
    }
  }

  const initialize = async (): Promise<boolean> => {
    if (isInitialized.value) {
      return true
    }
    if (!settingsStore.initialLoadAttempted) {
      await settingsStore.loadSettings()
    }

    const essentialCheckPassed = settingsStore.areEssentialSettingsProvided
    if (!essentialCheckPassed) {
      generalStore.statusMessage =
        'Error: Core settings (API Keys/Models/STT) not configured.'
      isInitialized.value = false
      return false
    }

    if (availableModels.value.length === 0) {
      await fetchModels()
    }
    isInitialized.value = true
    generalStore.statusMessage = 'Stand by'
    generalStore.chatHistory = []
    currentResponseId.value = null
    currentConversationTurnId.value = `turn-${Date.now()}`

    if (window.ipcRenderer) {
      window.ipcRenderer.on(
        'scheduler:reminder',
        async (event, reminderData) => {
          console.log(
            '[ConversationStore] Received scheduler reminder:',
            reminderData
          )
          try {
            const reminderMessage: ChatMessage = {
              id: `reminder-${Date.now()}`,
              role: 'assistant',
              content: [
                {
                  type: 'app_text',
                  text: reminderData.message,
                  isScheduledReminder: true,
                  taskName: reminderData.taskName,
                  timestamp: reminderData.timestamp,
                },
              ],
              created_at: Date.now(),
            }

            generalStore.chatHistory.unshift(reminderMessage)

            if (reminderData.message && reminderData.message.trim()) {
              ttsAbortController.value = new AbortController()
              const ttsResponse = await api.ttsStream(
                reminderData.message,
                ttsAbortController.value.signal
              )
              if (
                queueAudioForPlayback(ttsResponse) &&
                audioState.value !== 'SPEAKING'
              ) {
                setAudioState('SPEAKING')
              }
            }
          } catch (error: any) {
            if (error.name !== 'AbortError') {
              console.error(
                '[ConversationStore] Failed to speak scheduler reminder:',
                error
              )
            }
          }
        }
      )
    }

    return true
  }

  const summarizer = createSummarizer(createSummarizerDependencies())

  const triggerConversationSummarization = async () => {
    await summarizer.triggerSummarization()
  }

  const apiInputBuilder = createApiInputBuilder(
    createApiInputDependencies()
  )

  const buildApiInput = async (
    isNewChain: boolean
  ): Promise<OpenAI.Responses.Request.InputItemLike[]> => {
    return apiInputBuilder.build({ isNewChain })
  }

  function createApiInputDependencies(): ApiInputBuilderDependencies {
    return {
      getChatHistory: () => [...chatHistory.value],
      getMaxHistoryMessagesForApi: () =>
        settingsStore.config.MAX_HISTORY_MESSAGES_FOR_API,
      getAiProvider: () => settingsStore.config.aiProvider,
    }
  }

  function createSummarizerDependencies(): SummarizerDependencies {
    return {
      isSummarizing: () => isSummarizing.value,
      setSummarizing: value => {
        isSummarizing.value = value
      },
      fetchRecentMessages: limit =>
        window.ipcRenderer.invoke('summaries:get-recent-messages', { limit }),
      analyzeContext: (formattedMessages, model) =>
        api.createContextAnalysisResponse(formattedMessages, model),
      createSummary: (formattedMessages, model, systemPrompt) =>
        api.createSummarizationResponse(
          formattedMessages,
          model,
          systemPrompt
        ),
      saveSummary: params =>
        window.ipcRenderer.invoke('summaries:save-summary', params),
      setEphemeralEmotionalContext: value => {
        ephemeralEmotionalContext.value = value
      },
      getSummarizationConfig: () => ({
        messageCount: settingsStore.config.SUMMARIZATION_MESSAGE_COUNT,
        model: settingsStore.config.SUMMARIZATION_MODEL,
        systemPrompt: settingsStore.config.SUMMARIZATION_SYSTEM_PROMPT,
      }),
      logError: (...args: any[]) => console.error(...args),
    }
  }

  function createSpeechQueueDependencies(): SpeechQueueDependencies {
    return {
      createAbortController: () => new AbortController(),
      setTtsAbortController: controller => {
        ttsAbortController.value = controller
      },
      ttsStream: (text, signal) => api.ttsStream(text, signal),
      queueAudioForPlayback: response => queueAudioForPlayback(response),
      getAudioState: () => audioState.value as AudioState,
      setAudioState: state => setAudioState(state),
      logError: (...args: any[]) => console.error(...args),
    }
  }

  function createReminderHandlerDependencies(): ReminderHandlerDependencies {
    return {
      subscribe: handler => {
        if (!window.ipcRenderer) {
          return () => {}
        }
        const listener = (_event: any, reminderData: any) => {
          handler(reminderData)
        }
        window.ipcRenderer.on('scheduler:reminder', listener)
        return () => {
          window.ipcRenderer?.off('scheduler:reminder', listener)
        }
      },
      addMessage: message => generalStore.addMessageToHistory(message),
      enqueueSpeech,
      logInfo: (...args: any[]) => console.log(...args),
      logError: (...args: any[]) => console.error(...args),
    }
  }

  function createChatDependencies(): ChatDependencies {
    return {
      isInitialized: () => isInitialized.value,
      setAudioState: state => setAudioState(state as AudioState),
      getIsRecordingRequested: () => isRecordingRequested.value,
      getCurrentResponseId: () => currentResponseId.value,
      setCurrentResponseId: id => {
        currentResponseId.value = id
      },
      getAssistantSystemPrompt: () => settingsStore.config.assistantSystemPrompt,
      getEphemeralEmotionalContext: () => ephemeralEmotionalContext.value,
      clearEphemeralEmotionalContext: () => {
        ephemeralEmotionalContext.value = null
      },
      retrieveThoughtsForPrompt: prompt =>
        api.retrieveRelevantThoughtsForPrompt(prompt),
      fetchLatestSummary: () =>
        window.ipcRenderer.invoke('summaries:get-latest-summary', {}),
      getChatHistory: () => [...chatHistory.value],
      buildApiInput,
      addAssistantPlaceholder: () =>
        generalStore.addMessageToHistory({
          role: 'assistant',
          content: [{ type: 'app_text', text: '' }],
        }),
      processStream,
      createOpenAIResponse: (input, responseId, signal) =>
        api.createOpenAIResponse(
          input,
          responseId,
          true,
          settingsStore.config.assistantSystemPrompt,
          signal
        ),
      createAbortController: () => new AbortController(),
      setLlmAbortController: controller => {
        llmAbortController.value = controller
      },
      handleCleanHistoryRetry: chatWithCleanHistory,
      handleStreamError: (placeholderTempId, error) => {
        const errorContent = parseErrorMessage(error)
        generalStore.updateMessageContentByTempId(placeholderTempId, [
          errorContent,
        ])
      },
      logInfo: (...args: any[]) => console.log(...args),
      logError: (...args: any[]) => console.error(...args),
    }
  }

  function createTurnManagerDependencies(): TurnManagerDependencies {
    return {
      getTtsAbortController: () => ttsAbortController.value,
      setTtsAbortController: controller => {
        ttsAbortController.value = controller
      },
      getLlmAbortController: () => llmAbortController.value,
      setLlmAbortController: controller => {
        llmAbortController.value = controller
      },
      getCurrentResponseId: () => currentResponseId.value,
      getAudioPlayer: () => audioPlayer.value,
      getAudioQueueLength: () => audioQueue.value.length,
      getAudioState: () => audioState.value,
      setAudioState: state => setAudioState(state),
      isRecordingRequested: () => isRecordingRequested.value,
      triggerSummarization: () => {
        triggerConversationSummarization()
      },
      onCancelTts: handler => eventBus.on('cancel-tts', handler),
      offCancelTts: handler => eventBus.off('cancel-tts', handler),
      onCancelLlm: handler => eventBus.on('cancel-llm-stream', handler),
      offCancelLlm: handler => eventBus.off('cancel-llm-stream', handler),
      logInfo: (...args: any[]) => console.log(...args),
      logError: (...args: any[]) => console.error(...args),
    }
  }

  const speechQueueManager = createSpeechQueueManager(
    createSpeechQueueDependencies()
  )

  const enqueueSpeech = async (text: string) => {
    await speechQueueManager.enqueueSpeech(text)
  }

  const toolCallHandler = createToolCallHandler(
    createToolCallDependencies()
  )

  function createToolCallDependencies(): ToolCallHandlerDependencies {
    return {
      getToolStatusMessage: (toolName, args) =>
        getToolStatusMessage(toolName, args),
      addSystemMessage: messageText => {
        generalStore.addMessageToHistory({
          role: 'system',
          content: [{ type: 'app_text', text: messageText }],
        })
      },
      addToolMessage: ({ toolCallId, functionName, content }) => {
        generalStore.addMessageToHistory({
          role: 'tool',
          tool_call_id: toolCallId,
          name: functionName,
          content,
        })
      },
      executeFunction: (functionName, args) =>
        executeFunction(functionName, args, settingsStore.config),
      buildApiInput,
      createAssistantPlaceholder: () => {
        const placeholder: ChatMessage = {
          role: 'assistant',
          content: [{ type: 'app_text', text: '' }],
        }
        return generalStore.addMessageToHistory(placeholder)
      },
      createAbortController: () => new AbortController(),
      setLlmAbortController: controller => {
        llmAbortController.value = controller
      },
      createOpenAIResponse: (
        input,
        responseId,
        isContinuationAfterTool,
        systemPrompt,
        signal
      ) =>
        api.createOpenAIResponse(
          input,
          responseId,
          isContinuationAfterTool,
          systemPrompt,
          signal
        ),
      processStream,
      parseErrorMessage: error => parseErrorMessage(error),
      updateMessageContent: (placeholderTempId, content) =>
        generalStore.updateMessageContentByTempId(
          placeholderTempId,
          content
        ),
      setAudioState: state => setAudioState(state as AudioState),
      isRecordingRequested: () => isRecordingRequested.value,
      getAssistantSystemPrompt: () =>
        settingsStore.config.assistantSystemPrompt,
      getCurrentResponseId: () => currentResponseId.value,
      setCurrentResponseId: responseId => {
        currentResponseId.value = responseId
      },
      logError: (...args: any[]) => console.error(...args),
      logInfo: (...args: any[]) => console.log(...args),
    }
  }

  const turnManager = createTurnManager(createTurnManagerDependencies())
  const reminderHandler = createReminderHandler(
    createReminderHandlerDependencies()
  )
  const backendService = createBackendService(createBackendDependencies())

  onUnmounted(() => {
    turnManager.dispose()
    reminderHandler.dispose()
  })

  function createStreamDependencies(placeholderTempId: string) {
    return {
      appendAssistantDelta: (delta: string) =>
        generalStore.appendMessageDeltaByTempId(
          placeholderTempId,
          delta
        ),
      setAssistantResponseId: (responseId: string) => {
        currentResponseId.value = responseId
        generalStore.updateMessageApiResponseIdByTempId(
          placeholderTempId,
          responseId
        )
      },
      setAssistantMessageId: (messageId: string) => {
        generalStore.updateMessageApiIdByTempId(
          placeholderTempId,
          messageId
        )
      },
      addToolCall: (toolCall: any) =>
        generalStore.addToolCallToMessageByTempId(
          placeholderTempId,
          toolCall
        ),
      handleToolCall: async (
        toolCall: OpenAI.Responses.FunctionCall
      ) => {
        await toolCallHandler.handleToolCall({
          toolCall,
          originalResponseIdForTool: currentResponseId.value,
        })
      },
      handleImagePartial: async (
        generationId: string,
        base64: string,
        partialIndex: number
      ) => {
        try {
          const saveResult = await window.ipcRenderer.invoke(
            'save-image-from-base64',
            {
              base64Data: base64,
              fileName: `partial_${generationId}_${partialIndex}_${Date.now()}.png`,
              isPartial: true,
            }
          )

          if (saveResult.success) {
            updateImageContentPartByGenerationId(
              placeholderTempId,
              generationId,
              saveResult.relativePath,
              saveResult.absolutePath,
              true,
              partialIndex
            )
          }
        } catch (error) {
          console.error('Failed to save partial image:', error)
        }
      },
      handleImageFinal: async (generationId: string, base64: string) => {
        try {
          const saveResult = await window.ipcRenderer.invoke(
            'save-image-from-base64',
            {
              base64Data: base64,
              fileName: `final_${generationId}_${Date.now()}.png`,
              isPartial: false,
            }
          )

          if (saveResult.success) {
            updateImageContentPartByGenerationId(
              placeholderTempId,
              generationId,
              saveResult.relativePath,
              saveResult.absolutePath,
              false
            )
          }
        } catch (error) {
          console.error('Failed to save final image:', error)
        }
      },
      enqueueSpeech,
      setAudioState: (state: string) => setAudioState(state as AudioState),
      getAudioState: () => audioState.value,
      handleStreamError: (error: unknown) => {
        if ((error as any)?.name === 'AbortError') return
        console.error('Error processing stream:', error)
      },
    }
  }

  async function processStream(
    stream: AsyncIterable<OpenAI.Responses.StreamEvent>,
    placeholderTempId: string,
    isContinuationAfterTool: boolean
  ) {
    const handler = createStreamHandler(
      createStreamDependencies(placeholderTempId)
    )

    const result = await handler.process({
      stream,
      options: { isContinuationAfterTool },
    })

    turnManager.finalizeAfterStream({
      streamEndedNormally: result.streamEndedNormally,
      isContinuationAfterTool,
    })

    return result
  }
  const chatOrchestrator = createChatOrchestrator(
    createChatDependencies()
  )

  const chat = async () => {
    currentConversationTurnId.value = `turn-${Date.now()}`
    await chatOrchestrator.runChat()
  }

  const transcribeAudioMessage = async (
    audioArrayBuffer: ArrayBuffer
  ): Promise<string> => {
    return backendService.transcribeAudioMessage(audioArrayBuffer)
  }

  async function fetchModels() {
    const models = await backendService.fetchModels()
    if (models) {
      availableModels.value = models
    }
  }

  function getToolStatusMessage(toolName: string, args?: object): string {
    const messages: Record<string, string | ((args: any) => string)> = {
      get_current_datetime: '🕒 Looking at the clock...',
      open_path: '📂 Opening that for you...',
      manage_clipboard: '📋 Working with your clipboard...',
      search_torrents: '🧲 Looking for torrents...',
      add_torrent_to_qb: '🚀 Starting your download...',
      save_memory: '🧠 Got it, remembering that...',
      recall_memories: '🧠 Let me think back...',
      delete_memory: '🗑️ Forgetting that now...',
      get_calendar_events: '🗓️ Fetching your schedule...',
      create_calendar_event: '🗓️ Adding to your calendar...',
      update_calendar_event: '🗓️ Updating your calendar...',
      delete_calendar_event: '🗑️ Removing from your calendar...',
      get_unread_emails: '📧 Looking for unread emails...',
      search_emails: '📧 Searching emails...',
      get_email_content: '📧 Reading email content...',
      browser_context: '🌐 Looking at your browser...',
      execute_command: (args: any) =>
        `💻 Executing: ${args?.command || 'command'}`,
      list_directory: (args: any) => `📁 Listing: ${args?.path || 'directory'}`,
      schedule_task: (args: any) =>
        `⏰ Scheduling "${args?.name || 'task'}" to run ${args?.schedule || 'periodically'}...`,
      manage_scheduled_tasks: (args: any) => {
        switch (args?.action) {
          case 'list':
            return '📋 Checking your scheduled tasks...'
          case 'delete':
            return '🗑️ Removing scheduled task...'
          case 'toggle':
            return '🔄 Toggling task status...'
          default:
            return '⚙️ Managing scheduled tasks...'
        }
      },
    }

    const message = messages[toolName]
    if (typeof message === 'function') {
      return message(args)
    }
    return message || `⚙️ Using tool: ${toolName}...`
  }

  function getCompletionMessage(functionName: string): string {
    const completionMessages: Record<string, string> = {
      open_path: "✅ Done! I've opened that for you.",
      manage_clipboard: '✅ Clipboard operation completed successfully.',
      execute_command: '✅ Command executed successfully.',
    }

    return (
      completionMessages[functionName] || '✅ Action completed successfully.'
    )
  }

  const chatWithContextAction = async (prompt: string) => {
    if (!isInitialized.value) {
      console.warn('Conversation store not initialized.')
      return
    }
    currentConversationTurnId.value = `turn-${Date.now()}`
    setAudioState('WAITING_FOR_RESPONSE')

    const isNewChain = currentResponseId.value === null
    const constructedApiInput = await buildApiInput(isNewChain)

    const contextMessages: OpenAI.Responses.Request.InputItemLike[] = []

    contextMessages.push({
      role: 'user',
      content: [{ type: 'input_text', text: prompt }],
    })

    const summaryResult = await window.ipcRenderer.invoke(
      'summaries:get-latest-summary',
      {}
    )
    if (summaryResult.success && summaryResult.data?.summary_text) {
      const summaryContent = `[CONVERSATION_SUMMARY_START]\nContext from a previous part of our conversation:\n${summaryResult.data.summary_text}\n[CONVERSATION_SUMMARY_END]`
      contextMessages.push({
        role: 'user',
        content: [{ type: 'input_text', text: summaryContent }],
      })
    }

    if (ephemeralEmotionalContext.value) {
      const emotionalContextContent = `[SYSTEM_NOTE: Based on our recent interaction, the user's emotional state seems to be: ${ephemeralEmotionalContext.value}]`
      contextMessages.push({
        role: 'user',
        content: [{ type: 'input_text', text: emotionalContextContent }],
      })
      ephemeralEmotionalContext.value = null
    }

    const finalApiInput = [...contextMessages, ...constructedApiInput]
    const finalInstructions = settingsStore.config.assistantSystemPrompt

    const assistantMessagePlaceholder: ChatMessage = {
      role: 'assistant',
      content: [{ type: 'app_text', text: '' }],
    }
    const placeholderTempId = generalStore.addMessageToHistory(
      assistantMessagePlaceholder
    )

    try {
      llmAbortController.value = new AbortController()
      const streamResult = await api.createOpenAIResponse(
        finalApiInput,
        currentResponseId.value,
        true,
        finalInstructions,
        llmAbortController.value.signal
      )
      await processStream(streamResult, placeholderTempId, false)
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error starting OpenAI response stream:', error)

        if (
          error.message?.includes('Previous response with id') &&
          error.message?.includes('not found')
        ) {
          console.log(
            '[Error Recovery] Previous response ID not found, clearing and retrying'
          )
          currentResponseId.value = null
          return await chatWithContextAction(prompt)
        }

        const errorContent = parseErrorMessage(error)
        generalStore.updateMessageContentByTempId(placeholderTempId, [
          errorContent,
        ])
        setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      }
    }
  }

  return {
    isInitialized,
    availableModels,
    initialize,
    chat,
    chatWithContextAction,
    transcribeAudioMessage,
    fetchModels,
    currentResponseId,
    triggerConversationSummarization,
  }
})
  function createBackendDependencies() {
    return {
      getConfig: () => settingsStore.config,
      setStatusMessage: (message: string) => {
        generalStore.statusMessage = message
      },
      fetchOpenAIModels: () => api.fetchOpenAIModels(),
      transcribeWithOpenAI: (audio: ArrayBuffer) =>
        api.transcribeWithOpenAI(audio),
      transcribeWithGroq: (audio: ArrayBuffer) =>
        api.transcribeWithGroq(audio),
      transcribeWithBackend: (audio: ArrayBuffer) =>
        api.transcribeWithBackend(audio),
      logInfo: (...args: any[]) => console.log(...args),
      logError: (...args: any[]) => console.error(...args),
    }
  }
