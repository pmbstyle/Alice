import { afterEach, describe, expect, it, vi } from 'vitest'
import { listMiniMaxModelsForConfig } from '../minimax'

describe('MiniMax model listing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('uses the Electron HTTP bridge without OpenAI SDK stainless headers', async () => {
    const request = vi.fn().mockResolvedValue({
      success: true,
      status: 200,
      data: {
        data: [{ id: 'MiniMax-M2.7' }, { id: 'unrelated-model' }],
      },
    })
    ;(globalThis as any).window = {
      httpAPI: {
        request,
      },
    }

    const models = await listMiniMaxModelsForConfig(
      'sk-test',
      'https://api.minimax.io/v1/'
    )

    expect(models.map(model => model.id)).toEqual(['MiniMax-M2.7'])
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.minimax.io/v1/models',
        method: 'GET',
        headers: {
          Authorization: 'Bearer sk-test',
        },
      })
    )
    expect(request.mock.calls[0][0].headers['x-stainless-os']).toBeUndefined()
  })
})
