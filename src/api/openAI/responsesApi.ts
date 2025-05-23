import OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  PREDEFINED_OPENAI_TOOLS,
  type ApiRequestBodyFunctionTool,
} from '../../utils/assistantTools'

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
  input: OpenAI.Responses.Request.InputItemLike[],
  previousResponseId: string | null,
  stream: boolean = false
): Promise<
  OpenAI.Responses.Response | AsyncIterable<OpenAI.Responses.StreamEvent>
> => {
  const openai = getOpenAIClient()
  const settings = useSettingsStore().config

  const activeTools: ApiRequestBodyFunctionTool[] = []
  if (settings.assistantTools && settings.assistantTools.length > 0) {
    for (const toolNameFromSettings of settings.assistantTools) {
      const toolDefinition = PREDEFINED_OPENAI_TOOLS.find(
        tool => tool.name === toolNameFromSettings
      )

      if (toolDefinition) {
        activeTools.push(toolDefinition)
      } else {
        console.warn(
          `Tool definition for '${toolNameFromSettings}' not found in PREDEFINED_OPENAI_TOOLS.`
        )
      }
    }
  }

  const params: OpenAI.Responses.Request = {
    model: settings.assistantModel || 'gpt-4.1-mini',
    input: input,
    instructions: settings.assistantSystemPrompt || undefined,
    temperature: settings.assistantTemperature ?? 1.0,
    top_p: settings.assistantTopP ?? 1.0,
    tools: activeTools.length > 0 ? activeTools : undefined,
    previous_response_id: previousResponseId || undefined,
    stream: stream,
    store: true,
    truncation: 'auto',
  }

  console.log(
    'Creating OpenAI Response with params (tools section shown if any):',
    JSON.stringify({ model: params.model, tools: params.tools }, null, 2)
  )

  if (stream) {
    return openai.responses.create(params as OpenAI.Responses.StreamableRequest)
  } else {
    return openai.responses.create(
      params as OpenAI.Responses.NonStreamableRequest
    )
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
