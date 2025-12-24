import type OpenAI from 'openai'
import type { ChatMessage } from '../../types/chat'

export interface ChatDependencies {
  isInitialized(): boolean
  setAudioState(state: string): void
  getIsRecordingRequested(): boolean
  getCurrentResponseId(): string | null
  setCurrentResponseId(id: string | null): void
  getAssistantSystemPrompt(): string
  getEphemeralEmotionalContext(): string | null
  clearEphemeralEmotionalContext(): void
  retrieveThoughtsForPrompt(prompt: string): Promise<string[]>
  fetchLatestSummary(): Promise<{
    success: boolean
    data?: { summary_text?: string }
  }>
  getChatHistory(): ChatMessage[]
  buildApiInput(isNewChain: boolean): Promise<
    OpenAI.Responses.Request.InputItemLike[]
  >
  addAssistantPlaceholder(): string
  processStream(
    stream: AsyncIterable<OpenAI.Responses.StreamEvent>,
    placeholderTempId: string,
    isContinuationAfterTool: boolean
  ): Promise<void>
  createOpenAIResponse(
    input: OpenAI.Responses.Request.InputItemLike[],
    responseId: string | null,
    signal: AbortSignal
  ): Promise<AsyncIterable<OpenAI.Responses.StreamEvent>>
  createAbortController(): AbortController
  setLlmAbortController(controller: AbortController | null): void
  handleCleanHistoryRetry(): Promise<void>
  handleStreamError(placeholderTempId: string, error: unknown): void
  logInfo(...args: any[]): void
  logError(...args: any[]): void
}

export interface ChatOrchestrator {
  runChat(): Promise<void>
}

