import OpenAI from 'openai'
import { toFile, type FileLike } from 'openai/uploads'
import { useSettingsStore } from '../stores/settingsStore'
import { getOpenAIClient, getGroqClient } from './apiClients'
import type { AppChatMessageContentPart } from '../stores/conversationStore'
import {
  PREDEFINED_OPENAI_TOOLS,
  type ApiRequestBodyFunctionTool,
} from '../utils/assistantTools'

/* 
API Function Exports
*/

export const fetchOpenAIModels = async (): Promise<OpenAI.Models.Model[]> => {
  const openai = getOpenAIClient()
  const modelsPage = await openai.models.list()
  return modelsPage.data
    .filter(model => {
      const id = model.id

      const isSupportedPrefix =
        id.startsWith('gpt-4') ||
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
        id == 'gpt-4'

      return isSupportedPrefix && !isExcluded
    })
    .sort((a, b) => a.id.localeCompare(b.id))
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

  const finalToolsForApi: any[] = []

  if (settings.assistantTools && settings.assistantTools.length > 0) {
    for (const toolName of settings.assistantTools) {
      const toolDefinition = PREDEFINED_OPENAI_TOOLS.find(
        (tool: ApiRequestBodyFunctionTool) => tool.name === toolName
      )
      if (toolDefinition) {
        finalToolsForApi.push({
          type: 'function',
          name: toolDefinition.name,
          description: toolDefinition.description,
          parameters: toolDefinition.parameters,
        })
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
            finalToolsForApi.push(mcpTool)
          }
        })
      }
    } catch (e) {
      console.error('Failed to parse MCP servers config JSON:', e)
    }
  }

  const modelName = settings.assistantModel || ''
  const isOModel = modelName.startsWith('o')

  if (!isOModel) {
    finalToolsForApi.push({ type: 'image_generation', partial_images: 2 })
    finalToolsForApi.push({ type: 'web_search_preview' })
  } else {
    if (modelName.includes('o3-pro') && modelName === 'o3') {
      finalToolsForApi.push({ type: 'image_generation', partial_images: 2 })
      finalToolsForApi.push({ type: 'web_search_preview' })
    }
  }

  const params: OpenAI.Responses.ResponseCreateParams = {
    model: settings.assistantModel || 'gpt-4.1-mini',
    input: input,
    instructions: customInstructions || settings.assistantSystemPrompt,
    ...(isOModel
      ? {}
      : {
          temperature: settings.assistantTemperature,
          top_p: settings.assistantTopP,
        }),
    tools: finalToolsForApi.length > 0 ? finalToolsForApi : undefined,
    previous_response_id: previousResponseId || undefined,
    stream: stream,
    store: true,
    truncation: 'auto',
  }

  return openai.responses.create(params as any, { signal })
}

export const ttsStream = async (
  text: string,
  signal: AbortSignal
): Promise<Response> => {
  const openai = getOpenAIClient()
  const settings = useSettingsStore().config
  return openai.audio.speech.create(
    {
      model: 'tts-1',
      voice: settings.ttsVoice || 'nova',
      input: text,
      response_format: 'mp3',
    },
    { signal }
  )
}

export const transcribeWithGroq = async (
  audioBuffer: ArrayBuffer
): Promise<string> => {
  const groq = getGroqClient()
  const file: FileLike = await toFile(audioBuffer, 'audio.wav', {
    type: 'audio/wav',
  })
  const transcription = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    response_format: 'json',
  })
  return transcription?.text || ''
}

export const transcribeWithOpenAI = async (
  audioBuffer: ArrayBuffer
): Promise<string> => {
  const openai = getOpenAIClient()
  const file: FileLike = await toFile(audioBuffer, 'audio.wav', {
    type: 'audio/wav',
  })
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'gpt-4o-transcribe',
    response_format: 'json',
  })
  return transcription?.text || ''
}

export const createEmbedding = async (textInput: any): Promise<number[]> => {
  const openai = getOpenAIClient()
  let textToEmbed = ''

  if (typeof textInput === 'string') {
    textToEmbed = textInput
  } else if (textInput && typeof textInput.content === 'string') {
    textToEmbed = textInput.content
  } else if (textInput && Array.isArray(textInput.content)) {
    const contentArray = textInput.content as AppChatMessageContentPart[]
    const textParts = contentArray
      .filter(item => item.type === 'app_text')
      .map(item => item.text || '')
    textToEmbed = textParts.join(' ')
  }

  if (!textToEmbed.trim()) return []

  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: textToEmbed,
    encoding_format: 'float',
  })
  return response.data[0]?.embedding || []
}

