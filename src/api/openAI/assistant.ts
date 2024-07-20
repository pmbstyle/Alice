import OpenAI from 'openai'
import { setIndex, getRelatedMessages } from '../pinecone/pinecone'

const openai = new OpenAI({
    organization: import.meta.env.VITE_OPENAI_ORGANIZATION,
    project: import.meta.env.VITE_OPENAI_PROJECT,
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
})

export const getAssistantData = async () => {
    return await openai.beta.assistants.retrieve(import.meta.env.VITE_OPENAI_ASSISTANT_ID)
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
    if(last) await indexMessage(threadId, messages.data[0].role, messages.data[0])
    return messages.data
}

export const sendMessage = async (threadId: string, message: any, assistant: string, store: boolean = true) => {
    const response = await openai.beta.threads.messages.create(threadId, message)
    response.assistant_id = assistant
    if (store) await indexMessage(threadId, message.role, response)
    return response
}

export const visionMessage = async (image: any) => {
    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe what is in this screenshot" },
              {
                type: "image_url",
                image_url: {
                  "url": image,
                  "detail": "high"
                },
              },
            ],
          },
        ],
      })
      return response.choices[0].message.content
}

export const runAssistant = async (threadId: string, assistantId: string, history: any = []) => {
    let h = JSON.stringify(history)
    const run = await openai.beta.threads.runs.create(threadId,
        {
            assistant_id: assistantId,
            stream: false,
            temperature: 0.5,
            additional_instructions:'Memories related to user question: '+h
        }
    )
    return run.id
}

export const checkingStatus = async (threadId: string, runId: string) => {
    const runObject = await openai.beta.threads.runs.retrieve(threadId, runId)
    const status = runObject.status
    return status == 'completed'
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
