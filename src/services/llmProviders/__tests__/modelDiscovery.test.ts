import { afterEach, describe, expect, it, vi } from 'vitest'
import { listModelsViaMainProcess } from '../modelDiscovery'

describe('main-process model discovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('uses the Electron HTTP bridge without OpenAI SDK stainless headers', async () => {
    const request = vi.fn().mockResolvedValue({
      success: true,
      status: 200,
      data: {
        data: [{ id: 'z-model' }, { id: 'a-model', object: 'model' }],
      },
    })
    ;(globalThis as any).window = {
      httpAPI: {
        request,
      },
    }

    const models = await listModelsViaMainProcess({
      apiKey: 'sk-test',
      baseURL: 'https://example.com/v1/',
      providerName: 'Example',
    })

    expect(models.map(model => model.id)).toEqual(['a-model', 'z-model'])
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/v1/models',
        method: 'GET',
        headers: {
          Authorization: 'Bearer sk-test',
        },
      })
    )
    expect(request.mock.calls[0][0].headers['x-stainless-os']).toBeUndefined()
  })

  it('throws HTTP status errors so provider auth handling still works', async () => {
    ;(globalThis as any).window = {
      httpAPI: {
        request: vi.fn().mockResolvedValue({
          success: true,
          status: 401,
          data: {
            error: {
              message: 'Unauthorized',
            },
          },
        }),
      },
    }

    await expect(
      listModelsViaMainProcess({
        apiKey: 'bad-key',
        baseURL: 'https://example.com/v1',
        providerName: 'Example',
      })
    ).rejects.toMatchObject({
      status: 401,
      message: 'Unauthorized',
    })
  })
})
