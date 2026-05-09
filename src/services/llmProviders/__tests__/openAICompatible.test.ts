import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '../../../stores/settingsStore'
import {
  createOpenAICompatibleResponse,
  stripReasoningFromMiniMaxContent,
} from '../openAICompatible'

function installWindowMocks() {
  ;(globalThis as any).window = {
    customToolsAPI: {
      list: vi.fn().mockResolvedValue({
        success: true,
        data: {
          tools: [],
          diagnostics: [],
          filePath: '',
          lastModified: Date.now(),
        },
      }),
    },
  }
}

function installStreamIpcMock(assertStartArgs?: (args: any) => void) {
  const listeners = new Map<string, (event: any, payload: any) => void>()
  const invoke = vi
    .fn()
    .mockImplementation(async (channel: string, args: any) => {
      if (channel === 'http:stream-start') {
        assertStartArgs?.(args)
        queueMicrotask(() => {
          const eventChannel = `http:stream:event:${args.requestId}`
          const listener = listeners.get(eventChannel)
          listener?.(
            {},
            {
              type: 'chunk',
              data: {
                id: 'chatcmpl-stream-test',
                choices: [
                  {
                    delta: {
                      content: 'hello streamed',
                    },
                    finish_reason: 'stop',
                  },
                ],
              },
            }
          )
          listener?.({}, { type: 'done' })
        })
        return { success: true }
      }
      if (channel === 'http:stream-cancel') {
        return { success: true }
      }
      return { success: false, error: `Unexpected channel: ${channel}` }
    })

  ;(globalThis as any).window.ipcRenderer = {
    invoke,
    on: vi.fn((channel: string, listener: any) => {
      listeners.set(channel, listener)
      return undefined
    }),
    off: vi.fn((channel: string) => {
      listeners.delete(channel)
      return undefined
    }),
  }

  return { invoke }
}

describe('createOpenAICompatibleResponse', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    installWindowMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('sends a safe Z.ai Coding Plan model id', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.updateSetting('aiProvider', 'zai')
    settingsStore.updateSetting('assistantModel', 'gpt-4o-mini')

    const create = vi.fn().mockResolvedValue({ choices: [] })
    const client = {
      chat: {
        completions: {
          create,
        },
      },
    }

    await createOpenAICompatibleResponse(
      'zai',
      () => client as any,
      [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        } as any,
      ],
      false
    )

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'glm-5.1',
      }),
      expect.any(Object)
    )
  })

  it('sends a safe MiniMax text model id', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.updateSetting('aiProvider', 'minimax')
    settingsStore.updateSetting('VITE_MINIMAX_API_KEY', 'sk-test')
    settingsStore.updateSetting('assistantModel', 'gpt-4o-mini')

    const request = vi.fn().mockResolvedValue({
      success: true,
      status: 200,
      data: {
        id: 'chatcmpl-test',
        choices: [
          {
            message: {
              content: 'hello back',
            },
          },
        ],
      },
    })
    ;(globalThis as any).window.httpAPI = {
      request,
    }
    const getClient = vi.fn()

    await createOpenAICompatibleResponse(
      'minimax',
      getClient as any,
      [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        } as any,
      ],
      false
    )

    expect(getClient).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://api.minimax.io/v1/chat/completions',
        headers: {
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        },
        data: expect.objectContaining({
          model: 'MiniMax-M2.7',
          reasoning_split: true,
          stream: false,
        }),
      })
    )
    expect(request.mock.calls[0][0].headers['x-stainless-os']).toBeUndefined()
  })

  it('sends DeepSeek chat completions with thinking disabled', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.updateSetting('aiProvider', 'deepseek')
    settingsStore.updateSetting('assistantModel', 'deepseek-chat')

    const create = vi.fn().mockResolvedValue({ choices: [] })
    const client = {
      chat: {
        completions: {
          create,
        },
      },
    }

    await createOpenAICompatibleResponse(
      'deepseek',
      () => client as any,
      [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        } as any,
      ],
      false
    )

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek-v4-flash',
        thinking: { type: 'disabled' },
      }),
      expect.any(Object)
    )
  })

  it('does not send system-role messages to MiniMax continuations', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.updateSetting('aiProvider', 'minimax')
    settingsStore.updateSetting('VITE_MINIMAX_API_KEY', 'sk-test')

    const request = vi.fn().mockResolvedValue({
      success: true,
      status: 200,
      data: {
        id: 'chatcmpl-test',
        choices: [{ message: { content: 'В памяти пусто.' } }],
      },
    })
    ;(globalThis as any).window.httpAPI = {
      request,
    }

    await createOpenAICompatibleResponse(
      'minimax',
      vi.fn() as any,
      [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'Помнишь имена?' }],
        } as any,
        {
          role: 'assistant',
          content: [],
          tool_calls: [
            {
              call_id: 'call_1',
              name: 'recall_memories',
              arguments: { query: 'cats names' },
            },
          ],
        } as any,
        {
          role: 'system',
          content: [{ type: 'input_text', text: '🧠 Let me think back...' }],
        } as any,
        {
          type: 'function_call_output',
          call_id: 'call_1',
          output: '[]',
        } as any,
      ],
      false,
      'Core persona instructions'
    )

    const messages = request.mock.calls[0][0].data.messages
    expect(messages.some((message: any) => message.role === 'system')).toBe(
      false
    )
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toContain('Core persona instructions')
    expect(messages[0].content).not.toContain('Let me think back')
    expect(messages.map((message: any) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
    ])
  })

  it('strips MiniMax think blocks before rendering content', () => {
    expect(
      stripReasoningFromMiniMaxContent(
        '<think>The user asks whether I played it.</think>\n\nНет, я сама в неё не играла.'
      )
    ).toBe('Нет, я сама в неё не играла.')
  })

  it('streams MiniMax chat completions through the main-process bridge', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.updateSetting('aiProvider', 'minimax')
    settingsStore.updateSetting('VITE_MINIMAX_API_KEY', 'sk-test')

    let startedStreamArgs: any = null
    installStreamIpcMock(args => {
      startedStreamArgs = args
    })

    const stream = await createOpenAICompatibleResponse(
      'minimax',
      vi.fn() as any,
      [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        } as any,
      ],
      true
    )

    const events: any[] = []
    for await (const event of stream) {
      events.push(event)
    }

    expect(startedStreamArgs).toMatchObject({
      method: 'POST',
      url: 'https://api.minimax.io/v1/chat/completions',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      data: expect.objectContaining({
        model: 'MiniMax-M2.7',
        reasoning_split: true,
        stream: true,
      }),
    })
    expect(
      events.some(
        event =>
          event.type === 'response.output_text.delta' &&
          event.delta === 'hello streamed'
      )
    ).toBe(true)
  })
})
