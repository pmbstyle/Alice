import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '../../../stores/settingsStore'
import { getRequestyClient } from '../../apiClients'
import {
  createRequestyResponse,
  listRequestyModelsForConfig,
} from '../requesty'

vi.mock('../../apiClients', () => ({
  getRequestyClient: vi.fn(),
}))

describe('Requesty model listing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('lists managed models first, then the model catalog', async () => {
    const request = vi.fn().mockImplementation(({ url }: { url: string }) =>
      Promise.resolve({
        success: true,
        status: 200,
        data: {
          data: url.endsWith('/models/managed')
            ? [
                { id: 'gpt-5.4-mini', api: 'chat' },
                { id: 'claude-sonnet-4-5', api: 'chat' },
              ]
            : [
                { id: 'openai/gpt-4o-mini', api: 'chat' },
                { id: 'openai/text-embedding-3-small', api: 'embedding' },
                { id: 'anthropic/claude-sonnet-4-5', api: 'chat' },
              ],
        },
      })
    )
    ;(globalThis as any).window = { httpAPI: { request } }

    const models = await listRequestyModelsForConfig('rqsty-test')

    expect(models.map(model => model.id)).toEqual([
      'claude-sonnet-4-5',
      'gpt-5.4-mini',
      'anthropic/claude-sonnet-4-5',
      'openai/gpt-4o-mini',
    ])
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://router.requesty.ai/v1/models',
        method: 'GET',
        headers: { Authorization: 'Bearer rqsty-test' },
      })
    )
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://router.requesty.ai/v1/models/managed',
      })
    )
  })

  it('keeps the catalog when the managed list is unavailable', async () => {
    const request = vi.fn().mockImplementation(({ url }: { url: string }) =>
      Promise.resolve(
        url.endsWith('/models/managed')
          ? { success: false, error: 'network error' }
          : {
              success: true,
              status: 200,
              data: { data: [{ id: 'openai/gpt-4o-mini', api: 'chat' }] },
            }
      )
    )
    ;(globalThis as any).window = { httpAPI: { request } }

    const models = await listRequestyModelsForConfig('rqsty-test')

    expect(models.map(model => model.id)).toEqual(['openai/gpt-4o-mini'])
  })

  it('rejects an invalid key', async () => {
    const request = vi.fn().mockResolvedValue({
      success: true,
      status: 403,
      data: { error: { message: 'Invalid authorization token' } },
    })
    ;(globalThis as any).window = { httpAPI: { request } }

    await expect(listRequestyModelsForConfig('bad-key')).rejects.toThrow(
      'Invalid authorization token'
    )
  })
})

describe('createRequestyResponse', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('sends chat completions with the configured Requesty model', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.updateSetting('aiProvider', 'requesty')
    settingsStore.updateSetting('assistantModel', 'anthropic/claude-sonnet-4-5')

    const create = vi.fn().mockResolvedValue({ choices: [] })
    vi.mocked(getRequestyClient).mockReturnValue({
      chat: { completions: { create } },
    } as any)

    await createRequestyResponse(
      [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'Hello there' }],
        } as any,
      ],
      null,
      false
    )

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-sonnet-4-5',
        stream: false,
      }),
      expect.any(Object)
    )
  })
})
