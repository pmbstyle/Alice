import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import {
  getAssistantData,
  createThread,
  uploadScreenshot,
  listMessages,
  sendMessage,
  runAssistant,
  retrieveRelevantMemories,
  ttsStream,
  submitToolOutputs,
} from '../api/openAI/assistant'
import { transcribeAudio } from '../api/openAI/stt'
import { useGeneralStore } from './generalStore'
import { executeFunction } from '../utils/functionCaller'

export const useConversationStore = defineStore('conversation', () => {
  const {
    messages,
    chatHistory,
    statusMessage,
    updateVideo,
    isProcessingRequest,
    isTTSProcessing,
  } = storeToRefs(useGeneralStore())
  const generalStore = useGeneralStore()

  const assistant = ref<string>('')
  getAssistantData().then(data => {
    assistant.value = data.id
  })

  const thread = ref<string>('')

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
    statusMessage.value = 'Thinking...'
    updateVideo.value('PROCESSING')
    isProcessingRequest.value = true
    isTTSProcessing.value = true

    let currentSentence = ''
    let messageId: string | null = null

    async function processChunk(chunk) {
      if (
        (chunk.event === 'thread.message.created' ||
          chunk.event === 'thread.message.createddata') &&
        chunk.data.assistant_id === assistant.value
      ) {
        messageId = chunk.data.id
        if (messageId) {
          chatHistory.value.unshift({
            id: messageId,
            role: 'assistant',
            content: [{ type: 'text', text: { value: '', annotations: [] } }],
          })
        }
      }

      if (
        (chunk.event === 'thread.message.delta' ||
          chunk.event === 'thread.message.deltadata') &&
        chunk.data.delta?.content?.[0]?.type === 'text'
      ) {
        const textChunk = chunk.data.delta?.content[0].text.value
        currentSentence += textChunk

        if (messageId) {
          const existingMessageIndex = chatHistory.value.findIndex(
            m => m.id === messageId
          )
          if (existingMessageIndex > -1) {
            chatHistory.value[existingMessageIndex].content[0].text.value +=
              textChunk
          }
        }

        if (textChunk.match(/[.!?]\s*$/)) {
          const audioResponse = await ttsStream(currentSentence)
          generalStore.playAudio(audioResponse)
          currentSentence = ''
        }
      }
    }

    async function processRunStream(runStream) {
      let runId = null

      for await (const chunk of runStream) {
        await processChunk(chunk)

        if (
          chunk.event === 'thread.run.requires_action' &&
          chunk.data.required_action?.type === 'submit_tool_outputs'
        ) {
          runId = chunk.data.id

          const toolCalls =
            chunk.data.required_action.submit_tool_outputs.tool_calls

          const toolOutputs = []
          for (const toolCall of toolCalls) {
            if (toolCall.type === 'function') {
              const functionName = toolCall.function.name
              const functionArgs = toolCall.function.arguments
              const toolStatusMessage = getToolStatusMessage(functionName)

              chatHistory.value.unshift({
                id: 'temp-' + Date.now(),
                role: 'system',
                content: [
                  {
                    type: 'text',
                    text: {
                      value: toolStatusMessage,
                      annotations: [],
                    },
                  },
                ],
              })

              try {
                const audioResponse = await ttsStream(toolStatusMessage)
                generalStore.playAudio(audioResponse, true)
              } catch (err) {
                console.warn('TTS failed for system message:', err)
              }

              const fillerLines = [
                'Still looking... one sec.',
                'Let me double-check that.',
                'Almost got it...',
                'Going deeper...',
                'Hold tight—this one’s tricky.',
                'Sneaking past digital dragons...',
                "This one's taking a moment...",
                'Doing a deep scan... cyber-style.',
                'Almost there, I can feel it.',
                'Beep boop… still thinking.',
                "Ugh, data's being dramatic today.",
              ]

              let fillerTimer: ReturnType<typeof setTimeout> | null = null
              let fillerPlayed = false
              let stopFiller = false

              async function playFillerLoop() {
                await new Promise(resolve =>
                  setTimeout(resolve, 10000 + Math.random() * 500)
                )

                while (!stopFiller) {
                  const line =
                    fillerLines[Math.floor(Math.random() * fillerLines.length)]
                  try {
                    chatHistory.value.unshift({
                      id: 'temp-' + Date.now(),
                      role: 'assistant',
                      content: [
                        {
                          type: 'text',
                          text: {
                            value: line,
                            annotations: [],
                          },
                        },
                      ],
                    })
                    const fillerAudio = await ttsStream(line)
                    generalStore.playAudio(fillerAudio, true)
                    fillerPlayed = true
                  } catch (err) {
                    console.warn('TTS filler failed:', err)
                  }

                  await new Promise(resolve =>
                    setTimeout(resolve, 10000 + Math.random() * 2000)
                  )
                }
              }

              playFillerLoop()

              try {
                statusMessage.value = 'Thinking...'

                const result = await executeFunction(functionName, functionArgs)

                stopFiller = true
                if (fillerTimer) clearTimeout(fillerTimer)

                if (fillerPlayed) {
                  await new Promise(resolve => setTimeout(resolve, 400))
                }

                statusMessage.value = 'Processing...'

                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: result,
                })
              } catch (error) {
                console.error(
                  `Error executing function ${functionName}:`,
                  error
                )
                statusMessage.value = `Error executing function`

                stopFiller = true
                if (fillerTimer) clearTimeout(fillerTimer)

                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: `Error: ${error.message || 'Unknown error occurred during function execution'}`,
                })
              }
            }
          }

          if (toolOutputs.length > 0) {
            try {
              statusMessage.value = 'Processing...'

              const continuedRun = await submitToolOutputs(
                thread.value,
                runId,
                toolOutputs,
                assistant.value
              )

              await processRunStream(continuedRun)
              return
            } catch (error) {
              console.error('Error submitting tool outputs:', error)
              statusMessage.value = 'Function error'

              chatHistory.value.unshift({
                id: 'error-' + Date.now(),
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: {
                      value: `I'm sorry, but I encountered an error while processing your request. Please try again.`,
                      annotations: [],
                    },
                  },
                ],
              })
            }
          }

          function getToolStatusMessage(toolName: string): string {
            switch (toolName) {
              case 'perform_web_search':
                return '🔍 Searching the web...'
              case 'get_weather_forecast':
                return '🌦️ Checking the skies...'
              case 'get_current_datetime':
                return '🕒 Looking at the clock...'
              case 'open_path':
                return '📂 Opening that for you...'
              case 'manage_clipboard':
                return '📋 Working with your clipboard...'
              case 'get_website_context':
                return '🌐 Reading the page...'
              case 'search_torrents':
                return '🧲 Looking through the torrent net...'
              case 'add_torrent_to_qb':
                return '🚀 Starting your download...'
              case 'save_memory':
                return '🧠 Got it, remembering that...'
              case 'recall_memories':
                return '🧠 Let me think back...'
              case 'delete_memory':
                return '🗑️ Forgetting that now...'
              default:
                return '⚙️ Working on that...'
            }
          }
        }
      }
    }

    try {
      const run = await runAssistant(thread.value, assistant.value, memories)

      await processRunStream(run)

      if (currentSentence.trim().length > 0) {
        const audioResponse = await ttsStream(currentSentence)
        generalStore.playAudio(audioResponse)
      }
    } catch (error) {
      console.error('Error in chat process:', error)
      statusMessage.value = 'Processing error'

      chatHistory.value.unshift({
        id: 'error-' + Date.now(),
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: {
              value: `I apologize, but something went wrong. Please try again.`,
              annotations: [],
            },
          },
        ],
      })
    } finally {
      generalStore.storeMessage = false
      isProcessingRequest.value = false
      isTTSProcessing.value = false
    }
  }

  const transcribeAudioMessage = async (audioBuffer: Buffer) => {
    const response = await transcribeAudio(audioBuffer)
    return response
  }

  const createOpenAIPrompt = async (
    newMessage: string | any,
    store: boolean = true
  ) => {
    let memoryMessages: any[] = []
    let userMessage: any

    if (typeof newMessage === 'string') {
      userMessage = { role: 'user', content: newMessage }

      if (store) {
        const relevantMemories = await retrieveRelevantMemories(newMessage)
        memoryMessages = relevantMemories.map(memory => ({
          role: 'assistant',
          content: memory,
        }))
      }
    } else {
      userMessage = newMessage

      if (store) {
        const textContent = newMessage.content
          .filter(item => item.type === 'text')
          .map(item => item.text)
          .join(' ')

        const relevantMemories = await retrieveRelevantMemories(textContent)
        memoryMessages = relevantMemories.map(memory => ({
          role: 'assistant',
          content: memory,
        }))
      }
    }

    return {
      message: userMessage,
      history: memoryMessages,
    }
  }

  const uploadScreenshotToOpenAI = async (screenshot: string) => {
    try {
      const response = await uploadScreenshot(screenshot)
      return response
    } catch (error) {
      console.error('Error uploading screenshot:', error)
      return null
    }
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
    uploadScreenshotToOpenAI,
  }
})
