import type OpenAI from 'openai'
import { getZAIClient } from '../apiClients'
import { createOpenAICompatibleResponse } from './openAICompatible'
import { useSettingsStore } from '../../stores/settingsStore'
import { createProviderModel, listModelsViaMainProcess } from './modelDiscovery'
import { ZAI_CODING_BASE_URL, ZAI_CODING_MODELS } from './providerCatalog'

function listStaticZAICodingModels(): OpenAI.Models.Model[] {
  return ZAI_CODING_MODELS.map(model => createProviderModel(model.id, 'zai'))
}

function isAuthError(error: any): boolean {
  return error?.status === 401 || error?.status === 403
}

export async function listZAIModelsForConfig(
  apiKey: string,
  baseURL = ZAI_CODING_BASE_URL
): Promise<OpenAI.Models.Model[]> {
  try {
    const models = await listModelsViaMainProcess({
      apiKey,
      baseURL,
      providerName: 'Z.ai',
    })
    const codingModelIds = new Set(ZAI_CODING_MODELS.map(model => model.id))
    const codingModels = models.filter(model => codingModelIds.has(model.id))
    return codingModels.length > 0 ? codingModels : listStaticZAICodingModels()
  } catch (error) {
    if (isAuthError(error)) {
      throw error
    }
    return listStaticZAICodingModels()
  }
}

export const listZAIModels = async (): Promise<OpenAI.Models.Model[]> => {
  const settings = useSettingsStore().config
  return listZAIModelsForConfig(
    settings.VITE_ZAI_API_KEY || '',
    settings.zaiBaseUrl || ZAI_CODING_BASE_URL
  )
}

export const createZAIResponse = async (
  input: OpenAI.Responses.Request.InputItemLike[],
  _previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> => {
  return createOpenAICompatibleResponse(
    'zai',
    getZAIClient,
    input,
    stream,
    customInstructions,
    signal
  )
}
