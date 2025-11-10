import { describe, expect, it, vi } from 'vitest'
import { createStreamHandler } from '../streamHandler'
import type { StreamHandlerDependencies } from '../types'

function createAsyncStream<T>(events: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event
      }
    },
  }
}

function createDependencies(): {
  deps: StreamHandlerDependencies
  spies: Record<string, ReturnType<typeof vi.fn>>
  getAudioStateValue: () => string
} {
  let audioState = 'IDLE'

  const spies = {
    appendAssistantDelta: vi.fn(),
    setAssistantResponseId: vi.fn(),
    setAssistantMessageId: vi.fn(),
    addToolCall: vi.fn(),
    handleToolCall: vi.fn().mockResolvedValue(undefined),
    handleImagePartial: vi.fn().mockResolvedValue(undefined),
    handleImageFinal: vi.fn().mockResolvedValue(undefined),
    enqueueSpeech: vi.fn().mockResolvedValue(undefined),
    setAudioState: vi.fn((state: string) => {
      audioState = state
    }),
    getAudioState: vi.fn(() => audioState),
    handleStreamError: vi.fn(),
  }

  const deps: StreamHandlerDependencies = {
    appendAssistantDelta: spies.appendAssistantDelta,
    setAssistantResponseId: spies.setAssistantResponseId,
    setAssistantMessageId: spies.setAssistantMessageId,
    addToolCall: spies.addToolCall,
    handleToolCall: spies.handleToolCall,
    handleImagePartial: spies.handleImagePartial,
    handleImageFinal: spies.handleImageFinal,
    enqueueSpeech: spies.enqueueSpeech,
    setAudioState: spies.setAudioState,
    getAudioState: spies.getAudioState,
    handleStreamError: spies.handleStreamError,
  }

  return {
    deps,
    spies,
    getAudioStateValue: () => audioState,
  }
}

describe('createStreamHandler', () => {
  it('processes assistant text and flushes completed sentences', async () => {
    const { deps, spies } = createDependencies()
    const handler = createStreamHandler(deps)

    const events = createAsyncStream([
      { type: 'response.created', response: { id: 'resp_1' } },
      {
        type: 'response.output_item.added',
        item: { type: 'message', role: 'assistant', id: 'msg_1' },
      },
      {
        type: 'response.output_text.delta',
        item_id: 'msg_1',
        delta: 'Hello world.',
      },
    ])

    const result = await handler.process({ stream: events })

    expect(result.streamEndedNormally).toBe(true)
    expect(spies.setAssistantResponseId).toHaveBeenCalledWith('resp_1')
    expect(spies.setAssistantMessageId).toHaveBeenCalledWith('msg_1')
    expect(spies.appendAssistantDelta).toHaveBeenCalledWith('Hello world.')
    expect(spies.enqueueSpeech).toHaveBeenCalledWith('Hello world.')
  })

  it('handles tool calls and parses the accumulated arguments', async () => {
    const { deps, spies } = createDependencies()
    const handler = createStreamHandler(deps)

    const events = createAsyncStream([
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'tool_1',
        delta: '{"foo":',
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: 'tool_1',
        delta: '"bar"}',
      },
      {
        type: 'response.output_item.done',
        item: {
          type: 'function_call',
          id: 'tool_1',
          name: 'testTool',
          call_id: 'tool_1',
        },
      },
    ])

    const result = await handler.process({ stream: events })

    expect(result.streamEndedNormally).toBe(true)
    expect(spies.addToolCall).toHaveBeenCalledTimes(1)
    expect(spies.handleToolCall).toHaveBeenCalledTimes(1)

    const toolCallPayload = spies.handleToolCall.mock.calls[0][0]
    expect(toolCallPayload.arguments).toEqual({ foo: 'bar' })
  })

  it('processes image generation updates and resets audio state', async () => {
    const { deps, spies, getAudioStateValue } = createDependencies()
    const handler = createStreamHandler(deps)

    const events = createAsyncStream([
      { type: 'response.image_generation_call.in_progress' },
      {
        type: 'response.image_generation_call.partial_image',
        item_id: 'img_1',
        partial_image_b64: 'base64partial',
        partial_image_index: 0,
      },
      {
        type: 'response.output_item.done',
        item: {
          type: 'image_generation_call',
          id: 'img_1',
          result: 'base64final',
        },
      },
    ])

    const result = await handler.process({ stream: events })

    expect(result.streamEndedNormally).toBe(true)
    expect(spies.setAudioState).toHaveBeenCalledWith('GENERATING_IMAGE')
    expect(spies.handleImagePartial).toHaveBeenCalledWith(
      'img_1',
      'base64partial',
      1
    )
    expect(spies.handleImageFinal).toHaveBeenCalledWith(
      'img_1',
      'base64final'
    )
    expect(getAudioStateValue()).toBe('WAITING_FOR_RESPONSE')
  })

  it('reports stream errors and marks stream as incomplete', async () => {
    const { deps, spies } = createDependencies()
    const handler = createStreamHandler(deps)
    const error = new Error('boom')

    const events = createAsyncStream([{ type: 'error', error }])

    const result = await handler.process({ stream: events })

    expect(result.streamEndedNormally).toBe(false)
    expect(spies.handleStreamError).toHaveBeenCalledWith(error)
  })

  it('returns early without error when the stream is aborted', async () => {
    const { deps, spies } = createDependencies()
    const handler = createStreamHandler(deps)

    const abortingStream: AsyncIterable<any> = {
      async *[Symbol.asyncIterator]() {
        const abortError = new Error('aborted')
        abortError.name = 'AbortError'
        throw abortError
      },
    }

    const result = await handler.process({ stream: abortingStream })

    expect(result.streamEndedNormally).toBe(false)
    expect(spies.handleStreamError).not.toHaveBeenCalled()
  })
})

