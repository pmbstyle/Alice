import type OpenAI from 'openai'
import { getMiniMaxClient } from '../apiClients'
import { useSettingsStore } from '../../stores/settingsStore'
import { createOpenAICompatibleResponse } from './openAICompatible'
import { MINIMAX_OPENAI_BASE_URL, MINIMAX_TEXT_MODELS } from './providerCatalog'

function createMiniMaxModel(id: string): OpenAI.Models.Model {
  return {
    id,
    object: 'model',
    created: 0,
    owned_by: 'minimax',
  } as OpenAI.Models.Model
}

function listStaticMiniMaxTextModels(): OpenAI.Models.Model[] {
  return MINIMAX_TEXT_MODELS.map(model => createMiniMaxModel(model.id))
}

function isAuthError(error: any): boolean {
  return error?.status === 401 || error?.status === 403
}

function normalizeBaseUrl(baseURL: string): string {
  return baseURL.replace(/\/+$/, '')
}

function normalizeMiniMaxModels(data: any): OpenAI.Models.Model[] {
  const models = Array.isArray(data?.data) ? data.data : []
  return models.filter((model: any) => typeof model?.id === 'string')
}

function filterMiniMaxTextModels(
  models: OpenAI.Models.Model[]
): OpenAI.Models.Model[] {
  const textModelIds = new Set(MINIMAX_TEXT_MODELS.map(model => model.id))
  return models.filter(model => textModelIds.has(model.id))
}

async function fetchMiniMaxModelsViaMain(
  apiKey: string,
  baseURL: string
): Promise<OpenAI.Models.Model[]> {
  if (typeof window === 'undefined' || !window.httpAPI) {
    throw new Error('Electron HTTP bridge is unavailable.')
  }

  const response = await window.httpAPI.request({
    url: `${normalizeBaseUrl(baseURL)}/models`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: 10 * 1000,
  })

  if (!response.success) {
    throw new Error(response.error || 'MiniMax models request failed.')
  }

  if (response.status && response.status >= 400) {
    const error = new Error(
      `MiniMax models request failed with status ${response.status}.`
    ) as Error & { status?: number; data?: any }
    error.status = response.status
    error.data = response.data
    throw error
  }

  return normalizeMiniMaxModels(response.data)
}

export async function listMiniMaxModelsForConfig(
  apiKey: string,
  baseURL = MINIMAX_OPENAI_BASE_URL
): Promise<OpenAI.Models.Model[]> {
  try {
    const models = await fetchMiniMaxModelsViaMain(apiKey, baseURL)
    const textModels = filterMiniMaxTextModels(models)
    return textModels.length > 0 ? textModels : listStaticMiniMaxTextModels()
  } catch (error) {
    if (isAuthError(error)) {
      throw error
    }
    return listStaticMiniMaxTextModels()
  }
}

export const listMiniMaxModels = async (): Promise<OpenAI.Models.Model[]> => {
  const settings = useSettingsStore().config
  return listMiniMaxModelsForConfig(
    settings.VITE_MINIMAX_API_KEY,
    settings.minimaxBaseUrl || MINIMAX_OPENAI_BASE_URL
  )
}

export const createMiniMaxResponse = async (
  input: OpenAI.Responses.Request.InputItemLike[],
  _previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> => {
  return createOpenAICompatibleResponse(
    'minimax',
    getMiniMaxClient,
    input,
    stream,
    customInstructions,
    signal
  )
}
