import type OpenAI from 'openai'
import { getAPIRouteClient } from '../apiClients'
import { useSettingsStore } from '../../stores/settingsStore'
import { listModelsViaMainProcess } from './modelDiscovery'
import { createOpenAICompatibleResponse } from './openAICompatible'
import { API_ROUTE_OPENAI_BASE_URL } from './providerCatalog'

export function listAPIRouteModelsForConfig(
  apiKey: string
): Promise<OpenAI.Models.Model[]> {
  return listModelsViaMainProcess({
    apiKey,
    baseURL: API_ROUTE_OPENAI_BASE_URL,
    providerName: 'API Route',
  })
}

export function listAPIRouteModels(): Promise<OpenAI.Models.Model[]> {
  const settings = useSettingsStore().config
  return listAPIRouteModelsForConfig(settings.VITE_API_ROUTE_API_KEY || '')
}

export function createAPIRouteResponse(
  input: OpenAI.Responses.Request.InputItemLike[],
  _previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> {
  return createOpenAICompatibleResponse(
    'api-route',
    getAPIRouteClient,
    input,
    stream,
    customInstructions,
    signal
  )
}
