import { describe, expect, it, vi } from 'vitest'
import { createSummarizer } from '../summarizer'
import type {
  RawMessageForSummarization,
  SummarizerDependencies,
} from '../summarizer'

function buildDependencies(
  overrides: Partial<SummarizerDependencies> & {
    messages?: RawMessageForSummarization[]
  } = {}
): SummarizerDependencies {
  let summarizing = false
  const messages = overrides.messages ?? []

  const deps: SummarizerDependencies = {
    isSummarizing: vi.fn(() => summarizing),
    setSummarizing: vi.fn(value => {
      summarizing = value
    }),
    fetchRecentMessages: vi.fn(async () => ({
      success: true,
      data: messages,
    })),
    analyzeContext: vi.fn(async () => 'calm'),
    createSummary: vi.fn(async () => 'summary'),
    saveSummary: vi.fn(async () => {}),
    setEphemeralEmotionalContext: vi.fn(),
    getSummarizationConfig: vi.fn(() => ({
      messageCount: 5,
      model: 'model',
      systemPrompt: 'prompt',
    })),
    logError: vi.fn(),
    ...overrides,
  }

  return deps
}

describe('createSummarizer', () => {
  it('does nothing when a summarisation is already in progress', async () => {
    const deps = buildDependencies({
      isSummarizing: vi.fn(() => true),
    })

    const summarizer = createSummarizer(deps)
    await summarizer.triggerSummarization()

    expect(deps.setSummarizing).not.toHaveBeenCalled()
    expect(deps.fetchRecentMessages).not.toHaveBeenCalled()
  })

  it('processes recent messages and saves summary', async () => {
    const messages: RawMessageForSummarization[] = [
      { role: 'user', text_content: 'Hello', created_at: '1' },
      { role: 'assistant', text_content: 'Hi', created_at: '2' },
    ]
    const deps = buildDependencies({ messages })

    const summarizer = createSummarizer(deps)
    await summarizer.triggerSummarization()

    expect(deps.setSummarizing).toHaveBeenNthCalledWith(1, true)
    expect(deps.fetchRecentMessages).toHaveBeenCalledWith(5)
    expect(deps.analyzeContext).toHaveBeenCalled()
    expect(deps.createSummary).toHaveBeenCalled()
    expect(deps.setEphemeralEmotionalContext).toHaveBeenCalledWith('calm')
    expect(deps.saveSummary).toHaveBeenCalledWith({
      summaryText: 'summary',
      summarizedMessagesCount: messages.length,
    })
    expect(deps.setSummarizing).toHaveBeenLastCalledWith(false)
  })

  it('skips downstream work when no messages are returned', async () => {
    const deps = buildDependencies({
      fetchRecentMessages: vi.fn(async () => ({
        success: true,
        data: [],
      })),
    })

    const summarizer = createSummarizer(deps)
    await summarizer.triggerSummarization()

    expect(deps.analyzeContext).not.toHaveBeenCalled()
    expect(deps.createSummary).not.toHaveBeenCalled()
    expect(deps.setEphemeralEmotionalContext).not.toHaveBeenCalled()
    expect(deps.saveSummary).not.toHaveBeenCalled()
    expect(deps.setSummarizing).toHaveBeenLastCalledWith(false)
  })

  it('logs and recovers from errors', async () => {
    const deps = buildDependencies({
      fetchRecentMessages: vi.fn(async () => {
        throw new Error('boom')
      }),
    })

    const summarizer = createSummarizer(deps)
    await summarizer.triggerSummarization()

    expect(deps.logError).toHaveBeenCalledWith(
      '[Summarizer] Error during summarization:',
      expect.any(Error)
    )
    expect(deps.setSummarizing).toHaveBeenLastCalledWith(false)
  })
})

