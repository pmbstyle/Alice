import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import {
    getAssistantData,
    createThread,
    visionMessage,
    listMessages,
    sendMessage,
    runAssistant,
    checkingStatus,
    retrieveRelevantMemories
} from '../api/openAI/assistant'
import { tts } from '../api/openAI/tts'
import { transcribeAudio } from '../api/openAI/stt'
import { useGeneralStore } from './generalStore'

export const useConversationStore = defineStore('conversation', () => {

    const { messages } = storeToRefs(useGeneralStore())

    const assistant = ref<any>()
    getAssistantData().then((data) => {
        assistant.value = data.id
    })

    const thread = ref<any>()

    const createNewThread = async () => {
        thread.value = await createThread()
    }

    const getMessages = async (threadId: string, last: boolean = false) => {
        messages.value = await listMessages(threadId, last)
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
                    await getMessages(thread.value, true)
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
