import { afterEach, describe, expect, it, vi } from 'vitest'
import { listCodexModels } from '../codex'

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
})
