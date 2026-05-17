import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '../../../stores/settingsStore'
import {
  convertResponsesInputToCodexInput,
  createCodexResponse,
  createCodexTextResponse,
  listCodexModels,
} from '../codex'

describe('listCodexModels', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('returns live app-server models when available', async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      models: [
        { id: 'gpt-5.5', hidden: false },
        { model: 'gpt-5.4-mini', hidden: false },
        { id: 'hidden-model', hidden: true },
      ],
    })
    ;(globalThis as any).window = {
      ipcRenderer: { invoke },
    }

    await expect(listCodexModels()).resolves.toEqual([
      {
        id: 'gpt-5.5',
        object: 'model',
        created: 0,
        owned_by: 'chatgpt-codex',
      },
      {
        id: 'gpt-5.4-mini',
        object: 'model',
        created: 0,
        owned_by: 'chatgpt-codex',
      },
    ])
    expect(invoke).toHaveBeenCalledWith('codex-models:list')
  })

  it('falls back to safe static models when discovery fails', async () => {
    ;(globalThis as any).window = {
      ipcRenderer: {
        invoke: vi.fn().mockResolvedValue({ success: false }),
      },
    }

    const models = await listCodexModels()

    expect(models.map(model => model.id)).toEqual([
      'gpt-5.4',
      'gpt-5.2-codex',
      'gpt-5.1-codex-max',
      'gpt-5.4-mini',
      'gpt-5.3-codex',
      'gpt-5.3-codex-spark',
      'gpt-5.2',
      'gpt-5.1-codex-mini',
    ])
  })

  it('flattens Responses API history for a Codex user turn', () => {
    const codexInput = convertResponsesInputToCodexInput([
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'hello' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'output_text', text: 'hi there' }],
      },
      {
        type: 'function_call_output',
        call_id: 'call_123',
        output: 'tool result',
      } as any,
    ] as any)

    expect(codexInput).toEqual([
      {
        type: 'text',
        text: [
          'USER:\nhello',
          'ASSISTANT:\nhi there',
          '[Tool output call_123]\ntool result',
        ].join('\n\n'),
      },
    ])
  })

  it('uses live app-server models instead of a stale configured Codex model', async () => {
    setActivePinia(createPinia())
    const settingsStore = useSettingsStore()
    settingsStore.updateSetting('aiProvider', 'codex')
    settingsStore.updateSetting('assistantModel', 'gpt-5.5')

    const listeners = new Map<string, (event: any, payload: any) => void>()
    const startArgs: any[] = []
    const invoke = vi
      .fn()
      .mockImplementation(async (channel: string, args: any) => {
        if (channel === 'codex-models:list') {
          return {
            success: true,
            models: [{ id: 'gpt-5.2', hidden: false }],
          }
        }
        if (channel === 'codex-response:start') {
          startArgs.push(args)
          queueMicrotask(() => {
            listeners.get(`codex:stream:event:${args.requestId}`)?.(
              {},
              { type: 'done' }
            )
          })
          return { success: true }
        }
        if (channel === 'codex-response:cancel') {
          return { success: true }
        }
        return { success: false, error: `Unexpected channel: ${channel}` }
      })

    ;(globalThis as any).window = {
      ipcRenderer: {
        invoke,
        on: vi.fn((channel: string, listener: any) => {
          listeners.set(channel, listener)
        }),
        off: vi.fn((channel: string) => {
          listeners.delete(channel)
        }),
      },
    }

    const stream = await createCodexResponse(
      [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        },
      ] as any,
      null,
      true
    )

    for await (const event of stream) {
      expect(event).toBeDefined()
    }

    expect(startArgs[0]?.model).toBe('gpt-5.2')
  })

  it('aggregates Codex app-server text for background responses', async () => {
    const listeners = new Map<string, (event: any, payload: any) => void>()
    const invoke = vi
      .fn()
      .mockImplementation(async (channel: string, args: any) => {
        if (channel === 'codex-models:list') {
          return {
            success: true,
            models: [{ id: 'gpt-5.3-codex-spark', hidden: false }],
          }
        }
        if (channel === 'codex-response:start') {
          queueMicrotask(() => {
            const listener = listeners.get(
              `codex:stream:event:${args.requestId}`
            )
            listener?.(
              {},
              {
                type: 'chunk',
                data: {
                  type: 'response.output_text.delta',
                  delta: 'summary ',
                },
              }
            )
            listener?.(
              {},
              {
                type: 'chunk',
                data: {
                  type: 'response.output_text.delta',
                  delta: 'done',
                },
              }
            )
            listener?.({}, { type: 'done' })
          })
          return { success: true }
        }
        if (channel === 'codex-response:cancel') {
          return { success: true }
        }
        return { success: false, error: `Unexpected channel: ${channel}` }
      })

    ;(globalThis as any).window = {
      ipcRenderer: {
        invoke,
        on: vi.fn((channel: string, listener: any) => {
          listeners.set(channel, listener)
        }),
        off: vi.fn((channel: string) => {
          listeners.delete(channel)
        }),
      },
    }

    await expect(
      createCodexTextResponse('hello', 'gpt-5.3-codex-spark', 'summarize')
    ).resolves.toBe('summary done')
  })
})
