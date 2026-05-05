import type OpenAI from 'openai'
import { getZAIClient } from '../apiClients'
import {
  createOpenAICompatibleResponse,
  listOpenAICompatibleModels,
} from './openAICompatible'

export const listZAIModels = async (): Promise<OpenAI.Models.Model[]> => {
  return listOpenAICompatibleModels(getZAIClient)
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
