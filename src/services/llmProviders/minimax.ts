import type OpenAI from 'openai'
import { getMiniMaxClient } from '../apiClients'
import { useSettingsStore } from '../../stores/settingsStore'
import { createProviderModel, listModelsViaMainProcess } from './modelDiscovery'
import { createOpenAICompatibleResponse } from './openAICompatible'
import { MINIMAX_OPENAI_BASE_URL, MINIMAX_TEXT_MODELS } from './providerCatalog'

function createMiniMaxModel(id: string): OpenAI.Models.Model {
  return createProviderModel(id, 'minimax')
}

function listStaticMiniMaxTextModels(): OpenAI.Models.Model[] {
  return MINIMAX_TEXT_MODELS.map(model => createMiniMaxModel(model.id))
}

function isAuthError(error: any): boolean {
  return error?.status === 401 || error?.status === 403
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
  return listModelsViaMainProcess({
    apiKey,
    baseURL,
    providerName: 'MiniMax',
  })
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
    settings.VITE_MINIMAX_API_KEY || '',
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
