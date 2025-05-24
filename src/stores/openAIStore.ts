import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import type OpenAI from 'openai'

import {
  createOpenAIResponse,
  ttsStream,
  getOpenAIClient,
} from '../api/openAI/responsesApi'
import { transcribeAudio } from '../api/groq/stt'
import {
  retrieveRelevantThoughtsForPrompt,
  indexMessageForThoughts,
} from '../api/openAI/assistant'

import { useGeneralStore } from './generalStore'
import { useSettingsStore } from './settingsStore'
import { executeFunction } from '../utils/functionCaller'

export interface AppChatMessageContentPart {
  type: 'app_text' | 'app_image_uri'
  text?: string
  uri?: string
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

export const useConversationStore = defineStore('conversation', () => {
  const generalStore = useGeneralStore()
  const settingsStore = useSettingsStore()
  const { setAudioState, queueAudioForPlayback } = generalStore
  const { isRecordingRequested, audioState } = storeToRefs(generalStore)

  const currentResponseId = ref<string | null>(null)
  const isInitialized = ref<boolean>(false)
  const availableModels = ref<OpenAI.Models.Model[]>([])

  const initialize = async (): Promise<boolean> => {
    if (isInitialized.value) {
      return true
    }
    if (!settingsStore.initialLoadAttempted) {
      await settingsStore.loadSettings()
    }
    if (settingsStore.isProduction) {
      if (
        !settingsStore.config.VITE_OPENAI_API_KEY ||
        !settingsStore.config.assistantModel
      ) {
        generalStore.statusMessage =
          'Error: Core OpenAI settings (API Key/Model) not configured.'
        isInitialized.value = false
        return false
      }
    } else {
      if (!settingsStore.config.VITE_OPENAI_API_KEY)
        console.warn('[Dev] OpenAI API Key missing.')
      if (!settingsStore.config.assistantModel)
        console.warn('[Dev] Assistant model not set.')
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
    return true
  }

  const buildApiInput = (): OpenAI.Responses.Request.InputItemLike[] => {
    const historyToBuildFrom = [...generalStore.chatHistory]
    const apiInput: OpenAI.Responses.Request.InputItemLike[] = []
    const MAX_HISTORY_MESSAGES_FOR_API = 10
    const recentHistory = historyToBuildFrom
      .slice(0, MAX_HISTORY_MESSAGES_FOR_API)
      .reverse()

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
      }

      if (msg.role === 'tool') {
        apiItemPartial = {
          type: 'function_call_output',
          call_id: msg.tool_call_id,
          output:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
        }
      } else if (msg.role === 'system') {
        apiItemPartial = { role: 'system', content: '' }
        if (msg.name) (apiItemPartial as any).name = msg.name
        if (typeof msg.content === 'string') {
          apiItemPartial.content = msg.content
        } else if (
          Array.isArray(msg.content) &&
          msg.content[0]?.type === 'app_text'
        ) {
          apiItemPartial.content = msg.content[0].text || ''
        }
      } else {
        const currentApiRole = msg.role as 'user' | 'assistant' | 'developer'
        apiItemPartial = { role: currentApiRole, content: [] }

        if (msg.name && currentApiRole !== 'tool') {
          ;(apiItemPartial as any).name = msg.name
        }

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
                if (!appPart.uri) {
                  console.warn(
                    '[buildApiInput]   app_image_uri found but appPart.uri is empty/null. Skipping this part.'
                  )
                  return null
                }

                if (
                  isThisTheLastUserMessageWithPotentialNewImage &&
                  (currentApiRole === 'user' || currentApiRole === 'developer')
                ) {
                  return {
                    type: 'input_image',
                    image_url: appPart.uri,
                  }
                } else if (
                  currentApiRole === 'user' ||
                  currentApiRole === 'developer'
                ) {
                  return {
                    type: 'input_text',
                    text: '[User previously sent an image]',
                  }
                } else {
                  console.warn(
                    `[buildApiInput]   app_image_uri found for role ${currentApiRole} (not current user turn or not user/dev role). Skipping image data.`
                  )
                  return null
                }
              }
              console.warn(
                `[buildApiInput]   Unknown appPart type: ${appPart.type}. Skipping this part.`
              )
              return null
            })
            .filter(
              p => p !== null
            ) as OpenAI.Responses.Request.ContentPartLike[]
        }

