import OpenAI from 'openai'
import { setIndex, getRelatedMessages } from '../pinecone/pinecone'

export const openai = new OpenAI({
  organization: import.meta.env.VITE_OPENAI_ORGANIZATION,
  project: import.meta.env.VITE_OPENAI_PROJECT,
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
})

export const getAssistantData = async () => {
  return await openai.beta.assistants.retrieve(
    import.meta.env.VITE_OPENAI_ASSISTANT_ID
  )
}

export const createThread = async () => {
  const thread = await openai.beta.threads.create()
  return thread.id
}

export const getThread = async (threadId: string) => {
  const thread = await openai.beta.threads.retrieve(threadId)
  return thread
}

export const listMessages = async (threadId: string, last: boolean = false) => {
  const messages = await openai.beta.threads.messages.list(threadId)
  if (last)
    await indexMessage(threadId, messages.data[0].role, messages.data[0])
  return messages.data
}

export const sendMessage = async (
  threadId: string,
  message: any,
  assistant: string,
  store: boolean = true
) => {
  const response = await openai.beta.threads.messages.create(threadId, message)
  response.assistant_id = assistant
  if (store) await indexMessage(threadId, message.role, response)
  return response
}

export const uploadScreenshot = async (dataURI: string) => {
  const base64Data = dataURI.split(',')[1]

  const binaryData = atob(base64Data)

  const arrayBuffer = new ArrayBuffer(binaryData.length)
  const view = new Uint8Array(arrayBuffer)
  for (let i = 0; i < binaryData.length; i++) {
    view[i] = binaryData.charCodeAt(i)
  }

  const blob = new Blob([arrayBuffer], { type: 'image/png' })

  const file = new File([blob], 'screenshot.png', { type: 'image/png' })

  const response = await openai.files.create({
    file,
    purpose: 'vision',
  })

  return response.id
}

export const runAssistant = async (
  threadId: string,
  assistantId: string,
  history: any = []
) => {
  let h = JSON.stringify(history)
  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
    stream: true,
    temperature: 0.5,
    additional_instructions:
      `Current datetime: ${new Date().toLocaleString()}. Thoughts related to user question: ${h}.`,
  })
  return run
}

export const submitToolOutputs = async (
  threadId: string,
  runId: string,
  toolOutputs: any[]
) => {
  try {
    return openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
      tool_outputs: toolOutputs,
      stream: true,
    })
  } catch (error) {
    console.error('Error submitting tool outputs:', error)
    throw error
  }
}

const embedText = async (text: any) => {
  let textToEmbed = ''

  if (typeof text === 'string') {
    textToEmbed = text
  } else if (Array.isArray(text.content)) {
    const textParts = text.content
      .filter(item => item.type === 'text')
      .map(item =>
        typeof item.text === 'string'
          ? item.text
          : item.text.value || JSON.stringify(item.text)
      )

    textToEmbed = textParts.join(' ')

    if (text.content.some(item => item.type === 'image_url')) {
      textToEmbed += ' [This message includes an image]'
    }
  } else {
    textToEmbed = JSON.stringify(text)
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
  content: any
) => {
  const embedding = await embedText(content)
  await setIndex(conversationId, role, content, embedding)
}

export const retrieveRelevantMemories = async (content: string, topK = 5) => {
  let embedding = await embedText(content)
  const results = await getRelatedMessages(topK, embedding)
  return results
}

export const ttsStream = async (text: string) => {
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'nova',
    input: text,
    response_format: 'mp3',
  })
  return response
}
