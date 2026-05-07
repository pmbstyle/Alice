import { describe, expect, it } from 'vitest'
import {
  convertLocalLLMStreamToResponsesFormat,
  convertOpenRouterStreamToResponsesFormat,
} from '../streamAdapters'

function createAbortError(): Error {
  const error = new Error('The operation was aborted.')
  error.name = 'AbortError'
  return error
}

async function consumeStream(stream: AsyncIterable<any>): Promise<any[]> {
  const events: any[] = []
  for await (const event of stream) {
    events.push(event)
  }
  return events
}

describe('stream adapters', () => {
  it('preserves local provider aborts instead of converting them to server errors', async () => {
    const abortingStream: AsyncIterable<any> = {
      async *[Symbol.asyncIterator]() {
        throw createAbortError()
      },
    }

    await expect(
      consumeStream(
        convertLocalLLMStreamToResponsesFormat(abortingStream, 'minimax')
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('preserves OpenRouter aborts instead of converting them to server errors', async () => {
    const abortingStream: AsyncIterable<any> = {
      async *[Symbol.asyncIterator]() {
        throw createAbortError()
      },
    }

    await expect(
      consumeStream(convertOpenRouterStreamToResponsesFormat(abortingStream))
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
