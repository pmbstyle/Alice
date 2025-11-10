import { describe, expect, it, vi } from 'vitest'
import { createSpeechQueueManager } from '../speechQueue'
import type { SpeechQueueDependencies } from '../speechQueue'

function buildDependencies(
  overrides: Partial<SpeechQueueDependencies> & {
    audioState?: string
  } = {}
): SpeechQueueDependencies {
  let audioState = (overrides.audioState as any) ?? 'IDLE'
  const controller = new AbortController()

  const deps: SpeechQueueDependencies = {
    createAbortController: vi.fn(() => controller),
    setTtsAbortController: vi.fn(),
    ttsStream: vi.fn(async () => new Response('audio')),
    queueAudioForPlayback: vi.fn(() => true),
    getAudioState: vi.fn(() => audioState as any),
    setAudioState: vi.fn(state => {
      audioState = state
    }),
    logError: vi.fn(),
    ...overrides,
  }

  return deps
}

describe('createSpeechQueueManager', () => {
  it('ignores empty or whitespace only text', async () => {
    const deps = buildDependencies()
    const manager = createSpeechQueueManager(deps)

    await manager.enqueueSpeech('   ')

    expect(deps.createAbortController).not.toHaveBeenCalled()
    expect(deps.ttsStream).not.toHaveBeenCalled()
  })

  it('enqueues audio and switches to speaking state', async () => {
    const deps = buildDependencies({ audioState: 'WAITING_FOR_RESPONSE' })
    const manager = createSpeechQueueManager(deps)

    await manager.enqueueSpeech('Hello')

    expect(deps.createAbortController).toHaveBeenCalled()
    expect(deps.ttsStream).toHaveBeenCalledWith(
      'Hello',
      expect.any(AbortSignal)
    )
    expect(deps.queueAudioForPlayback).toHaveBeenCalled()
    expect(deps.setAudioState).toHaveBeenCalledWith('SPEAKING')
  })

  it('does not change audio state when enqueue returns false', async () => {
    const deps = buildDependencies({
      queueAudioForPlayback: vi.fn(() => false),
    })
    const manager = createSpeechQueueManager(deps)

    await manager.enqueueSpeech('Hello')

    expect(deps.setAudioState).not.toHaveBeenCalled()
  })

  it('silently handles AbortError from TTS stream', async () => {
    const abortError = Object.assign(new Error('cancel'), { name: 'AbortError' })
    const deps = buildDependencies({
      ttsStream: vi.fn(async () => {
        throw abortError
      }),
    })
    const manager = createSpeechQueueManager(deps)

    await manager.enqueueSpeech('Hello')

    expect(deps.logError).not.toHaveBeenCalled()
  })

  it('logs other TTS errors', async () => {
    const deps = buildDependencies({
      ttsStream: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    const manager = createSpeechQueueManager(deps)

    await manager.enqueueSpeech('Hello')

    expect(deps.logError).toHaveBeenCalledWith(
      'TTS stream creation failed:',
      expect.any(Error)
    )
  })
})

