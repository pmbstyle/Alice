import type OpenAI from 'openai'
import { getZAIClient } from '../apiClients'
import {
  createOpenAICompatibleResponse,
  listOpenAICompatibleModels,
} from './openAICompatible'
import { ZAI_CODING_MODELS } from './providerCatalog'

function createZAIModel(id: string): OpenAI.Models.Model {
  return {
    id,
    object: 'model',
    created: 0,
    owned_by: 'zai',
  } as OpenAI.Models.Model
}

function listStaticZAICodingModels(): OpenAI.Models.Model[] {
  return ZAI_CODING_MODELS.map(model => createZAIModel(model.id))
}

function isAuthError(error: any): boolean {
  return error?.status === 401 || error?.status === 403
}

export const listZAIModels = async (): Promise<OpenAI.Models.Model[]> => {
  try {
    const models = await listOpenAICompatibleModels(getZAIClient)
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
