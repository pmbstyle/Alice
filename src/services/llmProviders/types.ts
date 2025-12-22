import type OpenAI from 'openai'

export type ProviderInputItem = OpenAI.Responses.Request.InputItemLike
export type ProviderStreamEvent = OpenAI.Responses.StreamEvent

export interface ProviderCreateResponseOptions {
  previousResponseId?: string | null
  stream?: boolean
  customInstructions?: string
  signal?: AbortSignal
}

export interface LLMProvider {
  listModels(): Promise<OpenAI.Models.Model[]>
  createResponse(
    input: ProviderInputItem[],
    options: ProviderCreateResponseOptions
  ): Promise<any>
  createResponseStream(
    input: ProviderInputItem[],
    options: ProviderCreateResponseOptions
  ): Promise<AsyncIterable<ProviderStreamEvent>>
}
