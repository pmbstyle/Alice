import { afterEach, describe, expect, it, vi } from 'vitest'
import { listAPIRouteModelsForConfig } from '../apiRoute'

describe('API Route model listing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('loads account models through the Electron HTTP bridge', async () => {
    const request = vi.fn().mockResolvedValue({
      success: true,
      status: 200,
      data: { data: [{ id: 'gpt-5.4-mini' }, { id: 'claude-sonnet-4-5' }] },
    })
    ;(globalThis as any).window = { httpAPI: { request } }

    const models = await listAPIRouteModelsForConfig('sk-test')

    expect(models.map(model => model.id)).toEqual([
      'claude-sonnet-4-5',
      'gpt-5.4-mini',
    ])
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://global.api-route.com/v1/models',
        method: 'GET',
        headers: { Authorization: 'Bearer sk-test' },
      })
    )
  })
})