        if (messageContentParts.length === 0) {
          console.warn(
            `[buildApiInput] Message (local_id: ${msg.local_id_temp}, role: ${currentApiRole}) resulted in empty content parts. Adding default empty text part.`
          )
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

  async function processStream(
    stream: AsyncIterable<OpenAI.Responses.StreamEvent>,
    placeholderTempId: string
  ) {
    let currentSentence = ''
    let currentAssistantApiMessageId: string | null = null
    const functionCallArgsBuffer: Record<string, string> = {}

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
            args = JSON.parse(
              functionCallArgsBuffer[itemId] ||
                (typeof functionCallPayload.arguments === 'string'
                  ? functionCallPayload.arguments
                  : '{}')
            )
          } catch (e) {
            console.error(
              `[processStream] Error parsing arguments for function call ${itemId}:`,
              functionCallArgsBuffer[itemId],
              e
            )
            args = {}
          }
          functionCallPayload.arguments = args

          generalStore.addToolCallToMessageByTempId(
            placeholderTempId,
            functionCallPayload
          )

          if (audioState.value === 'SPEAKING')
            generalStore.stopPlaybackAndClearQueue()
          await handleToolCall(functionCallPayload, currentResponseId.value)
          return
        }

        if (
          event.type === 'response.output_text.delta' &&
          event.item_id === currentAssistantApiMessageId
        ) {
          const textChunk = event.delta || ''
          currentSentence += textChunk
          generalStore.appendMessageDeltaByTempId(placeholderTempId, textChunk)
          if (textChunk.match(/[.!?]\s*$/) || textChunk.includes('\n')) {
            if (currentSentence.trim()) {
              const ttsResponse = await ttsStream(currentSentence.trim())
              if (
                queueAudioForPlayback(ttsResponse) &&
                audioState.value !== 'SPEAKING'
              )
                setAudioState('SPEAKING')
              currentSentence = ''
            }
          }
        }

        if (event.type === 'response.completed') {
          currentResponseId.value = event.response.id
          const finalMessage = event.response.output?.find(
            (o: any) =>
              o.type === 'message' && o.id === currentAssistantApiMessageId
          ) as OpenAI.Responses.MessageResponse
          if (finalMessage?.tool_calls) {
            generalStore.updateMessageToolCallsByTempId(
              placeholderTempId,
              finalMessage.tool_calls
            )
          }
        }

