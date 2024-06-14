import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
    getAssistantData,
    createThread,
    getThread,
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
        assistant.value = data
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

    const sendMessageToThread = async (message: any) => {
        await sendMessage(thread.value, message)
        getMessages(thread.value)
    }

    const chat = async (memories) => {
        const id = await runAssistant(thread.value, assistant.value.id, memories)
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

    const createOpenAIPrompt = async (newMessage: string) => {
        const relevantMemories = await retrieveRelevantMemories(newMessage)
        const memoryMessages = relevantMemories.map(memory => ({ role: 'assistant', content: memory }))
        const userMessage = { role: 'user', content: newMessage }
        return {
            message: userMessage,
            history: memoryMessages
        }
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
        createOpenAIPrompt
    }
})
