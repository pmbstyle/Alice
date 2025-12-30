import { describe, expect, it } from 'vitest'
import type OpenAI from 'openai'
import { createApiInputBuilder } from '../apiInputBuilder'
import type {
  ApiInputBuilderDependencies,
  ConversationHistoryMessage,
} from '../apiInputBuilder'

function buildDependencies(
  overrides: Partial<ApiInputBuilderDependencies> & {
    history?: ConversationHistoryMessage[]
  } = {}
): ApiInputBuilderDependencies {
  const history = overrides.history ?? []
  return {
    getChatHistory: () => history,
    getMaxHistoryMessagesForApi: () => 50,
    getAiProvider: () => 'openai',
    ...overrides,
  }
}

describe('createApiInputBuilder', () => {
  it('converts chat history into OpenAI input items', async () => {
    const history: ConversationHistoryMessage[] = [
      {
        role: 'assistant',
        content: [{ type: 'app_text', text: 'Hello!' }],
        tool_calls: [{ type: 'function', id: 'call_1' }],
      },
      {
        role: 'user',
        local_id_temp: 'user-1',
        content: [{ type: 'app_text', text: 'Show me a cat' }],
      },
    ]

    const builder = createApiInputBuilder(
      buildDependencies({ history, getAiProvider: () => 'openrouter' })
    )
    const result = await builder.build({ isNewChain: true })

    expect(result).toHaveLength(2)

    const assistantItem = result.find(item => item.role === 'assistant')
    const userItem = result.find(item => item.role === 'user')

    expect(userItem).toMatchObject({
      role: 'user',
      content: [{ type: 'input_text', text: 'Show me a cat' }],
    })

    expect(assistantItem).toMatchObject({
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Hello!' }],
      tool_calls: history[0].tool_calls,
    })
  })

  it('limits number of history items based on configuration', async () => {
    const history: ConversationHistoryMessage[] = [
      { role: 'assistant', content: '2' },
      { role: 'user', content: '1' },
    ]

    const builder = createApiInputBuilder(
      buildDependencies({
        history,
        getMaxHistoryMessagesForApi: () => 1,
      })
    )

    const result = await builder.build({ isNewChain: false })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ role: 'assistant' })
  })

  it('maps tool responses into function_call_output items', async () => {
    const history: ConversationHistoryMessage[] = [
      { role: 'tool', tool_call_id: 'call_123', content: 'result' },
    ]

    const builder = createApiInputBuilder(buildDependencies({ history }))
    const result = await builder.build({ isNewChain: false })

    expect(result[0]).toMatchObject({
      type: 'function_call_output',
      call_id: 'call_123',
      output: 'result',
    })
  })

  it('converts last user image into input_image part', async () => {
    const history: ConversationHistoryMessage[] = [
      {
        role: 'assistant',
        content: [{ type: 'app_text', text: 'Nice cat!' }],
      },
      {
        role: 'user',
        local_id_temp: 'user-last',
        content: [
          { type: 'app_text', text: 'Look at this' },
          { type: 'app_image_uri', uri: 'https://example.com/cat.png' },
        ],
      },
    ]

    const builder = createApiInputBuilder(buildDependencies({ history }))
    const result = await builder.build({ isNewChain: false })
    const latestUserItem = result.find(item => item.role === 'user')

    expect(latestUserItem).toMatchObject({
      role: 'user',
      content: [
        { type: 'input_text', text: 'Look at this' },
        { type: 'input_image', image_url: 'https://example.com/cat.png' },
      ],
    })
  })

  it('falls back to placeholder text when non-last images appear', async () => {
    const history: ConversationHistoryMessage[] = [
      {
        role: 'user',
        local_id_temp: 'user-latest',
        content: [{ type: 'app_text', text: 'Most recent question' }],
      },
      {
        role: 'user',
        local_id_temp: 'user-older',
        content: [
          { type: 'app_text', text: 'Previously sent' },
          { type: 'app_image_uri', uri: 'https://example.com/old.png' },
        ],
      },
    ]

    const builder = createApiInputBuilder(buildDependencies({ history }))
    const result = await builder.build({ isNewChain: false })
    const olderUserItem = result.find(
      item => item.role === 'user' && Array.isArray(item.content)
    ) as OpenAI.Responses.Request.UserContentBlock | undefined

    // find block corresponding to older message (with placeholder)
    const placeholderItem = result.find(
      item =>
        item.role === 'user' &&
        Array.isArray(item.content) &&
        item.content.some(
          part =>
            part.type === 'input_text' &&
            part.text === '[User previously sent an image]'
        )
    ) as OpenAI.Responses.Request.UserContentBlock | undefined

    expect(placeholderItem?.content).toContainEqual({
      type: 'input_text',
      text: '[User previously sent an image]',
    })
  })
})
