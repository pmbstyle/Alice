import OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  PREDEFINED_OPENAI_TOOLS,
  type ApiRequestBodyFunctionTool,
} from '../../utils/assistantTools'

interface OpenAIResponsesApiFunctionTool {
  type: 'function'
  name: string
  description?: string
  parameters: OpenAI.FunctionTool.Parameters
}

interface OpenAIResponsesApiImageTool {
  type: 'image_generation'
}

interface OpenAIResponsesApiWebSearchPreviewTool {
  type: 'web_search_preview'
}

type OpenAIResponsesApiTool =
  | OpenAIResponsesApiFunctionTool
  | OpenAIResponsesApiImageTool
  | OpenAIResponsesApiWebSearchPreviewTool

export const getOpenAIClient = (): OpenAI => {
  const settings = useSettingsStore().config
  if (!settings.VITE_OPENAI_API_KEY) {
    console.error('OpenAI API Key is not configured.')
    throw new Error('OpenAI API Key is not configured.')
  }
  return new OpenAI({
    apiKey: settings.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  })
}

export const createOpenAIResponse = async (
  input: any[],
  previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string
): Promise<any> => {
  const openai = getOpenAIClient()
  const settings = useSettingsStore().config

  const finalToolsForApi: OpenAIResponsesApiTool[] = []

  if (settings.assistantTools && settings.assistantTools.length > 0) {
    for (const toolNameFromSettings of settings.assistantTools) {
      const toolDefinition = PREDEFINED_OPENAI_TOOLS.find(
        (tool: ApiRequestBodyFunctionTool) => tool.name === toolNameFromSettings
      )

      if (toolDefinition) {
        const { name, description, parameters } = toolDefinition
        finalToolsForApi.push({
          type: 'function',
          name,
          description,
          parameters,
        } as OpenAIResponsesApiFunctionTool)
      } else {
        console.warn(
          `Tool definition for '${toolNameFromSettings}' not found in PREDEFINED_OPENAI_TOOLS.`
        )
      }
    }
  }

  finalToolsForApi.push({
    type: 'image_generation',
  } as OpenAIResponsesApiImageTool)

  finalToolsForApi.push({
    type: 'web_search_preview',
  } as OpenAIResponsesApiWebSearchPreviewTool)

  const params: OpenAI.Responses.ResponseCreateParams = {
    model: settings.assistantModel || 'gpt-4.1-mini',
    input: input,
    instructions:
      customInstructions !== undefined
        ? customInstructions
        : settings.assistantSystemPrompt || undefined,
    temperature: settings.assistantTemperature ?? 1.0,
    top_p: settings.assistantTopP ?? 1.0,
    tools: finalToolsForApi.length > 0 ? finalToolsForApi : undefined,
    previous_response_id: previousResponseId || undefined,
    stream: stream,
    store: true,
    truncation: 'auto',
  }
  //console.log('[REQUEST PARAMS]', JSON.stringify(params, null, 2))

  if (stream) {
    return openai.responses.create(params as any)
  } else {
    return openai.responses.create(params as any)
  }
}

export const ttsStream = async (text: string): Promise<Response> => {
  const openai = getOpenAIClient()
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'nova',
    input: text,
    response_format: 'mp3',
  })
  return response
}

export const uploadFileForResponses = async (
  fileData: File,
  purpose: string = 'user_data'
): Promise<OpenAI.FileObject | null> => {
  const openai = getOpenAIClient()
  try {
    const file = await openai.files.create({
      file: fileData,
      purpose: purpose,
    })
    return file
  } catch (error) {
    console.error('Error uploading file to OpenAI:', error)
    return null
  }
}
