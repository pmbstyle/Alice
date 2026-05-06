import type OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'
import { getOpenAIClient } from '../apiClients'
import { listModelsViaMainProcess } from './modelDiscovery'
import { buildToolsForProvider } from './tools'
import { buildAssistantSystemPrompt } from '../../prompts/systemPrompt'

export async function listOpenAIModelsForConfig(
  apiKey: string
): Promise<OpenAI.Models.Model[]> {
  const models = await listModelsViaMainProcess({
    apiKey,
    baseURL: 'https://api.openai.com/v1',
    providerName: 'OpenAI',
  })

  return filterOpenAIModels(models)
}

function filterOpenAIModels(
  models: OpenAI.Models.Model[]
): OpenAI.Models.Model[] {
  return models
    .filter(model => {
      const id = model.id

      const isSupportedPrefix =
        id.startsWith('gpt-4') ||
        id.startsWith('gpt-5') ||
        id.startsWith('o1') ||
        id.startsWith('o2') ||
        id.startsWith('o3') ||
        id.startsWith('o4')

      const isExcluded =
        id.includes('research') ||
        id.includes('search') ||
        id.includes('realtime') ||
        id.includes('transcribe') ||
        id.includes('audio') ||
        id.includes('tts') ||
        id.includes('4-') ||
        id.includes('4.5') ||
        id === 'gpt-4'

      return isSupportedPrefix && !isExcluded
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export const listOpenAIModels = async (): Promise<OpenAI.Models.Model[]> => {
  const settings = useSettingsStore().config
  return listOpenAIModelsForConfig(settings.VITE_OPENAI_API_KEY || '')
}

export const createOpenAIResponse = async (
  input: OpenAI.Responses.Request.InputItemLike[],
  previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> => {
  const client = getOpenAIClient()
  const settings = useSettingsStore().config
  const finalToolsForApi = await buildToolsForProvider()

  const modelName = settings.assistantModel || ''
  const isOModel = modelName.startsWith('o')

  const params: OpenAI.Responses.ResponseCreateParams = {
    model: settings.assistantModel || 'gpt-4.1-mini',
    input: input,
    instructions:
      customInstructions ||
      buildAssistantSystemPrompt(settings.assistantSystemPrompt),
    ...(isOModel || settings.assistantModel.startsWith('gpt-5')
      ? {}
      : {
          temperature: settings.assistantTemperature,
          top_p: settings.assistantTopP,
        }),
    ...(settings.assistantModel.startsWith('gpt-5')
      ? {
          reasoning: {
            effort: settings.assistantReasoningEffort || 'medium',
          },
          text: {
            verbosity: settings.assistantVerbosity || 'medium',
          },
        }
      : {}),
    tools: finalToolsForApi.length > 0 ? finalToolsForApi : undefined,
    previous_response_id: previousResponseId || undefined,
    stream: stream,
    store: true,
    truncation: 'auto',
  }

  return client.responses.create(params as any, { signal })
}
