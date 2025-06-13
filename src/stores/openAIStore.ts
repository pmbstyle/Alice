import { ref, onUnmounted } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import type OpenAI from 'openai'

import {
  createOpenAIResponse,
  ttsStream,
  getOpenAIClient,
  createSummarizationResponse,
  createContextAnalysisResponse,
} from '../api/openAI/responsesApi'
import { transcribeAudio as transcribeAudioGroq } from '../api/groq/stt'
import { transcribeAudioOpenAI } from '../api/openAI/stt'
import {
  retrieveRelevantThoughtsForPrompt,
  indexMessageForThoughts,
} from '../api/openAI/assistant'

import { useGeneralStore } from './generalStore'
import { useSettingsStore } from './settingsStore'
import { executeFunction } from '../utils/functionCaller'
import eventBus from '../utils/eventBus'

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
  tool_calls?: OpenAI.Responses.FunctionCall[]
}

interface RawMessageForSummarization {
  role: string
  text_content: string
  created_at: string
}

export const useConversationStore = defineStore('conversation', () => {
  const generalStore = useGeneralStore()
  const settingsStore = useSettingsStore()
  const {
    setAudioState,
    queueAudioForPlayback,
    updateImageContentPartByGenerationId,
    stopPlaybackAndClearQueue,
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
      currentResponseId.value = null
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

    const essentialCheckPassed = settingsStore.isProduction
      ? settingsStore.areEssentialSettingsProvided
      : !!settingsStore.config.VITE_OPENAI_API_KEY &&
        !!settingsStore.config.assistantModel &&
        !!settingsStore.config.SUMMARIZATION_MODEL &&
        (settingsStore.config.sttProvider === 'openai' ||
          (settingsStore.config.sttProvider === 'groq' &&
            !!settingsStore.config.VITE_GROQ_API_KEY))

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
    try {
      const summaryResult = await window.ipcRenderer.invoke(
        'summaries:get-latest-summary',
        {}
      )
      if (
        summaryResult.success &&
        summaryResult.data &&
        summaryResult.data.summary_text
      ) {
        console.log(
          '[Initializer] Loaded summary from previous session:',
          summaryResult.data.summary_text.substring(0, 100) + '...'
        )
      } else {
        console.log(
          '[Initializer] No previous session summary found or error fetching it.'
        )
      }
    } catch (e) {
      console.error('[Initializer] Error fetching latest summary on init:', e)
    }
    return true
  }

  const triggerConversationSummarization = async () => {
    if (isSummarizing.value) {
      console.log('[Summarizer] Summarization already in progress. Skipping.')
      return
    }
    isSummarizing.value = true
    console.log('[Summarizer] Starting conversation summarization...')

    try {
      const conversationIdForSummary =
        currentConversationTurnId.value || currentResponseId.value

      const messagesResult = await window.ipcRenderer.invoke(
        'summaries:get-recent-messages',
        {
          limit: settingsStore.config.SUMMARIZATION_MESSAGE_COUNT,
        }
      )

      if (
        messagesResult.success &&
        messagesResult.data &&
        messagesResult.data.length > 0
      ) {
        const rawMessages: RawMessageForSummarization[] = messagesResult.data
        const formattedMessages = rawMessages.map(m => ({
          role: m.role,
          content: m.text_content || '[content missing]',
        }))

        const [emotionalContext, factualSummary] = await Promise.all([
          createContextAnalysisResponse(
            formattedMessages,
            settingsStore.config.SUMMARIZATION_MODEL
          ),
          createSummarizationResponse(
            formattedMessages,
            settingsStore.config.SUMMARIZATION_MODEL,
            settingsStore.config.SUMMARIZATION_SYSTEM_PROMPT
          ),
        ])

        if (emotionalContext) {
          ephemeralEmotionalContext.value = emotionalContext
          console.log(
            '[Summarizer] Captured ephemeral emotional context:',
            emotionalContext
          )
        }

        if (factualSummary) {
          await window.ipcRenderer.invoke('summaries:save-summary', {
            summaryText: factualSummary,
            summarizedMessagesCount: rawMessages.length,
            conversationId: conversationIdForSummary,
          })
          console.log(
            '[Summarizer] Factual conversation summary saved.',
            factualSummary
          )
        } else {
          console.warn('[Summarizer] Failed to generate factual summary.')
        }
      } else if (messagesResult.data && messagesResult.data.length === 0) {
        console.log(
          '[Summarizer] No messages found to summarize for this turn/conversation.'
        )
      } else {
        console.error(
          '[Summarizer] Failed to fetch messages for summarization:',
          messagesResult.error
        )
      }
    } catch (error) {
      console.error('[Summarizer] Error during summarization process:', error)
    } finally {
      isSummarizing.value = false
      console.log('[Summarizer] Summarization process finished.')
    }
  }

  const buildApiInput = async (): Promise<
    OpenAI.Responses.Request.InputItemLike[]
  > => {
    const historyToBuildFrom = [...chatHistory.value]
    const apiInput: OpenAI.Responses.Request.InputItemLike[] = []
    const recentHistory = historyToBuildFrom
      .slice(0, settingsStore.config.MAX_HISTORY_MESSAGES_FOR_API)
      .reverse()

    let latestSummaryText: string | null = null
    try {
      const summaryResult = await window.ipcRenderer.invoke(
        'summaries:get-latest-summary',
        {}
      )
      if (
        summaryResult.success &&
        summaryResult.data &&
        summaryResult.data.summary_text
      ) {
        latestSummaryText = summaryResult.data.summary_text
      }
    } catch (e) {
      console.error('Error fetching latest summary:', e)
    }

    if (latestSummaryText) {
      console.log(
        '[buildApiInput] Prepending summary to API input:',
        latestSummaryText.substring(0, 100) + '...'
      )
      const summaryContent = `[CONVERSATION_SUMMARY_START]\nContext from previous conversation segment:\n${latestSummaryText}\n[CONVERSATION_SUMMARY_END]`
      apiInput.push({
        role: 'system',
        content: [{ type: 'input_text', text: summaryContent }],
      })
    } else {
      console.log(
        '[buildApiInput] No latest summary found to prepend for current API call.'
      )
    }

    let lastUserMessageInFullHistoryId: string | null = null
    for (let i = 0; i < historyToBuildFrom.length; i++) {
      if (historyToBuildFrom[i].role === 'user') {
        lastUserMessageInFullHistoryId =
          historyToBuildFrom[i].local_id_temp || null
        break
      }
    }

    for (const msg of recentHistory) {
      let apiItemPartial: Partial<OpenAI.Responses.Request.InputItemLike> & {
        type?: string
        role?: string
        content?: any
        call_id?: string
        name?: string
      }

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
        apiItemPartial = { role: 'system', content: '' }
        if (msg.name) apiItemPartial.name = msg.name
        if (typeof msg.content === 'string') {
          apiItemPartial.content = msg.content
        } else if (
          Array.isArray(msg.content) &&
          msg.content[0]?.type === 'app_text' &&
          typeof msg.content[0].text === 'string'
        ) {
          apiItemPartial.content = msg.content[0].text
        } else {
          apiItemPartial.content =
            '[System message content not in expected text format]'
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

        if (messageContentParts.length === 0) {
          const typeForPart =
            currentApiRole === 'user' || currentApiRole === 'developer'
              ? 'input_text'
              : 'output_text'
          messageContentParts = [{ type: typeForPart, text: '' }]
        }
        apiItemPartial.content = messageContentParts
      }
      apiInput.push(apiItemPartial as OpenAI.Responses.Request.InputItemLike)
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
    const activeImageGenerationCallId = ref<string | null>(null)

    const sendToTTS = async (text: string) => {
      if (text.trim()) {
        const textForTTS = text
          .trim()
          .replace(
            /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
            ''
          )
        if (textForTTS) {
          ttsAbortController.value = new AbortController()
          try {
            const ttsResponse = await ttsStream(
              textForTTS,
              ttsAbortController.value.signal
            )
            if (
              queueAudioForPlayback(ttsResponse) &&
              audioState.value !== 'SPEAKING' &&
              audioState.value !== 'GENERATING_IMAGE'
            ) {
              setAudioState('SPEAKING')
            }
          } catch (error: any) {
            if (error.name !== 'AbortError') {
              console.error('TTS stream creation failed:', error)
            }
          } finally {
            if (
              ttsAbortController.value &&
              !ttsAbortController.value.signal.aborted
            ) {
              ttsAbortController.value = null
            }
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
          if (event.item.type === 'image_generation_call') {
            activeImageGenerationCallId.value = event.item.id
            setAudioState('GENERATING_IMAGE')
            generalStore.statusMessage = '🎨 Generating image...'
          }
        }

        if (event.type === 'response.image_generation_call.partial_image') {
          const imageGenCallId = event.item_id
          const partialIdx = event.partial_image_index
          const imageBase64 = event.partial_image_b64

          if (
            imageBase64 &&
            imageGenCallId === activeImageGenerationCallId.value
          ) {
            generalStore.statusMessage = `🎨 Generating image...`
            const saveResult = await window.ipcRenderer.invoke(
              'image:save-generated',
              imageBase64
            )

            if (
              saveResult.success &&
              saveResult.fileName &&
              saveResult.absolutePathForOpening
            ) {
              updateImageContentPartByGenerationId(
                placeholderTempId,
                imageGenCallId,
                saveResult.fileName,
                saveResult.absolutePathForOpening,
                true,
                partialIdx + 1
              )
            } else {
              console.error('Failed to save partial image:', saveResult?.error)
            }
          }
        }

        if (
          event.type === 'response.output_item.done' &&
          event.item.type === 'image_generation_call'
        ) {
          setAudioState('GENERATING_IMAGE')
          generalStore.statusMessage = '🖼️ Finalizing image...'
          const finalImageCall =
            event.item as OpenAI.Responses.ImageGenerationCallOutput
          const imageGenCallId = finalImageCall.id

          if (
            finalImageCall.result &&
            imageGenCallId === activeImageGenerationCallId.value
          ) {
            const imageBase64 = finalImageCall.result
            const saveResult = await window.ipcRenderer.invoke(
              'image:save-generated',
              imageBase64
            )
            if (
              saveResult &&
              saveResult.success &&
              saveResult.fileName &&
              saveResult.absolutePathForOpening
            ) {
              updateImageContentPartByGenerationId(
                placeholderTempId,
                imageGenCallId,
                saveResult.fileName,
                saveResult.absolutePathForOpening,
                false
              )
              generalStore.statusMessage = '✨ Image complete!'
            } else {
              generalStore.addContentPartToMessageByTempId(placeholderTempId, {
                type: 'app_text',
                text: `\n[Error saving final image: ${saveResult?.error || 'IPC Error'}]`,
              })
              generalStore.statusMessage = '⚠️ Error saving final image.'
            }
          } else {
            generalStore.addContentPartToMessageByTempId(placeholderTempId, {
              type: 'app_text',
              text: '\n[Image generation did not return final image data]',
            })
            generalStore.statusMessage = '⚠️ No final image data.'
          }
          activeImageGenerationCallId.value = null
          if (
            generalStore.audioQueue.length === 0 &&
            audioState.value === 'GENERATING_IMAGE'
          ) {
            setTimeout(() => {
              setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
            }, 1500)
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
          const itemId = functionCallPayload.id
          let args = {}

          try {
            const rawArgs =
              functionCallArgsBuffer[itemId] ||
              (typeof functionCallPayload.arguments === 'string'
                ? functionCallPayload.arguments
                : '{}')
            args = JSON.parse(rawArgs)
          } catch (e) {
            console.error(
              `[ProcessStream] Error parsing arguments for function call ${itemId}:`,
              functionCallArgsBuffer[itemId],
              e
            )
          }
          functionCallPayload.arguments = args

          generalStore.addToolCallToMessageByTempId(
            placeholderTempId,
            functionCallPayload
          )

          if (audioState.value === 'SPEAKING') stopPlaybackAndClearQueue()

          await handleToolCall(functionCallPayload, currentResponseId.value)

          return { streamEndedNormally: true }
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

        if (event.type === 'response.completed') {
          currentResponseId.value = event.response.id
          const finalMessage = event.response.output?.find(
            o => o.type === 'message' && o.id === currentAssistantApiMessageId
          ) as OpenAI.Responses.MessageResponse | undefined
          if (finalMessage?.tool_calls) {
            generalStore.updateMessageToolCallsByTempId(
              placeholderTempId,
              finalMessage.tool_calls
            )
          }
        }

        if (event.type === 'error') {
          streamEndedNormally = false
          console.error('Streaming error event:', event.error)
          const errorMsg = `Error: ${event.error?.message || 'Streaming error'}`
          generalStore.statusMessage = errorMsg
          generalStore.updateMessageContentByTempId(placeholderTempId, errorMsg)
          activeImageGenerationCallId.value = null
          break
        }
      }

      await sendToTTS(currentSentence)
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        streamEndedNormally = false
        activeImageGenerationCallId.value = null
        console.error('Error processing stream:', error)
        const errorMsg = `Error: Processing response failed (${error.message})`
        generalStore.statusMessage = errorMsg
        generalStore.updateMessageContentByTempId(placeholderTempId, errorMsg)
      } else {
        console.log('[ProcessStream] LLM stream aborted by user.')
        streamEndedNormally = true
      }
    } finally {
      llmAbortController.value = null
      if (streamEndedNormally) {
        const finalizationInterval = setInterval(() => {
          if (generalStore.audioPlayer && !generalStore.audioPlayer.paused) {
            return
          }

          if (generalStore.audioQueue.length > 0) {
            return
          }

          console.log(
            '[Finalizer] Playback and queue are empty. Finalizing state.'
          )
          if (
            audioState.value === 'SPEAKING' ||
            audioState.value === 'WAITING_FOR_RESPONSE'
          ) {
            setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
          }
          clearInterval(finalizationInterval)

          if (!activeImageGenerationCallId.value && !isContinuationAfterTool) {
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
    let afterToolPlaceholderTempId: string | null = null

    if (!functionName || functionArgs === undefined) {
      console.error('Invalid tool_call object received:', toolCall)
      generalStore.addMessageToHistory({
        role: 'system',
        content: [
          {
            type: 'app_text',
            text: `System error: Invalid tool call from AI for ${toolCall.id}.`,
          },
        ],
      })
      if (audioState.value === 'WAITING_FOR_RESPONSE')
        setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      return
    }

    const toolStatusMessage = getToolStatusMessage(functionName)
    generalStore.addMessageToHistory({
      role: 'system',
      content: [{ type: 'app_text', text: toolStatusMessage }],
    })

    if (generalStore.isTTSEnabled) {
      try {
        const ttsResponse = await ttsStream(
          toolStatusMessage,
          new AbortController().signal
        )
        if (
          queueAudioForPlayback(ttsResponse) &&
          audioState.value !== 'SPEAKING' &&
          generalStore.audioQueue.length > 0 &&
          audioState.value !== 'GENERATING_IMAGE'
        )
          setAudioState('SPEAKING')
      } catch (err) {
        console.warn('TTS failed for tool status message:', err)
      }
    }

    let resultString: string
    try {
      resultString = await executeFunction(functionName, functionArgs)
    } catch (error: any) {
      console.error(`Error executing ${functionName}:`, error)
      resultString = `Error executing tool ${functionName}: ${error.message || 'Unknown error'}`
    }

    const toolResponseMessage: ChatMessage = {
      role: 'tool',
      tool_call_id: toolCall.call_id,
      name: functionName,
      content: resultString,
    }
    generalStore.addMessageToHistory(toolResponseMessage)
    await indexMessageForThoughts(
      currentConversationTurnId.value ||
        originalResponseIdForTool ||
        `tool_resp_conv_${Date.now()}`,
      'tool',
      toolResponseMessage
    )

    let finalInstructionsForToolFollowUp =
      settingsStore.config.assistantSystemPrompt || ''
    let contextTextForThoughts = ''

    const userMessages = chatHistory.value.filter(m => m.role === 'user')
    if (userMessages.length > 0) {
      const latestUserMsg = userMessages[0]
      if (typeof latestUserMsg.content === 'string') {
        contextTextForThoughts = latestUserMsg.content
      } else if (Array.isArray(latestUserMsg.content)) {
        const textPart = latestUserMsg.content.find(
          part => part.type === 'app_text'
        )
        if (textPart && textPart.text) contextTextForThoughts = textPart.text
      }
    }

    if (contextTextForThoughts) {
      try {
        const relevantThoughtsArray = await retrieveRelevantThoughtsForPrompt(
          contextTextForThoughts
        )
        let thoughtsBlock =
          'Relevant thoughts from past conversation (use these to inform your answer if applicable):\n'
        thoughtsBlock +=
          relevantThoughtsArray.length > 0
            ? relevantThoughtsArray.map(t => `- ${t}`).join('\n')
            : 'No relevant thoughts...'
        finalInstructionsForToolFollowUp = `${thoughtsBlock}\n\n---\n\n${settingsStore.config.assistantSystemPrompt || ''}`
      } catch (error) {
        console.error('Error retrieving thoughts for tool follow-up:', error)
      }
    } else {
      finalInstructionsForToolFollowUp = `Relevant thoughts from past conversation (use these to inform your answer if applicable):\nNo relevant thoughts...\n\n---\n\n${settingsStore.config.assistantSystemPrompt || ''}`
    }

    const nextApiInput = await buildApiInput()

    try {
      llmAbortController.value = new AbortController()
      setAudioState('WAITING_FOR_RESPONSE')
      const afterToolPlaceholder: ChatMessage = {
        role: 'assistant',
        content: [{ type: 'app_text', text: '' }],
      }
      afterToolPlaceholderTempId =
        generalStore.addMessageToHistory(afterToolPlaceholder)

      const continuedStream = (await createOpenAIResponse(
        nextApiInput,
        originalResponseIdForTool,
        true,
        finalInstructionsForToolFollowUp,
        llmAbortController.value.signal
      )) as AsyncIterable<OpenAI.Responses.StreamEvent>

      await _processStreamLogic(
        continuedStream,
        afterToolPlaceholderTempId,
        true
      )
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error in continued stream after tool call:', error)
        const errorMsg = `Error: Tool interaction follow-up failed (${error.message})`
        generalStore.statusMessage = errorMsg
        if (afterToolPlaceholderTempId) {
          generalStore.updateMessageContentByTempId(
            afterToolPlaceholderTempId,
            errorMsg
          )
        } else {
          generalStore.addMessageToHistory({
            role: 'assistant',
            content: [{ type: 'app_text', text: errorMsg }],
          })
        }
        setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      }
    } finally {
      llmAbortController.value = null
    }
  }

  const chat = async () => {
    if (!isInitialized.value) {
      generalStore.statusMessage =
        'Error: Chat not ready (AI not fully initialized).'
      setAudioState('IDLE')
      console.warn('OpenAI store not initialized. Cannot start chat.')
      return
    }
    currentConversationTurnId.value = `turn-${Date.now()}`

    const lastMessage = chatHistory.value[0]

    if (
      lastMessage &&
      lastMessage.role === 'assistant' &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0
    ) {
      const pendingToolCallsToProcess = [...lastMessage.tool_calls]
      const originalMessageTempId = lastMessage.local_id_temp
      const responseIdForTheseToolCalls = lastMessage.api_response_id

      if (originalMessageTempId) {
        generalStore.updateMessageToolCallsByTempId(originalMessageTempId, [])
      } else {
        console.warn(
          '[Chat] Pending tool call: lastMessage had no local_id_temp. Cannot reliably clear its tool_calls.'
        )
        lastMessage.tool_calls = []
      }

      if (!responseIdForTheseToolCalls) {
        console.error(
          '[Chat] CRITICAL: lastMessage.api_response_id is missing for a pending tool call.',
          JSON.parse(JSON.stringify(lastMessage))
        )
        generalStore.addMessageToHistory({
          role: 'system',
          content: [
            {
              type: 'app_text',
              text: 'Error: Internal state error processing pending tool call. Missing response context.',
            },
          ],
        })
        setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
        return
      }
      setAudioState('WAITING_FOR_RESPONSE')

      for (const pendingToolCall of pendingToolCallsToProcess) {
        await handleToolCall(pendingToolCall, responseIdForTheseToolCalls)
      }
      return
    }

    setAudioState('WAITING_FOR_RESPONSE')
    const constructedApiInput = await buildApiInput()

    let currentUserInputTextForThoughts = ''
    const latestMessageInHistory = chatHistory.value[0]
    if (latestMessageInHistory && latestMessageInHistory.role === 'user') {
      if (typeof latestMessageInHistory.content === 'string') {
        currentUserInputTextForThoughts = latestMessageInHistory.content
      } else if (Array.isArray(latestMessageInHistory.content)) {
        const textPart = latestMessageInHistory.content.find(
          part => part.type === 'app_text'
        )
        if (textPart && textPart.text)
          currentUserInputTextForThoughts = textPart.text
      }
    }

    let thoughtsBlock = ''
    if (currentUserInputTextForThoughts) {
      try {
        const relevantThoughtsArray = await retrieveRelevantThoughtsForPrompt(
          currentUserInputTextForThoughts
        )
        thoughtsBlock =
          'Relevant thoughts from past conversation (use these to inform your answer if applicable):\n'
        thoughtsBlock +=
          relevantThoughtsArray.length > 0
            ? relevantThoughtsArray.map(t => `- ${t}`).join('\n')
            : 'No relevant thoughts...'
      } catch (error) {
        console.error('Error retrieving or formatting thoughts:', error)
      }
    } else {
      thoughtsBlock =
        'Relevant thoughts from past conversation (use these to inform your answer if applicable):\nNo relevant thoughts...'
    }

    let dynamicSystemNote = ''
    if (ephemeralEmotionalContext.value) {
      dynamicSystemNote = `[System Note for Alice: Based on the last conversation segment, the user's tone was: "${ephemeralEmotionalContext.value}". Adapt your response accordingly.]\n\n`
      ephemeralEmotionalContext.value = null
    }

    const finalInstructions = `${dynamicSystemNote}${thoughtsBlock}\n\n---\n\n${settingsStore.config.assistantSystemPrompt || ''}`

    const assistantMessagePlaceholder: ChatMessage = {
      role: 'assistant',
      content: [{ type: 'app_text', text: '' }],
    }
    const placeholderTempId = generalStore.addMessageToHistory(
      assistantMessagePlaceholder
    )

    try {
      llmAbortController.value = new AbortController()
      const streamResult = await createOpenAIResponse(
        constructedApiInput,
        currentResponseId.value,
        true,
        finalInstructions,
        llmAbortController.value.signal
      )
      await _processStreamLogic(
        streamResult as AsyncIterable<OpenAI.Responses.StreamEvent>,
        placeholderTempId,
        false
      )
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error starting OpenAI response stream:', error)
        const errorMsg = `Error: Could not start assistant (${error.message})`
        generalStore.statusMessage = errorMsg
        if (placeholderTempId)
          generalStore.updateMessageContentByTempId(placeholderTempId, errorMsg)
        else
          generalStore.addMessageToHistory({
            role: 'assistant',
            content: [{ type: 'app_text', text: errorMsg }],
          })
        setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      }
    } finally {
      llmAbortController.value = null
    }
  }

  const transcribeAudioMessage = async (
    audioArrayBuffer: ArrayBuffer
  ): Promise<string> => {
    const { sttProvider, VITE_OPENAI_API_KEY, VITE_GROQ_API_KEY } =
      settingsStore.config

    try {
      if (sttProvider === 'openai') {
        if (!VITE_OPENAI_API_KEY) {
          generalStore.statusMessage =
            'Error: OpenAI API Key for STT is missing.'
          return ''
        }
        return await transcribeAudioOpenAI(audioArrayBuffer)
      } else {
        if (!VITE_GROQ_API_KEY) {
          generalStore.statusMessage = 'Error: Groq API Key for STT is missing.'
          return ''
        }
        return await transcribeAudioGroq(audioArrayBuffer)
      }
    } catch (error) {
      generalStore.statusMessage = 'Error: Transcription service failed'
      console.error('Transcription service error:', error)
      return ''
    }
  }

  const uploadScreenshotToOpenAI = async (
    screenshotDataURI: string
  ): Promise<string | null> => {
    if (!screenshotDataURI) {
      console.warn(
        '[uploadScreenshotToOpenAI] Received empty screenshotDataURI.'
      )
      return null
    }
    if (screenshotDataURI.startsWith('data:image/')) {
      return screenshotDataURI
    }
    console.warn(
      '[uploadScreenshotToOpenAI] Provided URI is not a data URI. If this is a file path, it needs to be converted to a data URI or publicly accessible URL.'
    )
    return null
  }

  function getToolStatusMessage(toolName: string): string {
    switch (toolName) {
      case 'get_current_datetime':
        return '🕒 Looking at the clock...'
      case 'open_path':
        return '📂 Opening that for you...'
      case 'manage_clipboard':
        return '📋 Working with your clipboard...'
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
      case 'get_unread_emails':
        return '📧 Looking for unread emails...'
      case 'search_emails':
        return '📧 Searching emails...'
      case 'get_email_content':
        return '📧 Reading email content...'
      default:
        return `⚙️ Using tool: ${toolName}...`
    }
  }

  async function fetchModels() {
    if (!settingsStore.config.VITE_OPENAI_API_KEY) {
      console.warn('Cannot fetch models: OpenAI API Key is missing.')
      availableModels.value = []
      return
    }
    const openai = getOpenAIClient()
    try {
      const modelsPage = await openai.models.list()
      availableModels.value = modelsPage.data
        .filter(model => model.id.startsWith('gpt-'))
        .sort((a, b) => a.id.localeCompare(b.id))
    } catch (error: any) {
      console.error('Failed to fetch models:', error.message)
      generalStore.statusMessage = `Error: Could not fetch AI models (${error.message})`
      availableModels.value = []
    }
  }

  return {
    isInitialized,
    availableModels,
    initialize,
    chat,
    transcribeAudioMessage,
    fetchModels,
    currentResponseId,
    triggerConversationSummarization,
  }
})
