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
  partial_images?: number
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
  | MCPToolConfig

export const getOpenAIClient = (): OpenAI => {
  const settings = useSettingsStore().config
  if (!settings.VITE_OPENAI_API_KEY) {
    console.error('OpenAI API Key is not configured.')
    throw new Error('OpenAI API Key is not configured.')
  }
  return new OpenAI({
    apiKey: settings.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
    timeout: 20 * 1000,
    maxRetries: 1,
  })
}

export const createOpenAIResponse = async (
  input: OpenAI.Responses.Request.InputItemLike[],
  previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
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
            finalToolsForApi.push(mcpTool as MCPToolConfig)
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
    partial_images: 2,
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
    tools:
      finalToolsForApi.length > 0 ? (finalToolsForApi as any[]) : undefined,
    previous_response_id: previousResponseId || undefined,
    stream: stream,
    store: true,
    truncation: 'auto',
  }

  const requestOptions: OpenAI.RequestOptions = {}
  if (signal) {
    requestOptions.signal = signal
  }

  if (stream) {
    return openai.responses.create(params as any, requestOptions)
  } else {
    return openai.responses.create(params as any, requestOptions)
  }
}

export const ttsStream = async (
  text: string,
  signal: AbortSignal
): Promise<Response> => {
  const openai = getOpenAIClient()
  const response = await openai.audio.speech.create(
    {
      model: 'tts-1',
      voice: 'nova',
      input: text,
      response_format: 'mp3',
    },
    { signal }
  )
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
      purpose: purpose as OpenAI.FileCreateParams['purpose'],
    })
    return file
  } catch (error) {
    console.error('Error uploading file to OpenAI:', error)
    return null
  }
}

export const createSummarizationResponse = async (
  messagesToSummarize: { role: string; content: string }[],
  summarizationModel: string = 'gpt-4.1-nano',
  systemPrompt: string
): Promise<string | null> => {
  const openai = getOpenAIClient()

  const combinedTextForSummarization = messagesToSummarize
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n\n')

  const summarizationApiInput: OpenAI.Responses.Request.InputItemLike[] = [
    {
      role: 'user',
      content: [{ type: 'input_text', text: combinedTextForSummarization }],
    },
  ]

  const params: OpenAI.Responses.ResponseCreateParams = {
    model: summarizationModel,
    input: summarizationApiInput,
    instructions: systemPrompt,
    temperature: 0.5,
    top_p: 1.0,
    stream: false,
    store: false,
  }

  try {
    const response = await openai.responses.create(params as any)

    if (
      response.output &&
      Array.isArray(response.output) &&
      response.output.length > 0
    ) {
      const messageOutput = response.output.find(
        (item: any) => item.type === 'message' && item.role === 'assistant'
      )
      if (
        messageOutput &&
        messageOutput.content &&
        Array.isArray(messageOutput.content) &&
        messageOutput.content.length > 0
      ) {
        const textPart = messageOutput.content.find(
          (part: any) => part.type === 'output_text'
        )
        if (textPart && textPart.text) {
          return textPart.text.trim()
        }
      }
    }
    console.error('Summarization response format unexpected:', response)
    return null
  } catch (error) {
    console.error('Error creating summarization response with OpenAI:', error)
    return null
  }
}

export const createContextAnalysisResponse = async (
  messagesToAnalyze: { role: string; content: string }[],
  analysisModel: string = 'gpt-4.1-nano'
): Promise<string | null> => {
  const openai = getOpenAIClient()

  const analysisSystemPrompt = `You are an expert in emotional intelligence. Analyze the tone and emotional state of the 'user' in the following conversation transcript. Provide a single, concise sentence describing their likely emotional state. Do not add any extra commentary. Examples: "User seems curious and engaged.", "User sounds stressed and is looking for reassurance."`

  const combinedTextForAnalysis = messagesToAnalyze
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n\n')

  const analysisApiInput: OpenAI.Responses.Request.InputItemLike[] = [
    {
      role: 'user',
      content: [{ type: 'input_text', text: combinedTextForAnalysis }],
    },
  ]

  const params: OpenAI.Responses.ResponseCreateParams = {
    model: analysisModel,
    input: analysisApiInput,
    instructions: analysisSystemPrompt,
    temperature: 0.3,
    top_p: 1.0,
    stream: false,
    store: false,
  }

  try {
    const response = await openai.responses.create(params as any)
    if (
      response.output &&
      Array.isArray(response.output) &&
      response.output.length > 0
    ) {
      const messageOutput = response.output.find(
        (item: any) => item.type === 'message' && item.role === 'assistant'
      )
      if (
        messageOutput &&
        messageOutput.content &&
        Array.isArray(messageOutput.content) &&
        messageOutput.content.length > 0
      ) {
        const textPart = messageOutput.content.find(
          (part: any) => part.type === 'output_text'
        )
        if (textPart && textPart.text) {
          return textPart.text.trim().replace(/"/g, '')
        }
      }
    }
    return null
  } catch (error) {
    console.error('Error creating context analysis response:', error)
    return null
  }
}