export const indexMessageForThoughts = async (
  conversationId: string,
  role: string,
  message: any
): Promise<void> => {
  const embedding = await createEmbedding(message)
  if (embedding.length === 0) return

  let textContentForMetadata = 'No textual content'
  if (message.content && Array.isArray(message.content)) {
    const firstTextPart = message.content.find(
      (item: any) => item.type === 'app_text'
    )
    if (firstTextPart) {
      textContentForMetadata = firstTextPart.text || ''
    }
  } else if (typeof message.content === 'string') {
    textContentForMetadata = message.content
  }

  await window.ipcRenderer.invoke('thoughtVector:add', {
    conversationId,
    role,
    textContent: textContentForMetadata,
    embedding,
  })
}

export const retrieveRelevantThoughtsForPrompt = async (
  content: string,
  topK = 3
): Promise<string[]> => {
  if (!content.trim()) return []
  const queryEmbedding = await createEmbedding(content)
  if (queryEmbedding.length === 0) return []

  const ipcResult = await window.ipcRenderer.invoke('thoughtVector:search', {
    queryEmbedding,
    topK,
  })
  return ipcResult.success && Array.isArray(ipcResult.data)
    ? ipcResult.data
    : []
}

export const createSummarizationResponse = async (
  messagesToSummarize: { role: string; content: string }[],
  summarizationModel: string,
  systemPrompt: string
): Promise<string | null> => {
  const openai = getOpenAIClient()
  const combinedText = messagesToSummarize
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n\n')

  const response = await openai.responses.create({
    model: summarizationModel,
    input: [
      { role: 'user', content: [{ type: 'input_text', text: combinedText }] },
    ],
    instructions: systemPrompt,
    stream: false,
    store: false,
  } as any)

  const textPart = response.output?.[0]?.content?.[0]
  if (textPart?.type === 'output_text') {
    return textPart.text.trim()
  }
  return null
}

export const createContextAnalysisResponse = async (
  messagesToAnalyze: { role: string; content: string }[],
  analysisModel: string
): Promise<string | null> => {
  const openai = getOpenAIClient()
  const analysisSystemPrompt = `You are an expert in emotional intelligence. Analyze the tone and emotional state of the 'user' in the following conversation transcript. Provide a single, concise sentence describing their likely emotional state. Do not add any extra commentary.`
  const combinedText = messagesToAnalyze
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n\n')

  const response = await openai.responses.create({
    model: analysisModel,
    input: [
      { role: 'user', content: [{ type: 'input_text', text: combinedText }] },
    ],
    instructions: analysisSystemPrompt,
    stream: false,
    store: false,
  } as any)

  const textPart = response.output?.[0]?.content?.[0]
  if (textPart?.type === 'output_text') {
    return textPart.text.trim().replace(/"/g, '')
  }
  return null
}

export const uploadFileToOpenAI = async (
  file: File
): Promise<string | null> => {
  try {
    const supportedTypes = [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (!supportedTypes.includes(file.type)) {
      console.error(
        `Unsupported file type: ${file.type}. Supported types: ${supportedTypes.join(', ')}`
      )
      return null
    }

    const maxSize = 32 * 1024 * 1024
    if (file.size > maxSize) {
      console.error(
        `File too large: ${file.size} bytes. Maximum allowed: ${maxSize} bytes (32MB)`
      )
      return null
    }

    const openai = getOpenAIClient()
    const fileUpload = await openai.files.create({
      file: file,
      purpose: 'user_data',
    })

    console.log(
      `File uploaded successfully: ${fileUpload.id} (${file.name}, ${file.type})`
    )
    return fileUpload.id
  } catch (error) {
    console.error('Error uploading file to OpenAI:', error)
    if (error instanceof Error && error.message.includes('purpose')) {
      try {
        console.log('Retrying with assistants purpose...')
        const openai = getOpenAIClient()
        const fileUpload = await openai.files.create({
          file: file,
          purpose: 'assistants',
        })
        console.log(
          `File uploaded successfully with assistants purpose: ${fileUpload.id}`
        )
        return fileUpload.id
      } catch (fallbackError) {
        console.error('Fallback upload also failed:', fallbackError)
        return null
      }
    }
    return null
  }
}
