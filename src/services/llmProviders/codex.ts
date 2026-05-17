import type OpenAI from 'openai'
import { CODEX_TEXT_MODELS } from './providerCatalog'

interface CodexModelListResult {
  success?: boolean
  models?: Array<{
    id?: string
    model?: string
    displayName?: string
    hidden?: boolean
  }>
}

function fallbackModels(): OpenAI.Models.Model[] {
  return CODEX_TEXT_MODELS.map(model => ({
    id: model.id,
    object: 'model' as const,
    created: 0,
    owned_by: 'chatgpt-codex',
  }))
}

export async function listCodexModels(): Promise<OpenAI.Models.Model[]> {
  if (typeof window === 'undefined' || !window.ipcRenderer) {
    return fallbackModels()
  }

  try {
    const result = (await window.ipcRenderer.invoke(
      'codex-models:list'
    )) as CodexModelListResult

    if (!result?.success || !Array.isArray(result.models)) {
      return fallbackModels()
    }

    const liveModels = result.models
      .filter(model => !model.hidden)
      .map(model => model.id || model.model)
      .filter((id): id is string => Boolean(id?.trim()))
      .map(id => ({
        id,
        object: 'model' as const,
        created: 0,
        owned_by: 'chatgpt-codex',
      }))

    return liveModels.length > 0 ? liveModels : fallbackModels()
  } catch (error) {
    console.warn('Failed to list ChatGPT Codex models:', error)
    return fallbackModels()
  }
}
