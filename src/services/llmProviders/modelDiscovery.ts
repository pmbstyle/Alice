import type OpenAI from 'openai'

export interface MainProcessModelListConfig {
  apiKey: string
  baseURL: string
  providerName: string
  timeout?: number
}

export function normalizeBaseUrl(baseURL: string): string {
  return baseURL.replace(/\/+$/, '')
}

export function createProviderModel(
  id: string,
  ownedBy: string
): OpenAI.Models.Model {
  return {
    id,
    object: 'model',
    created: 0,
    owned_by: ownedBy,
  } as OpenAI.Models.Model
}

function normalizeModelsPayload(data: any): OpenAI.Models.Model[] {
  const models = Array.isArray(data?.data) ? data.data : []
  return models
    .filter((model: any) => typeof model?.id === 'string')
    .map((model: any) => ({
      ...model,
      object: model.object || 'model',
    }))
}

export async function listModelsViaMainProcess({
  apiKey,
  baseURL,
  providerName,
  timeout = 10 * 1000,
}: MainProcessModelListConfig): Promise<OpenAI.Models.Model[]> {
  if (!apiKey?.trim()) {
    throw new Error(`${providerName} API Key is not configured.`)
  }
  if (typeof window === 'undefined' || !window.httpAPI) {
    throw new Error('Electron HTTP bridge is unavailable.')
  }

  const response = await window.httpAPI.request({
    url: `${normalizeBaseUrl(baseURL)}/models`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    timeout,
  })

  if (!response.success) {
    const status = response.response?.status
    const message =
      response.response?.data?.error?.message ||
      response.response?.data?.message ||
      response.error ||
      `${providerName} models request failed.`
    const error = new Error(message) as Error & { status?: number; data?: any }
    error.status = status
    error.data = response.response?.data
    throw error
  }

  if (response.status && response.status >= 400) {
    const message =
      response.data?.error?.message ||
      response.data?.message ||
      `${providerName} models request failed with status ${response.status}.`
    const error = new Error(message) as Error & { status?: number; data?: any }
    error.status = response.status
    error.data = response.data
    throw error
  }

  return normalizeModelsPayload(response.data).sort((a, b) =>
    a.id.localeCompare(b.id)
  )
}
