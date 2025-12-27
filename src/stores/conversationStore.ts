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

function extractTextFromMessage(message: ChatMessage): string {
  if (typeof message.content === 'string') {
    return message.content
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter(part => part.type === 'app_text' && part.text)
      .map(part => part.text)
      .join(' ')
  }
  return ''
}

function formatRagSource(pathValue: string, title: string, page?: number | null) {
  const fileName = pathValue.split(/[\\/]/).pop() || title
  const pageSuffix = page && page > 0 ? `#p${page}` : ''
  return `${fileName}${pageSuffix}`
}

function buildRagContextBlock(
  results: {
    text: string
    path: string
    title: string
    page?: number | null
  }[],
  maxChars: number
): string {
  const prefix = 'Relevant excerpts from user\'s documents (cite when used):'
  let remaining = maxChars - (prefix.length + 1)
  if (remaining <= 0) return ''

  const lines: string[] = []
  for (const result of results) {
    const normalized = result.text.replace(/\s+/g, ' ').trim()
    const snippet =
      normalized.length <= 320 ? normalized : `${normalized.slice(0, 317)}...`
    const source = formatRagSource(result.path, result.title, result.page)
    const entry = `- [${source}] ${snippet}`
    const extra = entry.length + 1
    if (extra > remaining) {
      break
    }
    lines.push(entry)
    remaining -= extra
  }

  if (lines.length === 0) return ''
  return `${prefix}\n${lines.join('\n')}`
}

function buildRagRulesBlock(): string {
  return [
    'RAG_RULES:',
    '- Use the document excerpts below when they are relevant.',
    '- Cite sources inline like [filename#pX].',
    '- If the answer is not in the excerpts, say you could not find it.',
  ].join('\n')
}

function rerankRagResults(
  results: {
    text: string
    path: string
    title: string
    score?: number
    page?: number | null
  }[],
  prompt: string
) {
  const stopwords = new Set([
    'what',
    'where',
    'when',
    'which',
    'that',
    'this',
    'with',
    'from',
    'about',
    'your',
    'work',
    'experience',
    'role',
    'position',
    'did',
    'does',
    'done',
    'for',
    'and',
    'the',
  ])
  const keywords = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 4 && !stopwords.has(word))

  if (keywords.length === 0) return results

  const scored = results.map(result => {
    const haystack = `${result.title} ${result.path} ${result.text}`.toLowerCase()
    const matches = keywords.reduce((count, word) => {
      return haystack.includes(word) ? count + 1 : count
    }, 0)
    return {
      result,
      score: (result.score || 0) + matches * 0.2,
      matches,
    }
  })

  scored.sort((a, b) => {
    if (b.matches !== a.matches) return b.matches - a.matches
    return b.score - a.score
  })

  const ordered = scored.map(item => item.result)
  const roleScoped =
    /\b(this|that)\s+(role|position)\b/i.test(prompt) ||
    /\bjobscan\b/i.test(prompt)

  if (!roleScoped || ordered.length === 0) return ordered

  const withoutContacts = ordered.filter(result => {
    const text = result.text || ''
    const contactSignals = [
      /@/.test(text),
      /https?:\/\//i.test(text),
      /linkedin/i.test(text),
      /github/i.test(text),
      /\.com/i.test(text),
    ].filter(Boolean).length
    return contactSignals < 2
  })
  const scopedResults = withoutContacts.length > 0 ? withoutContacts : ordered

  const anchorPage = scopedResults[0]?.page
  if (!anchorPage) return ordered

  const samePage = scopedResults.filter(result => result.page === anchorPage)
  return samePage.length > 0 ? samePage : scopedResults
}

function shouldIndexAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false
  if (message.tool_calls && message.tool_calls.length > 0) return false

  const text = extractTextFromMessage(message).trim()
  if (!text) return false

  const lower = text.toLowerCase()
  const trivialPattern = /^(hi|hello|hey|thanks|sorry|ok|okay|sure|done)[.!?]*$/i
  if (text.length < 40 && trivialPattern.test(lower)) {
    return false
  }

  const sentenceCount = text.split(/[.!?]/).filter(Boolean).length
  const hasListMarkers = /(^|\n)\s*([-*]|\d+\.)\s+/.test(text)

  if (text.length >= 280) return true
  if (text.length >= 120 && (sentenceCount >= 2 || hasListMarkers)) return true

  return false
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
      getAiProvider: () => settingsStore.config.aiProvider,
      getAssistantSystemPrompt: () => settingsStore.config.assistantSystemPrompt,
      getEphemeralEmotionalContext: () => ephemeralEmotionalContext.value,
      clearEphemeralEmotionalContext: () => {
        ephemeralEmotionalContext.value = null
      },
      retrieveThoughtsForPrompt: prompt =>
        api.retrieveRelevantThoughtsForPrompt(prompt),
      retrieveDocumentsForPrompt: (prompt, topK) =>
        api.retrieveRelevantDocumentsForPrompt(prompt, topK),
      getRagConfig: () => ({
        enabled: settingsStore.config.ragEnabled,
        topK: settingsStore.config.ragTopK,
        maxContextChars: settingsStore.config.ragMaxContextChars,
      }),
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

    if (result.streamEndedNormally) {
      const assistantMessage = chatHistory.value.find(
        msg => msg.local_id_temp === placeholderTempId
      )
      if (assistantMessage && shouldIndexAssistantMessage(assistantMessage)) {
        const conversationId =
          currentResponseId.value || 'default_conversation'
        try {
          await api.indexMessageForThoughts(
            conversationId,
            'assistant',
            assistantMessage
          )
        } catch (error) {
          console.error(
            '[ConversationStore] Error indexing assistant message for thoughts:',
            error
          )
        }
      }
    }

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

    if (settingsStore.config.ragEnabled) {
      const ragResultsRaw = await api.retrieveRelevantDocumentsForPrompt(
        prompt,
        settingsStore.config.ragTopK
      )
      const ragResults = rerankRagResults(ragResultsRaw, prompt)
      if (ragResults.length > 0) {
        contextMessages.push({
          role: 'user',
          content: [{ type: 'input_text', text: buildRagRulesBlock() }],
        })
        const ragBlock = buildRagContextBlock(
          ragResults,
          settingsStore.config.ragMaxContextChars
        )
        if (ragBlock) {
          contextMessages.push({
            role: 'user',
            content: [{ type: 'input_text', text: ragBlock }],
          })
        }
      }
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
      transcribeWithGoogle: (audio: ArrayBuffer) =>
        api.transcribeWithGoogle(audio),
      transcribeWithBackend: (audio: ArrayBuffer) =>
        api.transcribeWithBackend(audio),
      logInfo: (...args: any[]) => console.log(...args),
      logError: (...args: any[]) => console.error(...args),
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
