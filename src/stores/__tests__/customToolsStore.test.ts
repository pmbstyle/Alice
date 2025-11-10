import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCustomToolsStore } from '../customToolsStore'
import type { CustomToolsSnapshot, ValidatedCustomTool } from '../../../types/customTools'

const baseTool: ValidatedCustomTool = {
  id: 'tool-1',
  name: 'example_tool',
  description: 'Example',
  enabled: true,
  strict: false,
  parameters: { type: 'object', properties: {} },
  handler: { type: 'script', entry: 'custom-tool-scripts/example.js', runtime: 'node' },
  errors: [],
  isValid: true,
}

const snapshot = (): CustomToolsSnapshot => ({
  tools: [JSON.parse(JSON.stringify(baseTool))],
  diagnostics: [],
  filePath: '/tmp/custom-tools.json',
  lastModified: Date.now(),
})

declare global {
  interface Window {
    customToolsAPI?: any
  }
}

function installMockAPI() {
  const snap = snapshot()
  const api = {
    list: vi.fn().mockResolvedValue({ success: true, data: snap }),
    refresh: vi.fn().mockResolvedValue({ success: true, data: snap }),
    replaceJson: vi.fn().mockResolvedValue({ success: true, data: snap }),
    uploadScript: vi
      .fn()
      .mockResolvedValue({ success: true, data: { relativePath: 'custom-tool-scripts/file.js', absolutePath: '/abs/file.js' } }),
    upsert: vi.fn().mockResolvedValue({ success: true, data: snap }),
    toggle: vi.fn().mockResolvedValue({ success: true, data: snap }),
    delete: vi.fn().mockResolvedValue({ success: true, data: { ...snap, tools: [] } }),
  }
  ;(globalThis as any).window = { customToolsAPI: api }
  return api
}

describe('useCustomToolsStore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('loads tools via ensureInitialized', async () => {
    setActivePinia(createPinia())
    const api = installMockAPI()
    const store = useCustomToolsStore()

    await store.ensureInitialized()

    expect(api.list).toHaveBeenCalledTimes(1)
    expect(store.tools).toHaveLength(1)
    expect(store.initialized).toBe(true)
  })

  it('refresh updates snapshot and surfaces errors', async () => {
    setActivePinia(createPinia())
    const api = installMockAPI()
    const store = useCustomToolsStore()
    await store.ensureInitialized()

    const nextSnapshot = snapshot()
    nextSnapshot.tools[0].enabled = false
    nextSnapshot.diagnostics = ['Needs fix']
    api.refresh.mockResolvedValue({ success: true, data: nextSnapshot })

    await store.refresh()

    expect(store.tools[0].enabled).toBe(false)
    expect(store.diagnostics).toEqual(['Needs fix'])
    expect(api.refresh).toHaveBeenCalled()
  })

  it('toggleTool persists and replaces snapshot', async () => {
    setActivePinia(createPinia())
    const api = installMockAPI()
    const store = useCustomToolsStore()
    await store.ensureInitialized()

    const toggledSnapshot = snapshot()
    toggledSnapshot.tools[0].enabled = false
    api.toggle.mockResolvedValue({ success: true, data: toggledSnapshot })

    await store.toggleTool('tool-1', false)

    expect(api.toggle).toHaveBeenCalledWith('tool-1', false)
    expect(store.tools[0].enabled).toBe(false)
  })
})
