import type OpenAI from 'openai'
import { getRequestyClient } from '../apiClients'
import { useSettingsStore } from '../../stores/settingsStore'
import { listModelsViaMainProcess } from './modelDiscovery'
import { createOpenAICompatibleResponse } from './openAICompatible'
import { REQUESTY_OPENAI_BASE_URL } from './providerCatalog'

function isChatModel(model: any): boolean {
  return !model.api || model.api === 'chat'
}

async function listRequestyManagedModels(
  apiKey: string
): Promise<OpenAI.Models.Model[]> {
  try {
    const response = await window.httpAPI.request({
      url: `${REQUESTY_OPENAI_BASE_URL}/models/managed`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 10 * 1000,
    })
    if (!response.success || (response.status && response.status >= 400)) {
      return []
    }
    const models = Array.isArray(response.data?.data) ? response.data.data : []
    return models
      .filter((model: any) => typeof model?.id === 'string')
      .map((model: any) => ({ ...model, object: model.object || 'model' }))
      .sort((a: OpenAI.Models.Model, b: OpenAI.Models.Model) =>
        a.id.localeCompare(b.id)
      )
  } catch {
    return []
  }
}

export async function listRequestyModelsForConfig(
  apiKey: string
): Promise<OpenAI.Models.Model[]> {
  // The authenticated catalog request also validates the key.
  const catalogModels = await listModelsViaMainProcess({
    apiKey,
    baseURL: REQUESTY_OPENAI_BASE_URL,
    providerName: 'Requesty',
  })
  const managedModels = await listRequestyManagedModels(apiKey)

  // Managed policies come first, followed by the full model catalog.
  const seen = new Set<string>()
  return [...managedModels, ...catalogModels].filter(model => {
    if (!isChatModel(model) || seen.has(model.id)) {
      return false
    }
    seen.add(model.id)
    return true
  })
}

export function listRequestyModels(): Promise<OpenAI.Models.Model[]> {
  const settings = useSettingsStore().config
  return listRequestyModelsForConfig(settings.VITE_REQUESTY_API_KEY || '')
}

export function createRequestyResponse(
  input: OpenAI.Responses.Request.InputItemLike[],
  _previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> {
  return createOpenAICompatibleResponse(
    'requesty',
    getRequestyClient,
    input,
    stream,
    customInstructions,
    signal
  )
}
