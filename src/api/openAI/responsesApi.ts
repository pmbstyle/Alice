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

interface MCPToolConfig {
  type: 'mcp'
  server_label: string
  server_url: string
  require_approval?:
    | 'never'
    | 'always'
    | { never?: { tool_names?: string[] }; always?: { tool_names?: string[] } }
  allowed_tools?: string[]
  headers?: Record<string, string>
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
        finalToolsForApi.push({
          type: 'function',
          name: toolDefinition.name,
          description: toolDefinition.description,
          parameters: toolDefinition.parameters,
        } as OpenAIResponsesApiFunctionTool)
      } else {
        console.warn(
          `Tool definition for '${toolNameFromSettings}' not found in PREDEFINED_OPENAI_TOOLS.`
        )
      }
    }
  }

  if (
    settings.mcpServersConfig &&
    settings.mcpServersConfig.trim() !== '[]' &&
    settings.mcpServersConfig.trim() !== ''
  ) {
    try {
      const mcpServerDefinitions = JSON.parse(settings.mcpServersConfig)
      if (Array.isArray(mcpServerDefinitions)) {
        mcpServerDefinitions.forEach(mcpTool => {
          if (
            mcpTool.type === 'mcp' &&
            mcpTool.server_label &&
            mcpTool.server_url
          ) {
            finalToolsForApi.push(mcpTool as any)
          } else {
            console.warn('Invalid MCP tool definition skipped:', mcpTool)
          }
        })
      } else {
        console.warn('MCP servers config is not an array, skipping.')
      }
    } catch (e) {
      console.error('Failed to parse MCP servers config JSON:', e)
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

  //console.log('[REQUEST PARAMS]', JSON.stringify(params, null, 2)) // dev debugging

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
