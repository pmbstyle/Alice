import OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'

interface LocalOpenAIModel {
  id: string
  object: string
  created: number
  owned_by: string
}

interface LocalOpenAIAssistantTool {
  type: 'code_interpreter' | 'file_search' | 'function'
  function?: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

interface LocalOpenAIAssistant {
  id: string
  object: 'assistant'
  created_at: number
  name: string | null
  description: string | null
  model: string
  instructions: string | null
  tools: LocalOpenAIAssistantTool[]
  metadata: Record<string, string> | null
  top_p: number | null
  temperature: number | null
}

interface LocalOpenAIAssistantsPage {
  object: 'list'
  data: LocalOpenAIAssistant[]
  first_id: string | null
  last_id: string | null
  has_more: boolean
}

interface LocalOpenAIAssistantDeleted {
  id: string
  object: 'assistant.deleted'
  deleted: boolean
}

interface LocalOpenAIThread {
  id: string
  object: 'thread'
  created_at: number
  metadata: Record<string, string> | null
}

interface LocalOpenAIMessageContentText {
  type: 'text'
  text: {
    value: string
    annotations: any[]
  }
}

interface LocalOpenAIMessageContentImageFile {
  type: 'image_file'
  image_file: {
    file_id: string
  }
}

type LocalOpenAIMessageContent =
  | LocalOpenAIMessageContentText
  | LocalOpenAIMessageContentImageFile

interface LocalOpenAIThreadMessage {
  id: string
  object: 'thread.message'
  created_at: number
  thread_id: string
  status: 'in_progress' | 'incomplete' | 'completed'
  role: 'user' | 'assistant'
  content: LocalOpenAIMessageContent[]
  assistant_id: string | null
  run_id: string | null
  metadata: Record<string, string> | null
}

interface LocalOpenAIThreadMessagesPage {
  object: 'list'
  data: LocalOpenAIThreadMessage[]
  first_id: string | null
  last_id: string | null
  has_more: boolean
}

interface LocalOpenAIFileObject {
  id: string
  object: 'file'
  bytes: number
  created_at: number
  filename: string
  purpose: string
}

export interface LocalAssistantCreateParams {
  model: string
  name?: string | null
  description?: string | null
  instructions?: string | null
  tools?: LocalOpenAIAssistantTool[]
  metadata?: Record<string, string> | null
  temperature?: number | null
  top_p?: number | null
}

export interface LocalAssistantUpdateParams {
  model?: string
  name?: string | null
  description?: string | null
  instructions?: string | null
  tools?: LocalOpenAIAssistantTool[]
  metadata?: Record<string, string> | null
  temperature?: number | null
  top_p?: number | null
}

const getOpenAIClient = (): OpenAI => {
  const settings = useSettingsStore().config
  if (!settings.VITE_OPENAI_API_KEY) {
    console.error('OpenAI API Key is not configured.')
  }
  return new OpenAI({
    organization: settings.VITE_OPENAI_ORGANIZATION,
    project: settings.VITE_OPENAI_PROJECT,
    apiKey: settings.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  })
}

export const getAssistantData = async (): Promise<LocalOpenAIAssistant> => {
  const openai = getOpenAIClient()
  const assistantId = useSettingsStore().config.VITE_OPENAI_ASSISTANT_ID
  if (!assistantId) throw new Error('OpenAI Assistant ID not configured.')
  return (await openai.beta.assistants.retrieve(
    assistantId
  )) as LocalOpenAIAssistant
}

export const createThread = async (): Promise<string> => {
  const openai = getOpenAIClient()
  const thread = await openai.beta.threads.create()
  return thread.id
}

export const getThread = async (
  threadId: string
): Promise<LocalOpenAIThread> => {
  const openai = getOpenAIClient()
  return (await openai.beta.threads.retrieve(threadId)) as LocalOpenAIThread
}

export const listMessages = async (
  threadId: string,
  last = false
): Promise<LocalOpenAIThreadMessage[]> => {
  const openai = getOpenAIClient()
  const messagesPage = (await openai.beta.threads.messages.list(
    threadId
  )) as LocalOpenAIThreadMessagesPage
  if (last && messagesPage.data.length > 0) {
    const latestMessage = messagesPage.data[0]
    const messageContentForIndex = {
      id: latestMessage.id,
      role: latestMessage.role,
      content: latestMessage.content,
    }
    await indexMessage(threadId, latestMessage.role, messageContentForIndex)
  }
  return messagesPage.data
}

export const sendMessage = async (
  threadId: string,
  message: OpenAI.Beta.Threads.Messages.MessageCreateParams,
  assistantId: string,
  store = true
): Promise<LocalOpenAIThreadMessage> => {
  const openai = getOpenAIClient()
  const response = (await openai.beta.threads.messages.create(
    threadId,
    message
  )) as LocalOpenAIThreadMessage
  if (store) {
    await indexMessage(threadId, message.role, response)
  }
  return response
}

export const uploadScreenshot = async (dataURI: string): Promise<string> => {
  const openai = getOpenAIClient()
  const base64Data = dataURI.split(',')[1]
  const binaryData = atob(base64Data)
  const arrayBuffer = new ArrayBuffer(binaryData.length)
  const view = new Uint8Array(arrayBuffer)
  for (let i = 0; i < binaryData.length; i++) {
    view[i] = binaryData.charCodeAt(i)
  }
  const blob = new Blob([arrayBuffer], { type: 'image/png' })
  const file = new File([blob], 'screenshot.png', { type: 'image/png' })
  const response = (await openai.files.create({
    file,
    purpose: 'vision',
  })) as LocalOpenAIFileObject
  return response.id
}

export const runAssistant = async (
  threadId: string,
  assistantId: string,
  thoughtsString: string = ''
): Promise<
  OpenAI.Beta.AssistantStreamManager<OpenAI.Beta.AssistantStreamEvent>
> => {
  const openai = getOpenAIClient()

  let thoughtsInstructionPart =
    'No relevant thoughts from past conversation found for this query.'
  if (thoughtsString && thoughtsString.trim() !== '') {
    thoughtsInstructionPart = `Relevant thoughts from past conversation (use these to inform your answer if applicable):\n${thoughtsString}`
  }

  const runParams: OpenAI.Beta.Threads.Runs.RunCreateParams = {
    assistant_id: assistantId,
    additional_instructions: `Current datetime: ${new Date().toLocaleString()}. ${thoughtsInstructionPart}`,
  }
  console.log('Running assistant with params:', runParams)
  return openai.beta.threads.runs.stream(threadId, runParams)
}

export const submitToolOutputs = async (
  threadId: string,
  runId: string,
  toolOutputs: OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput[]
): Promise<
  OpenAI.Beta.AssistantStreamManager<OpenAI.Beta.AssistantStreamEvent>
> => {
  const openai = getOpenAIClient()
  try {
    return openai.beta.threads.runs.submitToolOutputsStream(threadId, runId, {
      tool_outputs: toolOutputs,
    })
  } catch (error) {
    console.error('Error submitting tool outputs:', error)
    throw error
  }
}

const embedText = async (textInput: any): Promise<number[]> => {
  let textToEmbed = ''
  const openai = getOpenAIClient()

  if (typeof textInput === 'string') {
    textToEmbed = textInput
  } else if (textInput && Array.isArray(textInput.content)) {
    const textParts = textInput.content
      .filter(
        (
          item: LocalOpenAIMessageContent
        ): item is LocalOpenAIMessageContentText => item.type === 'text'
      )
      .map(
        (item: LocalOpenAIMessageContentText) =>
          item.text?.value || JSON.stringify(item.text)
      )
    textToEmbed = textParts.join(' ')
    if (
      textInput.content.some(
        (item: LocalOpenAIMessageContent) => item.type === 'image_file'
      )
    ) {
      textToEmbed += ' [This message includes an image]'
    }
  } else if (
    textInput &&
    textInput.content &&
    typeof textInput.content === 'string'
  ) {
    textToEmbed = textInput.content
  } else {
    textToEmbed = JSON.stringify(textInput)
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: textToEmbed,
      encoding_format: 'float',
    })
    return response.data[0].embedding
  } catch (error) {
    console.error('Error creating embedding:', error)
    throw error
  }
}

