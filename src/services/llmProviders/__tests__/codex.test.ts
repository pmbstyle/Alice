import { afterEach, describe, expect, it, vi } from 'vitest'
import { convertResponsesInputToCodexInput, listCodexModels } from '../codex'

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
      'gpt-5.5',
      'gpt-5.4-mini',
      'gpt-5.2',
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
})
