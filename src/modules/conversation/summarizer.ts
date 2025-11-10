export interface RawMessageForSummarization {
  role: string
  text_content: string
  created_at: string
}

export interface SummarizerDependencies {
  isSummarizing(): boolean
  setSummarizing(value: boolean): void
  fetchRecentMessages(limit: number): Promise<{
    success: boolean
    data?: RawMessageForSummarization[]
  }>
  analyzeContext(
    formattedMessages: Array<{ role: string; content: string }>,
    model: string
  ): Promise<string | null>
  createSummary(
    formattedMessages: Array<{ role: string; content: string }>,
    model: string,
    systemPrompt: string
  ): Promise<string | null>
  saveSummary(params: {
    summaryText: string
    summarizedMessagesCount: number
  }): Promise<void>
  setEphemeralEmotionalContext(value: string | null): void
  getSummarizationConfig(): {
    messageCount: number
    model: string
    systemPrompt: string
  }
  logError(...args: any[]): void
}

export interface Summarizer {
  triggerSummarization(): Promise<void>
}

export function createSummarizer(
  dependencies: SummarizerDependencies
): Summarizer {
  return {
    async triggerSummarization(): Promise<void> {
      if (dependencies.isSummarizing()) return

      dependencies.setSummarizing(true)

      try {
        const config = dependencies.getSummarizationConfig()
        const messagesResult = await dependencies.fetchRecentMessages(
          config.messageCount
        )

        if (!messagesResult.success || !messagesResult.data?.length) {
          return
        }

        const rawMessages = messagesResult.data
        const formattedMessages = rawMessages.map(m => ({
          role: m.role,
          content: m.text_content || '[content missing]',
        }))

        const [emotionalContext, factualSummary] = await Promise.all([
          dependencies.analyzeContext(formattedMessages, config.model),
          dependencies.createSummary(
            formattedMessages,
            config.model,
            config.systemPrompt
          ),
        ])

        if (emotionalContext) {
          dependencies.setEphemeralEmotionalContext(emotionalContext)
        }

        if (factualSummary) {
          await dependencies.saveSummary({
            summaryText: factualSummary,
            summarizedMessagesCount: rawMessages.length,
          })
        }
      } catch (error) {
        dependencies.logError('[Summarizer] Error during summarization:', error)
      } finally {
        dependencies.setSummarizing(false)
      }
    },
  }
}
