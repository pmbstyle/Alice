import type OpenAI from 'openai'
import { getMiniMaxClient } from '../apiClients'
import {
  createOpenAICompatibleResponse,
  listOpenAICompatibleModels,
} from './openAICompatible'

export const listMiniMaxModels = async (): Promise<OpenAI.Models.Model[]> => {
  return listOpenAICompatibleModels(getMiniMaxClient)
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