export function createChatOrchestrator(
  dependencies: ChatDependencies
): ChatOrchestrator {
  const THOUGHTS_BLOCK_MAX_CHARS = 1200

  const getLatestUserMessage = (): ChatMessage | undefined => {
    const history = dependencies.getChatHistory()
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].role === 'user') {
        return history[i]
      }
    }
    return undefined
  }

  const formatThoughtLine = (thought: any): string => {
    if (typeof thought === 'string') {
      return thought
    }
    const text = thought?.textContent?.trim()
    if (!text) return ''
    const role = thought?.role || 'unknown'
    return `[${role}] ${text}`
  }

  const buildThoughtsBlock = (lines: string[]): string => {
    const prefix = 'Relevant thoughts from our past conversation (for context):'
    let remaining = THOUGHTS_BLOCK_MAX_CHARS - (prefix.length + 1)
    if (remaining <= 0) return ''

    const keptLines: string[] = []
    for (const line of lines) {
      const entry = `- ${line}`
      const extra = entry.length + 1
      if (extra > remaining) {
        break
      }
      keptLines.push(entry)
      remaining -= extra
    }

    if (keptLines.length === 0) return ''
    return `${prefix}\n${keptLines.join('\n')}`
  }

  const buildContextMessages = async (): Promise<
    OpenAI.Responses.Request.InputItemLike[]
  > => {
    const contextMessages: OpenAI.Responses.Request.InputItemLike[] = []

    const summaryResult = await dependencies.fetchLatestSummary()
    if (summaryResult.success && summaryResult.data?.summary_text) {
      const summaryContent = `[CONVERSATION_SUMMARY_START]\nContext from a previous part of our conversation:\n${summaryResult.data.summary_text}\n[CONVERSATION_SUMMARY_END]`
      contextMessages.push({
        role: 'user',
        content: [{ type: 'input_text', text: summaryContent }],
      })
    }

    const emotionalContext = dependencies.getEphemeralEmotionalContext()
    if (emotionalContext) {
      contextMessages.push({
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `[SYSTEM_NOTE: Based on our recent interaction, the user's emotional state seems to be: ${emotionalContext}]`,
          },
        ],
      })
      dependencies.clearEphemeralEmotionalContext()
    }

    const latestUserMessageContent = getLatestUserMessage()?.content

    if (latestUserMessageContent && Array.isArray(latestUserMessageContent)) {
      const textForThoughtRetrieval = latestUserMessageContent
        .filter(p => p.type === 'app_text' && p.text)
        .map(p => p.text)
        .join(' ')

      if (textForThoughtRetrieval) {
        const thoughts = await dependencies.retrieveThoughtsForPrompt(
          textForThoughtRetrieval
        )
        if (thoughts.length > 0) {
          const thoughtLines = thoughts
            .map(formatThoughtLine)
            .filter(Boolean)
          const thoughtsBlock = buildThoughtsBlock(thoughtLines)
          if (thoughtsBlock) {
            contextMessages.push({
              role: 'user',
              content: [{ type: 'input_text', text: thoughtsBlock }],
            })
          }
        }
      }
    }

    return contextMessages
  }

  const buildContinuationInput = (): OpenAI.Responses.Request.InputItemLike[] => {
    const latestUserMessage = getLatestUserMessage()

    if (!latestUserMessage || !Array.isArray(latestUserMessage.content)) {
      return []
    }

    const convertedContent =
      latestUserMessage.content.reduce<OpenAI.Responses.Request.ContentPartLike[]>(
        (acc, item) => {
          if (item.type === 'app_text' && item.text) {
            acc.push({ type: 'input_text', text: item.text })
          } else if (item.type === 'app_image_uri' && item.uri) {
            acc.push({ type: 'input_image', image_url: item.uri })
          }
          return acc
        },
        []
      )

    return convertedContent.length
      ? [
          {
            role: 'user',
            content: convertedContent,
          },
        ]
      : []
  }

  const runChat = async () => {
    if (!dependencies.isInitialized()) {
      dependencies.logInfo('Conversation store not initialized.')
      return
    }

    dependencies.setAudioState('WAITING_FOR_RESPONSE')

    const isNewChain = dependencies.getCurrentResponseId() === null
    dependencies.logInfo(
      `[Chat] ${
        isNewChain ? 'Starting new conversation chain' : 'Continuing existing chain'
      }, responseId:`,
      dependencies.getCurrentResponseId()
    )

    let finalApiInput: OpenAI.Responses.Request.InputItemLike[] = []

    if (isNewChain) {
      const contextMessages = await buildContextMessages()
      const constructedApiInput = await dependencies.buildApiInput(true)
      finalApiInput = [...contextMessages, ...constructedApiInput]
    } else {
      finalApiInput = buildContinuationInput()
    }

    const placeholderTempId = dependencies.addAssistantPlaceholder()
    const abortController = dependencies.createAbortController()
    dependencies.setLlmAbortController(abortController)

    try {
      const streamResult = await dependencies.createOpenAIResponse(
        finalApiInput,
        dependencies.getCurrentResponseId(),
        abortController.signal
      )
      await dependencies.processStream(streamResult, placeholderTempId, false)
    } catch (error: any) {
      if (error?.name === 'AbortError') return

      dependencies.logError('Error starting OpenAI response stream:', error)

      const message = (error?.message as string) || ''
      if (
        message.includes('Previous response with id') &&
        message.includes('not found')
      ) {
        dependencies.logInfo(
          '[Error Recovery] Previous response ID not found, starting fresh conversation chain'
        )
        dependencies.setCurrentResponseId(null)
        await dependencies.handleCleanHistoryRetry()
        return
      }

      if (
        message.includes('No tool output found for function call') ||
        message.includes('No tool call found for function call output')
      ) {
        dependencies.logInfo(
          '[Error Recovery] Tool call mismatch detected, starting fresh conversation chain'
        )
        dependencies.setCurrentResponseId(null)
        await dependencies.handleCleanHistoryRetry()
        return
      }

      dependencies.handleStreamError(placeholderTempId, error)
      dependencies.setAudioState(
        dependencies.getIsRecordingRequested() ? 'LISTENING' : 'IDLE'
      )
      dependencies.setLlmAbortController(null)
    }
  }

  return {
    runChat,
  }
}
