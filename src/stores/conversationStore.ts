import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
    getAssistantData,
    createThread,
    getThread,
    listMessages,
    sendMessage,
    deleteMessage,
    runAssistant,
    checkingStatus
 } from '../api/assistant.ts'

import { tts } from '../api/tts.ts'

export const useConversationStore = defineStore('conversation', () => {
    
    const assistant = ref<any>(getAssistantData())

    const thread = ref<any>()

    const message = ref<any>({})
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

    const deleteMessageFromThread = async (messageId: string) => {
        await deleteMessage(thread.value, messageId)
        getMessages(thread.value)
    }

    const chat = async () => {
        const id = await runAssistant(thread.value, assistant.value.id)
        return new Promise((resolve, reject) => {
            let pollingInterval = setInterval(async () => {
                const status = await checkingStatus(thread.value, id)
                if (status) {
                    console.log('status', status)
                    clearInterval(pollingInterval)
                    await getMessages(thread.value)
                    let audio = await ttsMessage(messages.value[0].content[0].text.value)
                    resolve(audio)
                }
            }, 500)
        })
    }

    const ttsMessage = async (message:string) => {
        const response = await tts(message)
        if (!response.ok) {
            throw new Error('Network response was not ok')
        }
        const arrayBuffer = await response.arrayBuffer()
    
        return arrayBuffer
    }

    return {
        assistant,
        messages,
        message,
        thread,
        createNewThread,
        getMessages,
        sendMessageToThread,
        deleteMessageFromThread,
        chat
    }
})