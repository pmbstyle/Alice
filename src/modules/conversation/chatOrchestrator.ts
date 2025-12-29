import type OpenAI from 'openai'
import type { ChatMessage } from '../../types/chat'
import type { RagSearchResult } from '../../types/rag'

export interface ChatDependencies {
  isInitialized(): boolean
  setAudioState(state: string): void
  getIsRecordingRequested(): boolean
  getCurrentResponseId(): string | null
  setCurrentResponseId(id: string | null): void
  getAiProvider(): string
  getAssistantSystemPrompt(): string
  getEphemeralEmotionalContext(): string | null
  clearEphemeralEmotionalContext(): void
  retrieveThoughtsForPrompt(prompt: string): Promise<string[]>
  retrieveDocumentsForPrompt(
    prompt: string,
    topK: number
  ): Promise<RagSearchResult[]>
  getRagConfig(): { enabled: boolean; topK: number; maxContextChars: number }
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

  const formatRagSource = (result: RagSearchResult): string => {
    const fileName = result.path.split(/[\\/]/).pop() || result.title
    const pageSuffix =
      result.page && result.page > 0 ? `#p${result.page}` : ''
    return `${fileName}${pageSuffix}`
  }

  const formatRagSnippet = (text: string): string => {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized.length <= 320) return normalized
    return `${normalized.slice(0, 317)}...`
  }

  const buildRagBlock = (
    results: RagSearchResult[],
    maxChars: number
  ): string => {
    const prefix = 'Relevant excerpts from user\'s documents (cite when used):'
    let remaining = maxChars - (prefix.length + 1)
    if (remaining <= 0) return ''

    const lines: string[] = []
    for (const result of results) {
      const snippet = formatRagSnippet(result.text)
      const source = formatRagSource(result)
      const section = result.section?.trim()
      const sectionPrefix = section ? `(Section: ${section}) ` : ''
      const entry = `- [${source}] ${sectionPrefix}${snippet}`
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

  const buildRagRulesBlock = (): string => {
    return [
      'RAG_RULES:',
      '- Use the document excerpts below when they are relevant.',
      '- Cite sources inline like [filename#pX].',
      '- If the answer is not in the excerpts, say you could not find it.',
    ].join('\n')
  }

  const adjustRagConfig = (
    prompt: string,
    config: { topK: number; maxContextChars: number }
  ) => {
    const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length
    let topK = config.topK
    let maxContextChars = config.maxContextChars

    if (wordCount <= 6) {
      topK = Math.min(config.topK + 3, 12)
      maxContextChars = Math.min(config.maxContextChars + 800, 5000)
    } else if (wordCount <= 14) {
      topK = Math.min(config.topK + 2, 10)
      maxContextChars = Math.min(config.maxContextChars + 500, 4500)
    } else if (wordCount >= 60) {
      topK = Math.max(config.topK - 3, 2)
      maxContextChars = Math.max(config.maxContextChars - 600, 1200)
    } else if (wordCount >= 30) {
      topK = Math.max(config.topK - 2, 3)
      maxContextChars = Math.max(config.maxContextChars - 400, 1500)
    }

    return { topK, maxContextChars }
  }

  const rerankRagResults = (
    results: RagSearchResult[],
    prompt: string
  ): RagSearchResult[] => {
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

        const ragConfig = dependencies.getRagConfig()
        if (ragConfig.enabled) {
          const adjustedConfig = adjustRagConfig(
            textForThoughtRetrieval,
            ragConfig
          )
          const ragResultsRaw = await dependencies.retrieveDocumentsForPrompt(
            textForThoughtRetrieval,
            adjustedConfig.topK
          )
          const ragResults = rerankRagResults(
            ragResultsRaw,
            textForThoughtRetrieval
          )
          if (ragResults.length > 0) {
            contextMessages.push({
              role: 'user',
              content: [{ type: 'input_text', text: buildRagRulesBlock() }],
            })
            const ragBlock = buildRagBlock(
              ragResults,
              adjustedConfig.maxContextChars
            )
            if (ragBlock) {
              contextMessages.push({
                role: 'user',
                content: [{ type: 'input_text', text: ragBlock }],
              })
            }
          }
        }
      }
    }

    return contextMessages
  }

  const buildContinuationInput = async (): Promise<
    OpenAI.Responses.Request.InputItemLike[]
  > => {
    const latestUserMessage = getLatestUserMessage()

    if (!latestUserMessage || !Array.isArray(latestUserMessage.content)) {
      return []
    }

    const contextMessages = await buildContextMessages()

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

    if (!convertedContent.length) return contextMessages

    return [
      ...contextMessages,
      {
        role: 'user',
        content: convertedContent,
      },
    ]
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

    const aiProvider = dependencies.getAiProvider()
    const shouldUseFullHistoryOnContinuation = aiProvider !== 'openai'

    if (isNewChain || shouldUseFullHistoryOnContinuation) {
      const contextMessages = await buildContextMessages()
      const constructedApiInput = await dependencies.buildApiInput(true)
      finalApiInput = [...contextMessages, ...constructedApiInput]
    } else {
      finalApiInput = await buildContinuationInput()
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
