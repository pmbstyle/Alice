import { ref, onUnmounted } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import type OpenAI from 'openai'
import * as api from '../services/apiService'
import { useGeneralStore } from './generalStore'
import { useSettingsStore } from './settingsStore'
import { executeFunction } from '../utils/functionCaller'
import eventBus from '../utils/eventBus'

import type { AppChatMessageContentPart } from '../types/chat'
export type { AppChatMessageContentPart }

export interface ChatMessage {
  local_id_temp?: string
  api_message_id?: string
  api_response_id?: string
  role: 'user' | 'assistant' | 'system' | 'developer' | 'tool'
  content: string | AppChatMessageContentPart[]
  tool_call_id?: string
  name?: string
  tool_calls?: OpenAI.Responses.FunctionCall[]
}

interface RawMessageForSummarization {
  role: string
  text_content: string
  created_at: string
}

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
  const { isRecordingRequested, audioState, chatHistory } =
    storeToRefs(generalStore)

  const currentResponseId = ref<string | null>(null)
  const currentConversationTurnId = ref<string | null>(null)
  const isInitialized = ref<boolean>(false)
  const availableModels = ref<OpenAI.Models.Model[]>([])
  const isSummarizing = ref<boolean>(false)
  const ttsAbortController = ref<AbortController | null>(null)
  const llmAbortController = ref<AbortController | null>(null)
  const ephemeralEmotionalContext = ref<string | null>(null)

  const handleCancelTTS = () => {
    if (ttsAbortController.value) {
      console.log('[TTS Abort] Cancelling in-flight TTS request.')
      ttsAbortController.value.abort()
      ttsAbortController.value = null
    }
  }

  const handleCancelLLMStream = () => {
    if (llmAbortController.value) {
      console.log('[LLM Abort] Cancelling in-flight LLM stream request.')
      llmAbortController.value.abort()
      llmAbortController.value = null
      console.log(
        '[LLM Abort] Stream cancelled but preserving currentResponseId for conversation continuity.'
      )
    }
  }

  eventBus.on('cancel-tts', handleCancelTTS)
  eventBus.on('cancel-llm-stream', handleCancelLLMStream)

  onUnmounted(() => {
    eventBus.off('cancel-tts', handleCancelTTS)
    eventBus.off('cancel-llm-stream', handleCancelLLMStream)
  })

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

    if (
      availableModels.value.length === 0 &&
      settingsStore.config.VITE_OPENAI_API_KEY
    ) {
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
            const reminderMessage: AppChatMessage = {
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

  const triggerConversationSummarization = async () => {
    if (isSummarizing.value) return
    isSummarizing.value = true

    try {
      const messagesResult = await window.ipcRenderer.invoke(
        'summaries:get-recent-messages',
        { limit: settingsStore.config.SUMMARIZATION_MESSAGE_COUNT }
      )

      if (messagesResult.success && messagesResult.data?.length > 0) {
        const rawMessages = messagesResult.data as RawMessageForSummarization[]
        const formattedMessages = rawMessages.map(m => ({
          role: m.role,
          content: m.text_content || '[content missing]',
        }))

        const [emotionalContext, factualSummary] = await Promise.all([
          api.createContextAnalysisResponse(
            formattedMessages,
            settingsStore.config.SUMMARIZATION_MODEL
          ),
          api.createSummarizationResponse(
            formattedMessages,
            settingsStore.config.SUMMARIZATION_MODEL,
            settingsStore.config.SUMMARIZATION_SYSTEM_PROMPT
          ),
        ])

        if (emotionalContext) {
          ephemeralEmotionalContext.value = emotionalContext
        }

        if (factualSummary) {
          await window.ipcRenderer.invoke('summaries:save-summary', {
            summaryText: factualSummary,
            summarizedMessagesCount: rawMessages.length,
          })
        }
      }
    } catch (error) {
      console.error('[Summarizer] Error during summarization:', error)
    } finally {
      isSummarizing.value = false
    }
  }

  const buildApiInput = async (
    isNewChain: boolean
  ): Promise<OpenAI.Responses.Request.InputItemLike[]> => {
    const historyToBuildFrom = [...chatHistory.value]
    const apiInput: OpenAI.Responses.Request.InputItemLike[] = []
    const recentHistory = historyToBuildFrom
      .slice(0, settingsStore.config.MAX_HISTORY_MESSAGES_FOR_API)
      .reverse()

    const lastUserMessageInFullHistoryId = historyToBuildFrom
      .filter(msg => msg.role === 'user')
      .slice(-1)[0]?.local_id_temp

    for (const msg of recentHistory) {
      let apiItemPartial: any

      if (msg.role === 'tool') {
        apiItemPartial = {
          type: 'function_call_output',
          call_id: msg.tool_call_id || `unknown_call_id_${Date.now()}`,
          output:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
        }
      } else if (msg.role === 'system') {
        apiItemPartial = {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                typeof msg.content === 'string'
                  ? msg.content
                  : JSON.stringify(msg.content),
            },
          ],
        }
      } else {
        const currentApiRole = msg.role as 'user' | 'assistant' | 'developer'
        apiItemPartial = { role: currentApiRole, content: [] }
        if (msg.name) apiItemPartial.name = msg.name

        let messageContentParts: OpenAI.Responses.Request.ContentPartLike[] = []
        if (typeof msg.content === 'string') {
          const typeForPart =
            currentApiRole === 'user' || currentApiRole === 'developer'
              ? 'input_text'
              : 'output_text'
          messageContentParts = [{ type: typeForPart, text: msg.content }]
        } else if (Array.isArray(msg.content)) {
          const isThisTheLastUserMessageWithPotentialNewImage =
            currentApiRole === 'user' &&
            msg.local_id_temp === lastUserMessageInFullHistoryId

          messageContentParts = msg.content
            .map((appPart: AppChatMessageContentPart) => {
              if (appPart.type === 'app_text') {
                const typeForPart =
                  currentApiRole === 'user' || currentApiRole === 'developer'
                    ? 'input_text'
                    : 'output_text'
                return { type: typeForPart, text: appPart.text || '' }
              } else if (appPart.type === 'app_image_uri') {
                if (!appPart.uri) return null
                if (
                  isThisTheLastUserMessageWithPotentialNewImage &&
                  (currentApiRole === 'user' || currentApiRole === 'developer')
                ) {
                  return {
                    type: 'input_image',
                    image_url: appPart.uri,
                  } as OpenAI.Responses.Request.InputImagePart
                } else if (
                  currentApiRole === 'user' ||
                  currentApiRole === 'developer'
                ) {
                  return {
                    type: 'input_text',
                    text: '[User previously sent an image]',
                  }
                }
                return null
              } else if (appPart.type === 'app_file') {
                if (!appPart.fileId) return null
                if (
                  currentApiRole === 'user' ||
                  currentApiRole === 'developer'
                ) {
                  return {
                    type: 'input_file',
                    file_id: appPart.fileId,
                  } as OpenAI.Responses.Request.InputFilePart
                }
                return null
              } else if (appPart.type === 'app_generated_image_path') {
                if (
                  currentApiRole !== 'user' &&
                  currentApiRole !== 'developer'
                ) {
                  return {
                    type: 'output_text',
                    text: '[Assistant previously generated an image]',
                  }
                }
                return null
              }
              return null
            })
            .filter(
              p => p !== null
            ) as OpenAI.Responses.Request.ContentPartLike[]
        }
        apiItemPartial.content =
          messageContentParts.length > 0
            ? messageContentParts
            : [{ type: 'input_text', text: '' }]

        if (
          currentApiRole === 'assistant' &&
          msg.tool_calls &&
          settingsStore.config.aiProvider === 'openrouter'
        ) {
          apiItemPartial.tool_calls = msg.tool_calls
        }
      }
      apiInput.push(apiItemPartial)
    }
    return apiInput
  }

  async function _processStreamLogic(
    stream: AsyncIterable<OpenAI.Responses.StreamEvent>,
    placeholderTempId: string,
    isContinuationAfterTool: boolean
  ): Promise<{ streamEndedNormally: boolean }> {
    let currentSentence = ''
    let currentAssistantApiMessageId: string | null = null
    const functionCallArgsBuffer: Record<string, string> = {}
    let streamEndedNormally = true

    const sendToTTS = async (text: string) => {
      if (text.trim()) {
        ttsAbortController.value = new AbortController()
        try {
          const ttsResponse = await api.ttsStream(
            text,
            ttsAbortController.value.signal
          )
          if (
            queueAudioForPlayback(ttsResponse) &&
            audioState.value !== 'SPEAKING'
          ) {
            setAudioState('SPEAKING')
          }
        } catch (error: any) {
          if (error.name !== 'AbortError') {
            console.error('TTS stream creation failed:', error)
          }
        }
      }
    }

    try {
      for await (const event of stream) {
        if (event.type === 'response.created') {
          currentResponseId.value = event.response.id
          generalStore.updateMessageApiResponseIdByTempId(
            placeholderTempId,
            event.response.id
          )
        }

        if (
          event.type === 'response.output_item.added' ||
          event.type === 'response.output_item.updated'
        ) {
          if (
            event.item.type === 'message' &&
            event.item.role === 'assistant'
          ) {
            currentAssistantApiMessageId = event.item.id
            if (currentAssistantApiMessageId) {
              generalStore.updateMessageApiIdByTempId(
                placeholderTempId,
                currentAssistantApiMessageId
              )
            }
          }
        }

        if (
          event.type === 'response.output_text.delta' &&
          event.item_id === currentAssistantApiMessageId
        ) {
          const textChunk = event.delta || ''
          currentSentence += textChunk
          generalStore.appendMessageDeltaByTempId(placeholderTempId, textChunk)
          if (textChunk.match(/[.!?]\s*$/) || textChunk.includes('\n')) {
            await sendToTTS(currentSentence)
            currentSentence = ''
          }
        }

        if (event.type === 'response.function_call_arguments.delta') {
          const itemId = event.item_id
          functionCallArgsBuffer[itemId] =
            (functionCallArgsBuffer[itemId] || '') + (event.delta || '')
        }

        if (
          event.type === 'response.output_item.done' &&
          event.item.type === 'function_call'
        ) {
          const functionCallPayload =
            event.item as OpenAI.Responses.FunctionCall
          let args = {}
          try {
            args = JSON.parse(
              functionCallArgsBuffer[functionCallPayload.id] || '{}'
            )
          } catch (e) {
            console.error('Error parsing function call arguments:', e)
          }
          functionCallPayload.arguments = args
          generalStore.addToolCallToMessageByTempId(
            placeholderTempId,
            functionCallPayload
          )
          await handleToolCall(functionCallPayload, currentResponseId.value)
          return { streamEndedNormally: true }
        }

        if (event.type === 'response.image_generation_call.in_progress') {
          console.log('Image generation started:', event.item_id)
          setAudioState('GENERATING_IMAGE')
        }

        if (event.type === 'response.image_generation_call.partial_image') {
          const imageGenerationId = event.item_id
          const base64Content = event.partial_image_b64
          const partialIndex = event.partial_image_index + 1

          console.log(
            `Received partial image ${partialIndex} for generation ${imageGenerationId}`
          )

          try {
            const saveResult = await window.ipcRenderer.invoke(
              'save-image-from-base64',
              {
                base64Data: base64Content,
                fileName: `partial_${imageGenerationId}_${partialIndex}_${Date.now()}.png`,
                isPartial: true,
              }
            )

            if (saveResult.success) {
              updateImageContentPartByGenerationId(
                placeholderTempId,
                imageGenerationId,
                saveResult.relativePath,
                saveResult.absolutePath,
                true,
                partialIndex
              )
            }
          } catch (error) {
            console.error('Failed to save partial image:', error)
          }
        }

        if (
          event.type === 'response.output_item.done' &&
          event.item?.type === 'image_generation_call'
        ) {
          const imageItem = event.item
          if (imageItem.result) {
            const imageGenerationId = imageItem.id
            const finalBase64Content = imageItem.result

            console.log(
              `Received final image for generation ${imageGenerationId}`
            )

            try {
              const saveResult = await window.ipcRenderer.invoke(
                'save-image-from-base64',
                {
                  base64Data: finalBase64Content,
                  fileName: `final_${imageGenerationId}_${Date.now()}.png`,
                  isPartial: false,
                }
              )

              if (saveResult.success) {
                updateImageContentPartByGenerationId(
                  placeholderTempId,
                  imageGenerationId,
                  saveResult.relativePath,
                  saveResult.absolutePath,
                  false
                )
              }
            } catch (error) {
              console.error('Failed to save final image:', error)
            }

            if (audioState.value === 'GENERATING_IMAGE') {
              setAudioState('WAITING_FOR_RESPONSE')
            }
          }
        }

        if (event.type === 'error') {
          streamEndedNormally = false
          console.error('Streaming error event:', event.error)
          break
        }
      }
      await sendToTTS(currentSentence)
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        streamEndedNormally = false
        console.error('Error processing stream:', error)
      }
    } finally {
      if (streamEndedNormally) {
        const finalizationInterval = setInterval(() => {
          if (generalStore.audioPlayer && !generalStore.audioPlayer.paused)
            return
          if (generalStore.audioQueue.length > 0) return

          if (
            audioState.value === 'SPEAKING' ||
            audioState.value === 'WAITING_FOR_RESPONSE'
          ) {
            setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
          }
          clearInterval(finalizationInterval)
          if (!isContinuationAfterTool) {
            triggerConversationSummarization()
          }
        }, 250)
      }
    }
    return { streamEndedNormally }
  }

  async function handleToolCall(
    toolCall: OpenAI.Responses.FunctionCall,
    originalResponseIdForTool: string | null
  ) {
    const functionName = toolCall.name
    const functionArgs = toolCall.arguments as object

    const toolStatusMessage = getToolStatusMessage(functionName, functionArgs)
    generalStore.addMessageToHistory({
      role: 'system',
      content: [{ type: 'app_text', text: toolStatusMessage }],
    })

    let resultString: string
    try {
      resultString = await executeFunction(functionName, functionArgs)
    } catch (error) {
      console.error('Tool execution failed:', error)
      resultString = `Error: Tool execution failed - ${error.message || 'Unknown error'}`
    }

    generalStore.addMessageToHistory({
      role: 'tool',
      tool_call_id: toolCall.call_id,
      name: functionName,
      content: resultString,
    })

    const isSimpleAction = [
      'open_path',
      'manage_clipboard',
      'execute_command',
    ].includes(functionName)
    const isSuccessfulResult =
      resultString.includes('success') || resultString.includes('Successfully')

    if (isSimpleAction && isSuccessfulResult) {
      console.log(
        `[ConversationStore] Adding completion message for successful ${functionName} action`
      )

      const completionMessage: ChatMessage = {
        role: 'assistant',
        content: [
          { type: 'app_text', text: getCompletionMessage(functionName) },
        ],
      }
      generalStore.addMessageToHistory(completionMessage)

      setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      return
    }

    const isNewChainAfterTool = currentResponseId.value === null
    const nextApiInput = await buildApiInput(isNewChainAfterTool)

    const afterToolPlaceholder: ChatMessage = {
      role: 'assistant',
      content: [{ type: 'app_text', text: '' }],
    }
    const afterToolPlaceholderTempId =
      generalStore.addMessageToHistory(afterToolPlaceholder)

    llmAbortController.value = new AbortController()
    try {
      const continuedStream = await api.createOpenAIResponse(
        nextApiInput,
        originalResponseIdForTool,
        true,
        settingsStore.config.assistantSystemPrompt,
        llmAbortController.value.signal
      )
      await _processStreamLogic(
        continuedStream,
        afterToolPlaceholderTempId,
        true
      )
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error in continued stream after tool call:', error)
        const errorContent = parseErrorMessage(error)
        generalStore.updateMessageContentByTempId(afterToolPlaceholderTempId, [
          errorContent,
        ])
        setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      }
    }
  }

  const chat = async () => {
    if (!isInitialized.value) {
      console.warn('Conversation store not initialized.')
      return
    }
    currentConversationTurnId.value = `turn-${Date.now()}`
    setAudioState('WAITING_FOR_RESPONSE')

    const isNewChain = currentResponseId.value === null
    const constructedApiInput = await buildApiInput(isNewChain)

    const contextMessages: OpenAI.Responses.Request.InputItemLike[] = []

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

    const latestUserMessageContent = chatHistory.value.find(
      m => m.role === 'user'
    )?.content
    if (latestUserMessageContent && Array.isArray(latestUserMessageContent)) {
      const textForThoughtRetrieval = latestUserMessageContent
        .filter(p => p.type === 'app_text' && p.text)
        .map(p => p.text)
        .join(' ')

      if (textForThoughtRetrieval) {
        const relevantThoughts = await api.retrieveRelevantThoughtsForPrompt(
          textForThoughtRetrieval
        )
        if (relevantThoughts.length > 0) {
          const thoughtsBlock =
            'Relevant thoughts from our past conversation (for context):\n' +
            relevantThoughts.map(t => `- ${t}`).join('\n')
          contextMessages.push({
            role: 'user',
            content: [{ type: 'input_text', text: thoughtsBlock }],
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
      await _processStreamLogic(streamResult, placeholderTempId, false)
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error starting OpenAI response stream:', error)

        if (
          error.message?.includes('No tool call found for function call output')
        ) {
          console.log(
            '[Error Recovery] Function call context lost, resetting conversation chain'
          )
          currentResponseId.value = null
          generalStore.updateMessageContentByTempId(
            placeholderTempId,
            'I apologize, there was an issue with the previous function call. Let me help you with a fresh start.'
          )
        } else {
          const errorContent = parseErrorMessage(error)
          generalStore.updateMessageContentByTempId(placeholderTempId, [
            errorContent,
          ])
        }

        setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')

        llmAbortController.value = null
      }
    }
  }

  const transcribeAudioMessage = async (
    audioArrayBuffer: ArrayBuffer
  ): Promise<string> => {
    const { sttProvider } = settingsStore.config
    try {
      if (sttProvider === 'openai') {
        return await api.transcribeWithOpenAI(audioArrayBuffer)
      } else {
        return await api.transcribeWithGroq(audioArrayBuffer)
      }
    } catch (error: any) {
      generalStore.statusMessage = 'Error: Transcription failed'
      console.error('Transcription service error:', error)
      return ''
    }
  }

  async function fetchModels() {
    const provider = settingsStore.config.aiProvider

    if (provider === 'openai' && !settingsStore.config.VITE_OPENAI_API_KEY) {
      console.warn('Cannot fetch models: OpenAI API Key is missing.')
      return
    } else if (provider === 'openrouter' && !settingsStore.config.VITE_OPENROUTER_API_KEY) {
      console.warn('Cannot fetch models: OpenRouter API Key is missing.')
      return
    } else if (provider === 'ollama' && !settingsStore.config.ollamaBaseUrl) {
      console.warn('Cannot fetch models: Ollama Base URL is missing.')
      return
    } else if (provider === 'lm-studio' && !settingsStore.config.lmStudioBaseUrl) {
      console.warn('Cannot fetch models: LM Studio Base URL is missing.')
      return
    }

    try {
      availableModels.value = await api.fetchOpenAIModels()
    } catch (error: any) {
      console.error('Failed to fetch models:', error.message)
      const providerNameMap = {
        'openai': 'OpenAI',
        'openrouter': 'OpenRouter', 
        'ollama': 'Ollama',
        'lm-studio': 'LM Studio'
      }
      const providerName = providerNameMap[provider] || provider
      generalStore.statusMessage = `Error: Could not fetch ${providerName} models.`
      availableModels.value = []
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
      await _processStreamLogic(streamResult, placeholderTempId, false)
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error starting OpenAI response stream:', error)
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
