import OpenAI from 'openai'
import { setIndex, getRelatedMessages } from '../pinecone/pinecone'
import { aliceSystemPrompt } from '../../prompts/alice-system'

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY
})

export const getAssistantData = async (messages:any) => {
  const data = {
    system: aliceSystemPrompt,
    messages: [],
    memory: []
  }
  const completion = await openai.chat.completions.create({
    model: "openai/o1-mini-2024-09-12",
    messages: [
      { role: "user", content: "Say this is a test" }
    ],
  })

  console.log(completion.choices[0].message)
}

export const listMessages = async (threadId: string, last: boolean = false) => {
  const messages = await openai.beta.threads.messages.list(threadId)
  if(last) await indexMessage(threadId, messages.data[0].role, messages.data[0])
  return messages.data
}

export const sendMessage = async (threadId: string, message: any, assistant: string, store: boolean = true) => {
  const response = await openai.beta.threads.messages.create(threadId, message)
  response.assistant_id = assistant
  if (store) await indexMessage(threadId, message.role, response)
  return response
}

const embedText = async (text: any) => {
  text = JSON.stringify(text)
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
      encoding_format: "float"
    })
    return response.data[0].embedding
  } catch (error) {
    console.error('Error creating embedding:', error)
    throw error
  }
}

const indexMessage = async (conversationId: string, role: string, content: any) => {
  const embedding = await embedText(content)
  await setIndex(conversationId, role, content, embedding)
}

export const retrieveRelevantMemories = async (content: string, topK = 5) => {
  let embedding = await embedText(content)
  const results = await getRelatedMessages(topK, embedding)
  return results
}