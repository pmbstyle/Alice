import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
    getAssistantData,
    createThread,
    visionMessage,
    listMessages,
    sendMessage,
    runAssistant,
    checkingStatus,
    retrieveRelevantMemories
} from '../api/assistant'
import { tts } from '../api/tts'
import { transcribeAudio } from '../api/stt'

export const useConversationStore = defineStore('conversation', () => {
    const assistant = ref<any>()
    getAssistantData().then((data) => {
        assistant.value = data.id
    })

    const thread = ref<any>()
    const message = ref<any>()
    const messages = ref<any>([])

    const createNewThread = async () => {
        thread.value = await createThread()
    }

    const getMessages = async (threadId: string) => {
        messages.value = await listMessages(threadId)
    }

    const sendMessageToThread = async (message: any, store: boolean = true) => {
        await sendMessage(thread.value, message, assistant.value, store)
        getMessages(thread.value)
    }

    const chat = async (memories: any) => {
        const id = await runAssistant(thread.value, assistant.value, memories)
        return new Promise((resolve, reject) => {
            let pollingInterval = setInterval(async () => {
                const status = await checkingStatus(thread.value, id)
                if (status) {
                    clearInterval(pollingInterval)
                    await getMessages(thread.value)
                    let audio = await ttsMessage(messages.value[0].content[0].text.value)
                    resolve(audio)
                }
            }, 500)
        })
    }

    const ttsMessage = async (message: string) => {
        const response = await tts(message)
        if (!response.ok) {
            throw new Error('Network response was not ok')
        }
        const arrayBuffer = await response.arrayBuffer()
        return arrayBuffer
    }

    const transcribeAudioMessage = async (audioBuffer: Buffer) => {
        const response = await transcribeAudio(audioBuffer)
        return response
    }

    const createOpenAIPrompt = async (newMessage: string, store: boolean = true) => {
        let memoryMessages: any[] = []
        if (store) {
            const relevantMemories = await retrieveRelevantMemories(newMessage)
            memoryMessages = relevantMemories.map(memory => ({ role: 'assistant', content: memory }))
        }
        let userMessage = { role: 'user', content: newMessage }
        return {
            message: userMessage,
            history: memoryMessages
        }
    }

    const describeImage = async (image: string) => {
        const response = await visionMessage(image)
        return response
    }

    return {
        assistant,
        messages,
        message,
        thread,
        createNewThread,
        getMessages,
        sendMessageToThread,
        chat,
        transcribeAudioMessage,
        createOpenAIPrompt,
        describeImage
    }
})
