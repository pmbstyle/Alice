import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  CustomToolsSnapshot,
  ValidatedCustomTool,
  UploadCustomToolScriptResult,
  CustomToolDefinition,
} from '../../types/customTools'

interface OperationResult<T> {
  success: boolean
  data?: T
  error?: string
}

export const useCustomToolsStore = defineStore('customTools', () => {
  const tools = ref<ValidatedCustomTool[]>([])
  const diagnostics = ref<string[]>([])
  const filePath = ref('')
  const lastModified = ref<number | null>(null)
  const isLoading = ref(false)
  const isRefreshing = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)

  function setSnapshot(snapshot: CustomToolsSnapshot) {
    tools.value = snapshot.tools
    diagnostics.value = snapshot.diagnostics
    filePath.value = snapshot.filePath
    lastModified.value = snapshot.lastModified
  }

  async function fetchSnapshot(): Promise<void> {
    if (!window.customToolsAPI) {
      diagnostics.value = ['Custom tools API is unavailable in this environment.']
      tools.value = []
      error.value = null
      initialized.value = true
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const response = (await window.customToolsAPI.list()) as OperationResult<CustomToolsSnapshot>
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Unable to load custom tools.')
      }
      setSnapshot(response.data)
    } catch (err: any) {
      error.value = err?.message || 'Unable to load custom tools.'
    } finally {
      isLoading.value = false
      initialized.value = true
    }
  }

  async function ensureInitialized() {
    if (!initialized.value) {
      await fetchSnapshot()
    }
  }

  async function refresh() {
    if (!window.customToolsAPI) return
    if (isRefreshing.value) return
    isRefreshing.value = true
    try {
      const response = await window.customToolsAPI.refresh()
      if (response.success && response.data) {
        setSnapshot(response.data)
      } else if (response.error) {
        error.value = response.error
      }
    } catch (err: any) {
      error.value = err?.message || 'Unable to refresh custom tools.'
    } finally {
      isRefreshing.value = false
    }
  }

  async function replaceJson(rawJson: string) {
    if (!window.customToolsAPI) return
    isLoading.value = true
    error.value = null
    try {
      const response = await window.customToolsAPI.replaceJson(rawJson)
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to save custom tools JSON.')
      }
      setSnapshot(response.data)
    } catch (err: any) {
      error.value = err?.message || 'Failed to save custom tools JSON.'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function uploadScript(file: File): Promise<UploadCustomToolScriptResult | null> {
    if (!window.customToolsAPI) return null
    const arrayBuffer = await file.arrayBuffer()
    const response = await window.customToolsAPI.uploadScript(
      file.name,
      arrayBuffer
    )
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to upload script.')
    }
    return response.data
  }

  async function upsertTool(tool: Partial<CustomToolDefinition>) {
    if (!window.customToolsAPI) return
    const response = await window.customToolsAPI.upsert(tool)
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to save custom tool.')
    }
    setSnapshot(response.data)
  }

  async function toggleTool(id: string, enabled: boolean) {
    if (!window.customToolsAPI) return
    const response = await window.customToolsAPI.toggle(id, enabled)
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update custom tool.')
    }
    setSnapshot(response.data)
  }

  async function deleteTool(id: string) {
    if (!window.customToolsAPI) return
    const response = await window.customToolsAPI.delete(id)
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to delete custom tool.')
    }
    setSnapshot(response.data)
  }

  const toolsByName = computed(() => {
    return tools.value.reduce<Record<string, ValidatedCustomTool>>((acc, tool) => {
      acc[tool.name] = tool
      return acc
    }, {})
  })

  const enabledTools = computed(() =>
    tools.value.filter(tool => tool.enabled)
  )

  const enabledAndValidTools = computed(() =>
    tools.value.filter(tool => tool.enabled && tool.isValid)
  )

  const hasDiagnostics = computed(() => diagnostics.value.length > 0)

  const customToolNamesForApi = computed(() =>
    enabledAndValidTools.value.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: tool.strict ?? false,
    }))
  )

  return {
    tools,
    diagnostics,
    filePath,
    lastModified,
    isLoading,
    isRefreshing,
    error,
    initialized,
    toolsByName,
    enabledTools,
    enabledAndValidTools,
    hasDiagnostics,
    customToolNamesForApi,
    ensureInitialized,
    fetchSnapshot,
    refresh,
    replaceJson,
    uploadScript,
    upsertTool,
    toggleTool,
    deleteTool,
  }
})