const indexMessage = async (
  conversationId: string,
  role: string,
  message: LocalOpenAIThreadMessage | { role: string; content: any }
): Promise<void> => {
  const embedding = await embedText(message)

  let textContentForMetadata = 'No textual content'
  if (message.content && Array.isArray(message.content)) {
    const firstTextPart = message.content.find(
      (item): item is LocalOpenAIMessageContentText => item.type === 'text'
    )
    if (firstTextPart && firstTextPart.text) {
      textContentForMetadata = firstTextPart.text.value
    }
  } else if (typeof message.content === 'string') {
    textContentForMetadata = message.content
  }

  try {
    const result = await window.ipcRenderer.invoke('thoughtVector:add', {
      conversationId,
      role,
      textContent: textContentForMetadata,
      embedding,
    })
    if (result.success) {
      console.log(
        `[OpenAI/assistant] Indexed thought to local vector store for conversation ${conversationId}, role ${role}.`
      )
    } else {
      console.error(
        '[OpenAI/assistant] Failed to save thought to local vector store:',
        result.error
      )
    }
  } catch (error) {
    console.error(
      '[OpenAI/assistant] Error invoking thoughtVector:add IPC:',
      error
    )
  }
}

export const retrieveRelevantThoughts = async (
  content: string,
  topK = 3
): Promise<string[]> => {
  const queryEmbedding = await embedText(content)

  try {
    const ipcResult = await window.ipcRenderer.invoke('thoughtVector:search', {
      queryEmbedding,
      topK,
    })

    if (ipcResult.success && Array.isArray(ipcResult.data)) {
      return ipcResult.data as string[]
    } else {
      console.error(
        '[ASSISTANT.TS retrieveRelevantThoughts] Failed to retrieve thoughts from local vector store or data format incorrect:',
        ipcResult.error
      )
      return []
    }
  } catch (error) {
    console.error(
      '[ASSISTANT.TS retrieveRelevantThoughts] Error during IPC call for vector search:',
      error
    )
    return []
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

export const listAssistantsAPI = async (params?: {
  limit?: number
  order?: 'asc' | 'desc'
  after?: string
  before?: string
}): Promise<LocalOpenAIAssistantsPage> => {
  const openai = getOpenAIClient()
  return (await openai.beta.assistants.list(
    params
  )) as LocalOpenAIAssistantsPage
}

export const createAssistantAPI = async (
  params: LocalAssistantCreateParams
): Promise<LocalOpenAIAssistant> => {
  const openai = getOpenAIClient()
  return (await openai.beta.assistants.create(
    params as OpenAI.Beta.Assistants.AssistantCreateParams
  )) as LocalOpenAIAssistant
}

export const retrieveAssistantAPI = async (
  assistantId: string
): Promise<LocalOpenAIAssistant> => {
  const openai = getOpenAIClient()
  return (await openai.beta.assistants.retrieve(
    assistantId
  )) as LocalOpenAIAssistant
}

export const updateAssistantAPI = async (
  assistantId: string,
  params: LocalAssistantUpdateParams
): Promise<LocalOpenAIAssistant> => {
  const openai = getOpenAIClient()
  return (await openai.beta.assistants.update(
    assistantId,
    params as OpenAI.Beta.Assistants.AssistantUpdateParams
  )) as LocalOpenAIAssistant
}

export const deleteAssistantAPI = async (
  assistantId: string
): Promise<LocalOpenAIAssistantDeleted> => {
  const openai = getOpenAIClient()
  return (await openai.beta.assistants.del(
    assistantId
  )) as LocalOpenAIAssistantDeleted
}

export const listModelsAPI = async (): Promise<LocalOpenAIModel[]> => {
  const openai = getOpenAIClient()
  const modelsPage = await openai.models.list()
  return modelsPage.data as LocalOpenAIModel[]
}
