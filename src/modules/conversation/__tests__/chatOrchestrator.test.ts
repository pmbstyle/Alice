import { describe, expect, it, vi } from 'vitest'
import { createChatOrchestrator } from '../chatOrchestrator'

function setup({
  isNewChain = true,
  streamSuccess = true,
  throwError,
}: {
  isNewChain?: boolean
  streamSuccess?: boolean
  throwError?: Error
} = {}) {
  const abortController = new AbortController()
  const dependencies = {
    isInitialized: vi.fn(() => true),
    setAudioState: vi.fn(),
    getIsRecordingRequested: vi.fn(() => false),
    getCurrentResponseId: vi.fn(() =>
      isNewChain ? null : 'resp_existing'
    ),
    setCurrentResponseId: vi.fn(),
    getAssistantSystemPrompt: vi.fn(() => 'system'),
    getEphemeralEmotionalContext: vi.fn(() => null),
    clearEphemeralEmotionalContext: vi.fn(),
    retrieveThoughtsForPrompt: vi.fn(async () => []),
    fetchLatestSummary: vi.fn(async () => ({ success: false })),
    getChatHistory: vi.fn(() => [
      { role: 'user', content: [{ type: 'app_text', text: 'Hello' }] },
    ]),
    buildApiInput: vi.fn(async () => [
      { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
    ]),
    addAssistantPlaceholder: vi.fn(() => 'tmp_assistant'),
    processStream: vi.fn(async () => {
      if (!streamSuccess) throw new Error('stream failed')
    }),
    createOpenAIResponse: vi.fn(async () => {
      if (throwError) throw throwError
      return ((async function* () {})() as AsyncIterable<any>)
    }),
    createAbortController: vi.fn(() => abortController),
    setLlmAbortController: vi.fn(),
    handleCleanHistoryRetry: vi.fn(),
    handleStreamError: vi.fn(),
    logInfo: vi.fn(),
    logError: vi.fn(),
  }

  const orchestrator = createChatOrchestrator(
    dependencies as any
  )

  return { dependencies, orchestrator, abortController }
}

describe('chatOrchestrator', () => {
  it('builds context when starting a new chain', async () => {
    const { dependencies, orchestrator } = setup({ isNewChain: true })
    await orchestrator.runChat()
    expect(dependencies.buildApiInput).toHaveBeenCalledWith(true)
    expect(dependencies.processStream).toHaveBeenCalled()
  })

  it('retries with clean history when previous response missing', async () => {
    const error = new Error('Previous response with id xyz not found')
    const { dependencies, orchestrator } = setup({
      isNewChain: false,
      throwError: error,
    })

    await orchestrator.runChat()

    expect(dependencies.setCurrentResponseId).toHaveBeenCalledWith(null)
    expect(dependencies.handleCleanHistoryRetry).toHaveBeenCalled()
  })

  it('handles tool mismatch errors by restarting chain', async () => {
    const error = new Error(
      'No tool output found for function call something'
    )
    const { dependencies, orchestrator } = setup({
      isNewChain: false,
      throwError: error,
    })

    await orchestrator.runChat()

    expect(dependencies.handleCleanHistoryRetry).toHaveBeenCalled()
  })

  it('sends errors to placeholder when non-recoverable', async () => {
    const error = new Error('Network failure')
    const { dependencies, orchestrator } = setup({
      isNewChain: false,
      throwError: error,
    })

    await orchestrator.runChat()

    expect(dependencies.handleStreamError).toHaveBeenCalledWith(
      'tmp_assistant',
      error
    )
    expect(dependencies.setAudioState).toHaveBeenCalledWith('IDLE')
  })

  it('skips work when store is not initialized', async () => {
    const ctx = setup()
    ctx.dependencies.isInitialized.mockReturnValue(false)
    await ctx.orchestrator.runChat()
    expect(ctx.dependencies.processStream).not.toHaveBeenCalled()
  })
})