        if (event.type === 'error') {
          console.error('Streaming error event:', event.error)
          const errorMsg = `Error: ${event.error?.message || 'Streaming error'}`
          generalStore.statusMessage = errorMsg
          generalStore.updateMessageContentByTempId(placeholderTempId, errorMsg)
          break
        }
      }
      if (currentSentence.trim()) {
        const ttsResponse = await ttsStream(currentSentence.trim())
        if (
          queueAudioForPlayback(ttsResponse) &&
          audioState.value !== 'SPEAKING'
        )
          setAudioState('SPEAKING')
      }
    } catch (error: any) {
      console.error('Error processing stream:', error)
      const errorMsg = `Error: Processing response failed (${error.message})`
      generalStore.statusMessage = errorMsg
      generalStore.updateMessageContentByTempId(placeholderTempId, errorMsg)
    } finally {
      if (
        audioState.value === 'WAITING_FOR_RESPONSE' &&
        generalStore.audioQueue.length === 0
      ) {
        setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      }
    }
  }

  async function handleToolCall(
    toolCall: OpenAI.Responses.FunctionCall,
    originalResponseIdForTool: string | null
  ) {
    const functionName = toolCall.name
    const functionArgs = toolCall.arguments
    let afterToolPlaceholderTempId: string | null = null

    if (!functionName || functionArgs === undefined) {
      console.error(
        '[handleToolCall] Invalid tool_call object received:',
        toolCall
      )
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
        const ttsResponse = await ttsStream(toolStatusMessage)
        if (
          queueAudioForPlayback(ttsResponse) &&
          audioState.value !== 'SPEAKING' &&
          generalStore.audioQueue.length > 0
        )
          setAudioState('SPEAKING')
      } catch (err) {
        console.warn('TTS failed for tool status message:', err)
      }
    }

    let resultString: string
    try {
      resultString = await executeFunction(functionName, functionArgs as object)
    } catch (error: any) {
      console.error(`[handleToolCall] Error executing ${functionName}:`, error)
      resultString = `Error executing tool ${functionName}: ${error.message || 'Unknown error'}`
    }

    const toolResponseMessage: ChatMessage = {
      role: 'tool',
      tool_call_id: toolCall.call_id,
      name: functionName,
      content: resultString,
    }
    generalStore.addMessageToHistory(toolResponseMessage)

    let finalInstructionsForToolFollowUp =
      settingsStore.config.assistantSystemPrompt || ''
    let contextTextForThoughts = ''

    const userMessages = generalStore.chatHistory.filter(m => m.role === 'user')
    if (userMessages.length > 0) {
      const latestUserMsg = userMessages[0]
      if (typeof latestUserMsg.content === 'string') {
        contextTextForThoughts = latestUserMsg.content
      } else if (Array.isArray(latestUserMsg.content)) {
        const textPart = latestUserMsg.content.find(
          part => part.type === 'app_text'
        )
        if (textPart && textPart.text) {
          contextTextForThoughts = textPart.text
        }
      }
    }

    if (contextTextForThoughts) {
      try {
        console.log(
          '[openAIStore handleToolCall] Retrieving thoughts for tool follow-up, context:',
          contextTextForThoughts
        )
        const relevantThoughtsArray = await retrieveRelevantThoughtsForPrompt(
          contextTextForThoughts
        )
        console.log(
          '[openAIStore handleToolCall] Retrieved thoughts for tool follow-up:',
          relevantThoughtsArray
        )

        let thoughtsBlock =
          'Relevant thoughts from past conversation (use these to inform your answer if applicable):\n'
        if (relevantThoughtsArray && relevantThoughtsArray.length > 0) {
          thoughtsBlock += relevantThoughtsArray.map(t => `- ${t}`).join('\n')
        } else {
          thoughtsBlock += 'No relevant thoughts...'
        }
        finalInstructionsForToolFollowUp =
          thoughtsBlock +
          '\n\n---\n\n' +
          (settingsStore.config.assistantSystemPrompt || '')
      } catch (error) {
        console.error(
          '[openAIStore handleToolCall] Error retrieving or formatting thoughts for tool follow-up:',
          error
        )
        finalInstructionsForToolFollowUp =
          settingsStore.config.assistantSystemPrompt || ''
      }
    } else {
      console.warn(
        '[openAIStore handleToolCall] No context text found to fetch thoughts for tool follow-up.'
      )
      finalInstructionsForToolFollowUp =
        settingsStore.config.assistantSystemPrompt || ''
    }

    const nextApiInput = buildApiInput()

    try {
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
        finalInstructionsForToolFollowUp
      )) as AsyncIterable<OpenAI.Responses.StreamEvent>

      await processStreamAfterTool(continuedStream, afterToolPlaceholderTempId)
    } catch (error: any) {
      console.error(
        '[handleToolCall] Error in continued stream after tool call:',
        error
      )
      const errorMsg = `Error: Tool interaction follow-up failed (${error.message})`
      generalStore.statusMessage = errorMsg
      const lastMessage = generalStore.chatHistory.find(
        m => m.local_id_temp === afterToolPlaceholderTempId
      )
      if (lastMessage) {
        generalStore.updateMessageContentByTempId(
          lastMessage.local_id_temp!,
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
  }

  async function processStreamAfterTool(
    stream: AsyncIterable<OpenAI.Responses.StreamEvent>,
    messagePlaceholderTempId: string
  ) {
    let localCurrentSentence = ''
    let localAssistantApiMessageId: string | null = null
    try {
      for await (const event of stream) {
        if (event.type === 'response.created') {
          currentResponseId.value = event.response.id
          generalStore.updateMessageApiResponseIdByTempId(
            messagePlaceholderTempId,
            event.response.id
          )
        }
        if (
          event.type === 'response.output_item.added' &&
          event.item.type === 'message' &&
          event.item.role === 'assistant'
        ) {
          localAssistantApiMessageId = event.item.id
          generalStore.updateMessageApiIdByTempId(
            messagePlaceholderTempId,
            localAssistantApiMessageId
          )
        }
        if (
          event.type === 'response.output_text.delta' &&
          event.item_id === localAssistantApiMessageId
        ) {
          const textChunk = event.delta || ''
          localCurrentSentence += textChunk
          generalStore.appendMessageDeltaByTempId(
            messagePlaceholderTempId,
            textChunk
          )
          if (textChunk.match(/[.!?]\s*$/) || textChunk.includes('\n')) {
            if (localCurrentSentence.trim()) {
              const ttsResponse = await ttsStream(localCurrentSentence.trim())
              if (
                queueAudioForPlayback(ttsResponse) &&
                audioState.value !== 'SPEAKING'
              )
                setAudioState('SPEAKING')
              localCurrentSentence = ''
            }
          }
        }
        if (event.type === 'response.completed') {
          currentResponseId.value = event.response.id
          const finalMessage = event.response.output?.find(
            (o: any) =>
              o.type === 'message' && o.id === localAssistantApiMessageId
          ) as OpenAI.Responses.MessageResponse
          if (finalMessage?.tool_calls) {
            generalStore.updateMessageToolCallsByTempId(
              messagePlaceholderTempId,
              finalMessage.tool_calls
            )
          }
        }
        if (event.type === 'error') {
          console.error('Streaming error event (after tool):', event.error)
          const errorMsg = `Error: ${event.error?.message || 'Streaming error'}`
          generalStore.statusMessage = errorMsg
          generalStore.updateMessageContentByTempId(
            messagePlaceholderTempId,
            errorMsg
          )
          break
        }
      }
      if (localCurrentSentence.trim()) {
        const ttsResponse = await ttsStream(localCurrentSentence.trim())
        if (
          queueAudioForPlayback(ttsResponse) &&
          audioState.value !== 'SPEAKING'
        )
          setAudioState('SPEAKING')
      }
    } catch (error: any) {
      console.error('Error processing stream (after tool):', error)
      const errorMsg = `Error: Processing response failed (${error.message})`
      generalStore.statusMessage = errorMsg
      generalStore.updateMessageContentByTempId(
        messagePlaceholderTempId,
        errorMsg
      )
    } finally {
      if (
        audioState.value === 'WAITING_FOR_RESPONSE' &&
        generalStore.audioQueue.length === 0
      ) {
        setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      }
      const finalAssistantMessage = generalStore.chatHistory.find(
        m => m.local_id_temp === placeholderTempId && m.role === 'assistant'
      )
      if (finalAssistantMessage) {
        try {
          let assistantTextForIndexing = ''
          if (typeof finalAssistantMessage.content === 'string') {
            assistantTextForIndexing = finalAssistantMessage.content
          } else if (Array.isArray(finalAssistantMessage.content)) {
            const textPart = finalAssistantMessage.content.find(
              p => p.type === 'app_text'
            )
            if (textPart && textPart.text) {
              assistantTextForIndexing = textPart.text
            }
          }

          if (assistantTextForIndexing) {
            const conversationIdForThought =
              currentResponseId.value ||
              placeholderTempId ||
              'default_conversation'
            console.log(
              `[openAIStore processStream] Indexing assistant message: "${assistantTextForIndexing.substring(0, 50)}"`
            )
            await indexMessageForThoughts(
              conversationIdForThought,
              'assistant',
              { content: finalAssistantMessage.content }
            )
          } else {
            console.warn(
              '[openAIStore processStream] No text content found in assistant message to index.'
            )
          }
        } catch (e) {
          console.error(
            '[openAIStore processStream] Error calling indexMessageForThoughts for assistant message:',
            e
          )
        }
      } else {
        console.warn(
          `[openAIStore processStream] Could not find final assistant message with tempId ${placeholderTempId} to index.`
        )
      }
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

    const lastMessage = generalStore.chatHistory[0]

    if (
      lastMessage &&
      lastMessage.role === 'assistant' &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0
    ) {
      const pendingToolCallsToProcess = [...lastMessage.tool_calls]
      const originalMessageTempId = lastMessage.local_id_temp

      if (originalMessageTempId) {
        generalStore.updateMessageToolCallsByTempId(originalMessageTempId, [])
      } else {
        console.warn(
          '[Chat] Pending tool call: lastMessage had no local_id_temp. Cannot reliably clear its tool_calls.'
        )
        lastMessage.tool_calls = []
      }

      setAudioState('WAITING_FOR_RESPONSE')

      const responseIdForTheseToolCalls = lastMessage.api_response_id

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

      for (const pendingToolCall of pendingToolCallsToProcess) {
        await handleToolCall(pendingToolCall, responseIdForTheseToolCalls)
      }
      return
    }

    setAudioState('WAITING_FOR_RESPONSE')
    const constructedApiInput = buildApiInput()

    if (
      constructedApiInput.length === 0 &&
      !settingsStore.config.assistantSystemPrompt
    ) {
      console.warn(
        'Chat called with empty history and no system prompt. Aborting.'
      )
      setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      return
    }

    let finalInstructions = settingsStore.config.assistantSystemPrompt || ''
    let currentUserInputTextForThoughts = ''

    const latestMessageInHistory = generalStore.chatHistory[0]
    if (latestMessageInHistory && latestMessageInHistory.role === 'user') {
      if (typeof latestMessageInHistory.content === 'string') {
        currentUserInputTextForThoughts = latestMessageInHistory.content
      } else if (Array.isArray(latestMessageInHistory.content)) {
        const textPart = latestMessageInHistory.content.find(
          part => part.type === 'app_text'
        )
        if (textPart && textPart.text) {
          currentUserInputTextForThoughts = textPart.text
        }
      }
    } else {
      console.warn(
        '[openAIStore chat] Last message not from user, or no text found for thoughts query.'
      )
    }

    if (currentUserInputTextForThoughts) {
      try {
        console.log(
          '[openAIStore chat] Retrieving thoughts for input:',
          currentUserInputTextForThoughts
        )
        const relevantThoughtsArray = await retrieveRelevantThoughtsForPrompt(
          currentUserInputTextForThoughts
        )
        console.log(
          '[openAIStore chat] Retrieved thoughts:',
          relevantThoughtsArray
        )

        let thoughtsBlock =
          'Relevant thoughts from past conversation (use these to inform your answer if applicable):\n'
        if (relevantThoughtsArray && relevantThoughtsArray.length > 0) {
          thoughtsBlock += relevantThoughtsArray.map(t => `- ${t}`).join('\n')
        } else {
          thoughtsBlock += 'No relevant thoughts...'
        }
        finalInstructions =
          thoughtsBlock +
          '\n\n---\n\n' +
          (settingsStore.config.assistantSystemPrompt || '')
      } catch (error) {
        console.error(
          '[openAIStore chat] Error retrieving or formatting thoughts:',
          error
        )
        finalInstructions = settingsStore.config.assistantSystemPrompt || ''
      }
    } else {
      console.log(
        '[openAIStore chat] No specific user input for thoughts, adding default thoughts block.'
      )
      let thoughtsBlock =
        'Relevant thoughts from past conversation (use these to inform your answer if applicable):\n'
      thoughtsBlock += 'No relevant thoughts...'
      finalInstructions =
        thoughtsBlock +
        '\n\n---\n\n' +
        (settingsStore.config.assistantSystemPrompt || '')
    }

    const assistantMessagePlaceholder: ChatMessage = {
      role: 'assistant',
      content: [{ type: 'app_text', text: '' }],
    }
    const placeholderTempId = generalStore.addMessageToHistory(
      assistantMessagePlaceholder
    )

    try {
      const streamResult = await createOpenAIResponse(
        constructedApiInput,
        currentResponseId.value,
        true,
        finalInstructions
      )
      await processStream(
        streamResult as AsyncIterable<OpenAI.Responses.StreamEvent>,
        placeholderTempId
      )
    } catch (error: any) {
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
  }

  const transcribeAudioMessage = async (
    audioBuffer: Buffer
  ): Promise<string> => {
    try {
      return await transcribeAudio(audioBuffer)
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
      '[uploadScreenshotToOpenAI] Provided URI is not a data URI. URI starts with:',
      screenshotDataURI.substring(0, 100) + '...'
    )
    return null
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
    if (!useSettingsStore().config.VITE_OPENAI_API_KEY) {
      console.warn('Cannot fetch models: OpenAI API Key is missing.')
      availableModels.value = []
      return
    }
    const openai = getOpenAIClient()
    try {
      const modelsPage = await openai.models.list()
      availableModels.value = modelsPage.data
        .filter(
          model =>
            model.id.startsWith('gpt-')
            // model.id.startsWith('o1-') || //not yet ready for thinking models
            // model.id.startsWith('o3-') ||
            // model.id.startsWith('o4-')
        )
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
    uploadScreenshotToOpenAI,
    fetchModels,
    currentResponseId,
  }
})
