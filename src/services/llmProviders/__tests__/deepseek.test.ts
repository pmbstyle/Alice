import { afterEach, describe, expect, it, vi } from 'vitest'
import { listDeepSeekModelsForConfig } from '../deepseek'

describe('DeepSeek model listing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('uses the Electron HTTP bridge and filters to supported text models', async () => {
    const request = vi.fn().mockResolvedValue({
      success: true,
      status: 200,
      data: {
        data: [
          { id: 'deepseek-v4-flash' },
          { id: 'deepseek-v4-pro' },
          { id: 'unrelated-model' },
        ],
      },
    })
    ;(globalThis as any).window = {
      httpAPI: {
        request,
      },
    }

    const models = await listDeepSeekModelsForConfig(
      'sk-test',
      'https://api.deepseek.com/'
    )

    expect(models.map(model => model.id)).toEqual([
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ])
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.deepseek.com/models',
        method: 'GET',
        headers: {
          Authorization: 'Bearer sk-test',
        },
      })
    )
    expect(request.mock.calls[0][0].headers['x-stainless-os']).toBeUndefined()
  })
})
