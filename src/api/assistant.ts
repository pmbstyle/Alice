import OpenAI from 'openai'

const openai = new OpenAI({
    organization: "org-dxUPPlh6v3IBU1vruTWgEH0R",
    project: "proj_tQ4lbY7lC5J9IYOK2UI7t76h",
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
})
export const getAssistantData = async () => {
    return await openai.beta.assistants.retrieve(import.meta.env.VITE_ASSISTANT_ID)
}
export const assistantList = async () => {
    const assistantList = await openai.beta.assistants.list()
    console.log(assistantList)
}

export const createThread = async () => {
    const thread = await openai.beta.threads.create()
    return thread.id
}

export const getThread = async (threadId: string) => {
    const thread = await openai.beta.threads.retrieve(threadId)
    return thread
}

export const listMessages = async (threadId: string) => {
    const messages = await openai.beta.threads.messages.list(threadId)
    return messages.data
}

export const sendMessage = async (threadId: string, message: any) => {
    const response = await openai.beta.threads.messages.create(threadId, message)
    return response
}

export const runAssistant = async (threadId: string, assistantId: string) => {
    const run = await openai.beta.threads.runs.create(threadId,
        {
            assistant_id: assistantId,
            stream: false,
            temperature: 0.5,
        }
    )
    return run.id
}

export const checkingStatus = async (threadId: string, runId: string) => {
    const runObject = await openai.beta.threads.runs.retrieve(
        threadId,
        runId
    )

    const status = runObject.status
    console.log('Current status: ' + status)
    
    return status == 'completed'
}