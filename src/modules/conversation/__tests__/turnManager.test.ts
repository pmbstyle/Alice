import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createTurnManager } from '../turnManager'
import type { TurnManagerDependencies } from '../turnManager'
import type { AudioState } from '../../../stores/generalStore'

function buildDependencies() {
  let ttsAbortController: { abort: () => void } | null = null
  let llmAbortController: { abort: () => void } | null = null
  let audioPlayer: { paused: boolean } | null = null
  let audioQueueLength = 0
  let audioState: AudioState = 'IDLE'
  let recordingRequested = false
  let currentResponseId: string | null = null

  const logs = {
    info: vi.fn(),
    error: vi.fn(),
  }

  const cancelHandlers: {
    tts?: () => void
    llm?: () => void
  } = {}

  const triggerSummarization = vi.fn()

  const deps: TurnManagerDependencies = {
    getTtsAbortController: () => ttsAbortController as AbortController | null,
    setTtsAbortController: controller => {
      ttsAbortController = controller as { abort: () => void } | null
    },
    getLlmAbortController: () => llmAbortController as AbortController | null,
    setLlmAbortController: controller => {
      llmAbortController = controller as { abort: () => void } | null
    },
    getCurrentResponseId: () => currentResponseId,
    getAudioPlayer: () => audioPlayer as HTMLAudioElement | null,
    getAudioQueueLength: () => audioQueueLength,
    getAudioState: () => audioState,
    setAudioState: state => {
      audioState = state
    },
    isRecordingRequested: () => recordingRequested,
    triggerSummarization,
    onCancelTts: handler => {
      cancelHandlers.tts = handler
    },
    offCancelTts: handler => {
      if (cancelHandlers.tts === handler) {
        cancelHandlers.tts = undefined
      }
    },
    onCancelLlm: handler => {
      cancelHandlers.llm = handler
    },
    offCancelLlm: handler => {
      if (cancelHandlers.llm === handler) {
        cancelHandlers.llm = undefined
      }
    },
    logInfo: logs.info,
    logError: logs.error,
  }

  return {
    deps,
    logs,
    cancelHandlers,
    state: {
      setTtsController(controller: { abort: () => void }) {
        ttsAbortController = controller
      },
      setLlmController(controller: { abort: () => void }) {
        llmAbortController = controller
      },
      setAudioPlayer(player: { paused: boolean } | null) {
        audioPlayer = player
      },
      setAudioQueueLength(length: number) {
        audioQueueLength = length
      },
      setAudioState(state: AudioState) {
        audioState = state
      },
      setRecordingRequested(value: boolean) {
        recordingRequested = value
      },
      setCurrentResponseId(value: string | null) {
        currentResponseId = value
      },
    },
    triggerSummarization,
  }
}

describe('createTurnManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('cancels TTS controller when cancel event is emitted', () => {
    const ctx = buildDependencies()
    const manager = createTurnManager(ctx.deps)
    const abort = vi.fn()
    ctx.state.setTtsController({ abort })

    ctx.cancelHandlers.tts?.()

    expect(abort).toHaveBeenCalled()
    expect(ctx.deps.getTtsAbortController()).toBeNull()
    expect(ctx.logs.info).toHaveBeenCalledWith(
      '[TTS Abort] Cancelling in-flight TTS request.'
    )

    manager.dispose()
  })

  it('cancels LLM controller and logs current response id', () => {
    const ctx = buildDependencies()
    const manager = createTurnManager(ctx.deps)
    const abort = vi.fn()
    ctx.state.setLlmController({ abort })
    ctx.state.setCurrentResponseId('resp_123')

    ctx.cancelHandlers.llm?.()

    expect(abort).toHaveBeenCalled()
    expect(ctx.logs.info).toHaveBeenCalledWith(
      '[LLM Abort] Stream cancelled. Keeping currentResponseId for conversation continuity:',
      'resp_123'
    )

    manager.dispose()
  })

  it('finalizes stream only after audio playback finishes', () => {
    const ctx = buildDependencies()
    ctx.state.setAudioPlayer({ paused: false })
    ctx.state.setAudioQueueLength(1)
    ctx.state.setAudioState('SPEAKING')
    const manager = createTurnManager(ctx.deps)

    manager.finalizeAfterStream({
      streamEndedNormally: true,
      isContinuationAfterTool: false,
    })

    vi.advanceTimersByTime(250)
    expect(ctx.deps.getAudioState()).toBe('SPEAKING')
    expect(ctx.triggerSummarization).not.toHaveBeenCalled()

    ctx.state.setAudioPlayer({ paused: true })
    ctx.state.setAudioQueueLength(0)
    vi.advanceTimersByTime(250)

    expect(ctx.deps.getAudioState()).toBe('IDLE')
    expect(ctx.triggerSummarization).toHaveBeenCalled()

    manager.dispose()
  })

  it('respects recording status when resetting audio state', () => {
    const ctx = buildDependencies()
    ctx.state.setAudioPlayer({ paused: true })
    ctx.state.setAudioQueueLength(0)
    ctx.state.setAudioState('WAITING_FOR_RESPONSE')
    ctx.state.setRecordingRequested(true)
    const manager = createTurnManager(ctx.deps)

    manager.finalizeAfterStream({
      streamEndedNormally: true,
      isContinuationAfterTool: false,
    })

    vi.advanceTimersByTime(250)

    expect(ctx.deps.getAudioState()).toBe('LISTENING')
    manager.dispose()
  })

  it('skips summarization when continuation after tool call', () => {
    const ctx = buildDependencies()
    ctx.state.setAudioPlayer({ paused: true })
    ctx.state.setAudioQueueLength(0)
    const manager = createTurnManager(ctx.deps)

    manager.finalizeAfterStream({
      streamEndedNormally: true,
      isContinuationAfterTool: true,
    })

    vi.advanceTimersByTime(250)

    expect(ctx.triggerSummarization).not.toHaveBeenCalled()
    manager.dispose()
  })
})

