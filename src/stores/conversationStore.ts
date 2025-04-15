import { ref, nextTick } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { useGeneralStore } from './generalStore'
import { executeFunction } from '../utils/functionCaller'
import {
  getGeminiLiveApiClient,
  GeminiLiveApiClient,
  Content,
  ServerMessage,
  FunctionResponsePayload,
} from '../api/gemini/liveApiClient'

type WebSocketStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'OPEN'
  | 'CLOSING'
  | 'CLOSED'
  | 'ERROR'

export const useConversationStore = defineStore('conversation', () => {
  const generalStore = useGeneralStore()
  const {
    statusMessage,
    updateVideo,
    isProcessingRequest,
    isTTSProcessing,
    chatHistory,
  } = storeToRefs(generalStore)

  const liveApiClient = ref<GeminiLiveApiClient | null>(null)
  const webSocketStatus = ref<WebSocketStatus>('IDLE')
  const isSessionInitialized = ref<boolean>(false)
  const isModelTurnComplete = ref<boolean>(true)
  let bufferedUserTurn = ref<(() => Promise<void>) | null>(null)

  /**
   * Initializes the Gemini Live API client and connects the WebSocket.
   */
  const initializeSession = async () => {
    if (
      isSessionInitialized.value ||
      webSocketStatus.value === 'CONNECTING' ||
      webSocketStatus.value === 'OPEN'
    ) {
      console.log('Session already initialized or in progress.')
      return
    }

    try {
      statusMessage.value = 'Initializing session...'
      const client = getGeminiLiveApiClient()
      liveApiClient.value = client

      client.onMessage(handleIncomingMessage)

      webSocketStatus.value = 'CONNECTING'
      await client.connect()

      isSessionInitialized.value = true
      webSocketStatus.value = client.getStatus()
      statusMessage.value = 'Session ready.'
      console.log('Gemini session initialized successfully.')
    } catch (error: any) {
      console.error('Failed to initialize Gemini session:', error)
      webSocketStatus.value = 'ERROR'
      isSessionInitialized.value = false
      statusMessage.value = `Error: ${error.message || 'Connection failed'}`
      liveApiClient.value = null
    }
  }

  /**
   * Handles incoming messages from the Gemini Live API WebSocket.
   * This function is set as the callback for the client.
   */
  const handleIncomingMessage = async (message: ServerMessage) => {
    console.log('Store received message:', message.messageType)

    switch (message.messageType) {
      case 'setupComplete':
        console.log('Store notified of Setup Complete.')
        webSocketStatus.value = 'OPEN'
        break

      case 'serverContent':
        const serverContentPayload = message.payload as any

        isProcessingRequest.value = true

        let audioDataPart: any = null
        if (serverContentPayload?.modelTurn?.parts?.length > 0) {
          audioDataPart = serverContentPayload.modelTurn.parts.find((p: any) =>
            p.inlineData?.mimeType?.startsWith('audio/pcm')
          )
        }

        if (audioDataPart) {
          isModelTurnComplete.value = false
          const base64Audio = audioDataPart.inlineData.data
          const mimeType = audioDataPart.inlineData.mimeType
          console.log(`Received PCM audio data, mimeType: ${mimeType}`)

          try {
            const audioBuffer = base64ToArrayBuffer(base64Audio)

            let sampleRate = 24000
            const rateMatch = mimeType.match(/rate=(\d+)/)
            if (rateMatch && rateMatch[1]) {
              sampleRate = parseInt(rateMatch[1], 10)
              console.log(`Extracted sample rate: ${sampleRate}`)
            } else {
              console.warn(
                `Could not extract sample rate from mimeType: ${mimeType}. Using default ${sampleRate}Hz.`
              )
            }

            const int16Array = new Int16Array(audioBuffer)
            const float32Array = new Float32Array(int16Array.length)
            for (let i = 0; i < int16Array.length; i++) {
              float32Array[i] = int16Array[i] / 32768.0
            }

            generalStore.playAudioRaw(float32Array, sampleRate)
          } catch (error) {
            console.error(
              'Error processing/decoding received audio data:',
              error
            )
          }
        } else if (serverContentPayload?.modelTurn?.parts?.length > 0) {
          const textPart = serverContentPayload.modelTurn.parts.find(
            (p: any) => p.text !== undefined && p.text !== null
          )
          if (textPart?.text) {
            console.warn(
              'Received unexpected TEXT data from model:',
              textPart.text
            )
          }
        } else {
          console.log(
            'Received serverContent without playable audio or text parts.'
          )
        }

        if (serverContentPayload?.turnComplete) {
          console.log('Model turn complete.')
          isModelTurnComplete.value = true
          checkAndSendBufferedTurn()
        }

        break

      case 'toolCall':
        statusMessage.value = 'Executing function...'
        isProcessingRequest.value = true
        const toolCallPayload = message.payload as any

        if (toolCallPayload?.functionCalls?.length > 0) {
          chatHistory.value.unshift({
            role: 'model',
            parts: [
              {
                text: `⚙️ Calling functions: ${toolCallPayload.functionCalls.map((c: any) => c.name).join(', ')}...`,
              },
            ],
          })
          scrollChat()

          const functionPromises = toolCallPayload.functionCalls.map(
            async (call: any) => {
              try {
                statusMessage.value = `Executing: ${call.name}...`
                const rawResult = await executeFunction(
                  call.name,
                  JSON.stringify(call.args || {})
                )
                console.log(`Raw function result for ${call.name}:`, rawResult)
                const responseContent =
                  typeof rawResult === 'string' ||
                  typeof rawResult === 'number' ||
                  typeof rawResult === 'boolean'
                    ? rawResult
                    : JSON.stringify(rawResult)

                return {
                  name: call.name,
                  response: { result: responseContent },
                }
              } catch (error: any) {
                console.error(`Error executing function ${call.name}:`, error)
                statusMessage.value = `Error executing ${call.name}`
                return {
                  name: call.name,
                  response: {
                    error: `Execution failed: ${error.message || 'Unknown error'}`,
                  },
                }
              }
            }
          )

          const results: FunctionResponsePayload[] =
            await Promise.all(functionPromises)
          chatHistory.value.unshift({
            role: 'user',
            parts: results.map(r => ({
              functionResponse: r,
            })),
          })
          scrollChat()

          await sendFunctionResult(results)
        } else {
          console.warn('Received toolCall message but no functionCalls found.')
          isProcessingRequest.value = false
        }
        break

      case 'goAway':
        statusMessage.value = 'Server disconnecting soon.'
        console.warn('Received GoAway message:', message.payload)
        webSocketStatus.value = 'CLOSING'
        break

      case 'error':
        const errorPayload = message.payload as any
        console.error('WebSocket client error message:', errorPayload?.error)
        statusMessage.value = `Connection Error: ${errorPayload?.error || 'Unknown error'}`
        webSocketStatus.value = 'ERROR'
        isProcessingRequest.value = false
        break

      default:
        console.warn(
          'Conversation store received unhandled message type:',
          message.messageType,
          message.payload
        )
    }
  }

  const checkAndSendBufferedTurn = () => {
    if (
      isModelTurnComplete.value &&
      !generalStore.isPlaying &&
      bufferedUserTurn.value
    ) {
      console.log(
        'Model turn and playback complete, sending buffered user turn.'
      )
      const sendTurn = bufferedUserTurn.value
      bufferedUserTurn.value = null
      sendTurn().catch(e => console.error('Error sending buffered turn:', e))
    }
  }

  const completeUserTurn = async () => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      console.error('Cannot complete user turn, WebSocket not open.')
      return
    }

    const sendLogic = async () => {
      if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) return

      statusMessage.value = 'Thinking...'
      isProcessingRequest.value = true
      generalStore.storeMessage = true

      const apiHistory = [...chatHistory.value].reverse()
      console.log(
        `Sending user turn (History Len: ${apiHistory.length}). Last user msg: ${apiHistory[apiHistory.length - 1]?.parts[0]?.text}`
      )

      try {
        await liveApiClient.value.sendClientContent(apiHistory, true)
      } catch (error: any) {
        console.error('Failed to send clientContent:', error)
        statusMessage.value = `Error: ${error.message || 'Send failed'}`
        isProcessingRequest.value = false
        bufferedUserTurn.value = null
      }
    }

    if (!isModelTurnComplete.value || generalStore.isPlaying) {
      console.log('Buffering user turn completion as model/playback is active.')
      bufferedUserTurn.value = sendLogic
      statusMessage.value = 'Waiting for response to finish...'
    } else {
      console.log('Model ready, sending user turn immediately.')
      bufferedUserTurn.value = null
      await sendLogic()
    }
  }

  /**
   * Sends a text message from the user to Gemini.
   */
  const sendTextMessage = async (text: string) => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      console.error('Cannot send text message, WebSocket not open.')
      return
    }
    if (!text.trim()) {
      console.warn('Attempted to send empty text message.')
      return
    }

    statusMessage.value = 'Sending message...'
    isProcessingRequest.value = true

    chatHistory.value.unshift({
      role: 'user',
      parts: [{ text: text }],
    })
    generalStore.storeMessage = true

    const apiHistory = [...chatHistory.value].reverse()

    try {
      await liveApiClient.value.sendTextTurn(text, apiHistory)
      statusMessage.value = 'Thinking...'
    } catch (error: any) {
      console.error('Failed to send text message:', error)
      statusMessage.value = `Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
    }
  }

  /**
   * Streams an audio chunk (Base64 encoded) to Gemini.
   */
  const sendAudioChunk = async (base64AudioChunk: string) => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      console.error('Cannot send audio chunk, WebSocket not open.')
      return
    }
    try {
      await liveApiClient.value.sendAudioChunk(base64AudioChunk)
    } catch (error: any) {
      console.error('Failed to send audio chunk:', error)
      statusMessage.value = `Audio Error: ${error.message || 'Send failed'}`
    }
  }

  /**
   * Sends image data (Base64 encoded) and an optional related prompt to Gemini.
   */
  const sendImageInput = async (
    base64ImageData: string,
    mimeType: string,
    promptText?: string
  ) => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      console.error('Cannot send image, WebSocket not open.')
      generalStore.takingScreenShot = false
      return
    }

    statusMessage.value = 'Sending image...'
    isProcessingRequest.value = true

    try {
      await liveApiClient.value.sendImage(base64ImageData, mimeType)
      statusMessage.value = 'Image sent, asking question...'

      chatHistory.value.unshift({
        role: 'user',
        parts: [{ text: `[Image Sent: ${mimeType}]` }],
      })

      const effectivePrompt = promptText || 'Describe this image.'

      const apiHistory = [...chatHistory.value].reverse()
      await liveApiClient.value.sendTextTurn(effectivePrompt, apiHistory)
      chatHistory.value.unshift({
        role: 'user',
        parts: [{ text: effectivePrompt }],
      })

      statusMessage.value = 'Thinking...'
    } catch (error: any) {
      console.error('Failed to send image input:', error)
      statusMessage.value = `Image Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
    } finally {
      generalStore.takingScreenShot = false
    }
  }

  /**
   * Sends the results of executed functions back to Gemini.
   */
  const sendFunctionResult = async (results: FunctionResponsePayload[]) => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      console.error('Cannot send function results, WebSocket not open.')
      return
    }

    statusMessage.value = 'Sending function results...'

    try {
      await liveApiClient.value.sendFunctionResults(results)
      statusMessage.value = 'Processing function results...'
    } catch (error: any) {
      console.error('Failed to send function results:', error)
      statusMessage.value = `Function Error: ${error.message || 'Send failed'}`
    }
  }

  /**
   * Disconnects the WebSocket connection.
   */
  const closeSession = () => {
    if (liveApiClient.value) {
      liveApiClient.value.disconnect()
    }
    webSocketStatus.value = 'CLOSED'
    isSessionInitialized.value = false
    statusMessage.value = 'Session closed.'
    liveApiClient.value = null
  }

  const scrollChat = () => {
    nextTick(() => {
      const chatHistoryElement = document.getElementById('chatHistory')
      if (chatHistoryElement) {
        chatHistoryElement.scrollTo({
          top: chatHistoryElement.scrollHeight,
          behavior: 'smooth',
        })
      }
    })
  }

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  return {
    webSocketStatus,
    isSessionInitialized,
    isModelTurnComplete,
    completeUserTurn,
    initializeSession,
    sendTextMessage,
    sendAudioChunk,
    sendImageInput,
    closeSession,
    liveApiClient,
    checkAndSendBufferedTurn,
  }
})
