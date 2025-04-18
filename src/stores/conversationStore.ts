import { ref, nextTick, watch } from 'vue'
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

interface ServerContentPayload {
  interrupted?: boolean
  turnComplete?: boolean
  modelTurn?: { parts: any[] }
}

export const useConversationStore = defineStore('conversation', () => {
  const generalStore = useGeneralStore()
  const { statusMessage, isProcessingRequest, chatHistory, isPlaying } =
    storeToRefs(generalStore)

  const liveApiClient = ref<GeminiLiveApiClient | null>(null)
  const webSocketStatus = ref<WebSocketStatus>('IDLE')
  const isSessionInitialized = ref<boolean>(false)
  const isModelTurnComplete = ref<boolean>(true)
  let bufferedUserTurn = ref<(() => Promise<void>) | null>(null)

  const initializeSession = async () => {
    if (
      isSessionInitialized.value ||
      webSocketStatus.value === 'CONNECTING' ||
      webSocketStatus.value === 'OPEN'
    )
      return
    try {
      statusMessage.value = 'Initializing session...'
      const client = getGeminiLiveApiClient()
      liveApiClient.value = client
      client.onMessage(handleIncomingMessage)
      webSocketStatus.value = 'CONNECTING'
      await client.connect()
      isSessionInitialized.value = true
      webSocketStatus.value = client.getStatus()
    } catch (error: any) {
      console.error('Failed to initialize Gemini session:', error)
      webSocketStatus.value = 'ERROR'
      isSessionInitialized.value = false
      statusMessage.value = `Error: ${error.message || 'Connection failed'}`
      liveApiClient.value = null
    }
  }

  const handleIncomingMessage = async (message: ServerMessage) => {
    switch (message.messageType) {
      case 'setupComplete':
        webSocketStatus.value = 'OPEN'
        statusMessage.value = 'Ready'
        break

      case 'serverContent':
        const serverContentPayload = message.payload as
          | ServerContentPayload
          | undefined

        if (serverContentPayload?.interrupted) {
          console.log('Model INTERRUPTED by user activity.')
          generalStore.forceStopAudioPlayback()
          isModelTurnComplete.value = true
          isProcessingRequest.value = false
          statusMessage.value = 'Listening...'
          bufferedUserTurn.value = null
          return
        }

        let audioDataPart: any = null
        if (
          serverContentPayload?.modelTurn?.parts &&
          serverContentPayload.modelTurn.parts.length > 0
        ) {
          isProcessingRequest.value = true
          audioDataPart = serverContentPayload.modelTurn.parts.find((p: any) =>
            p.inlineData?.mimeType?.startsWith('audio/')
          )
        }

        if (audioDataPart) {
          isModelTurnComplete.value = false
          const base64Audio = audioDataPart.inlineData.data
          const mimeType = audioDataPart.inlineData.mimeType
          try {
            const audioBuffer = base64ToArrayBuffer(base64Audio)
            let sampleRate = 24000
            const rateMatch = mimeType.match(/rate=(\d+)/)
            if (rateMatch && rateMatch[1])
              sampleRate = parseInt(rateMatch[1], 10)
            else
              console.warn(
                `Could not extract sample rate: ${mimeType}. Using default ${sampleRate}Hz.`
              )
            const int16Array = new Int16Array(audioBuffer)
            const float32Array = new Float32Array(int16Array.length)
            for (let i = 0; i < int16Array.length; i++)
              float32Array[i] = int16Array[i] / 32768.0
            generalStore.playAudioRaw(float32Array, sampleRate)
          } catch (error) {
            console.error(
              'Error processing/decoding received audio data:',
              error
            )
            isProcessingRequest.value = false
            isModelTurnComplete.value = true
            statusMessage.value = 'Audio Error'
          }
        } else if (
          serverContentPayload?.modelTurn?.parts &&
          serverContentPayload.modelTurn.parts.length > 0
        ) {
          const textPart = serverContentPayload.modelTurn.parts.find(
            (p: any) =>
              p.text !== undefined && p.text !== null && p.text.trim() !== ''
          )
          if (textPart?.text) {
            console.warn(
              'Received unexpected TEXT data from model:',
              textPart.text
            )
            chatHistory.value.unshift({
              role: 'model',
              parts: [{ text: textPart.text }],
            })
            scrollChat()
          }
        }

        if (serverContentPayload?.turnComplete) {
          console.log('Model turn complete signaled.')
          isModelTurnComplete.value = true
          checkAndSendBufferedTurn()
        }
        break

      case 'toolCall':
        statusMessage.value = 'Executing function...'
        isProcessingRequest.value = true
        const toolCallPayload = message.payload as any
        if (toolCallPayload?.functionCalls?.length > 0) {
          const functionNames = toolCallPayload.functionCalls
            .map((c: any) => c.name)
            .join(', ')
          chatHistory.value.unshift({
            role: 'model',
            parts: [{ text: `⚙️ Calling function(s): ${functionNames}...` }],
          })
          scrollChat()
          const functionPromises = toolCallPayload.functionCalls.map(
            async (call: any) => {
              /* ... execute function logic ... */
            }
          )
          const results: FunctionResponsePayload[] =
            await Promise.all(functionPromises)
          console.log('Function results prepared:', results)
          chatHistory.value.unshift({
            role: 'user',
            parts: results.map(r => ({
              functionResponse: { name: r.name, response: r.response },
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
        isProcessingRequest.value = false
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
      !isPlaying.value &&
      bufferedUserTurn.value
    ) {
      const sendTurn = bufferedUserTurn.value
      bufferedUserTurn.value = null
      sendTurn().catch(e => console.error('Error sending buffered turn:', e))
    }
  }

  const completeUserTurn = async () => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      isProcessingRequest.value = false
      return
    }
    const sendLogic = async () => {
      if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
        console.error('Cannot send buffered turn, WebSocket disconnected.')
        isProcessingRequest.value = false
        bufferedUserTurn.value = null
        return
      }
      statusMessage.value = 'Processing...'
      isProcessingRequest.value = true
      generalStore.storeMessage = true
      const apiHistory = [...chatHistory.value]
        .filter(
          msg =>
            !(
              msg.role === 'user' &&
              msg.parts[0]?.text?.startsWith('[User Speaking')
            )
        )
        .reverse()
      if (
        apiHistory.length === 0 ||
        apiHistory[apiHistory.length - 1].role !== 'user'
      ) {
        console.warn(
          "CompleteTurn: Last message isn't from user or history empty."
        )
        isProcessingRequest.value = false
        statusMessage.value = 'Ready'
        return
      }
      try {
        await liveApiClient.value.sendClientContent(apiHistory, true)
      } catch (error: any) {
        console.error('Failed to send clientContent (completeUserTurn):', error)
        statusMessage.value = `Error: ${error.message || 'Send failed'}`
        isProcessingRequest.value = false
        bufferedUserTurn.value = null
      }
    }
    if (!isModelTurnComplete.value || isPlaying.value) {
      bufferedUserTurn.value = sendLogic
      statusMessage.value = 'Waiting for response...'
    } else {
      bufferedUserTurn.value = null
      await sendLogic()
    }
  }

  const sendTextMessage = async (text: string) => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      isProcessingRequest.value = false
      return
    }
    if (!text.trim()) {
      console.warn('Attempted to send empty text message.')
      return
    }
    if (isPlaying.value) {
      console.log('User sent text, stopping playback.')
      generalStore.forceStopAudioPlayback()
    }
    statusMessage.value = 'Processing...'
    isProcessingRequest.value = true
    chatHistory.value.unshift({ role: 'user', parts: [{ text: text }] })
    scrollChat()
    generalStore.storeMessage = true
    const apiHistory = [...chatHistory.value]
      .filter(
        msg =>
          !(
            msg.role === 'user' &&
            msg.parts[0]?.text?.startsWith('[User Speaking')
          )
      )
      .reverse()
    try {
      await liveApiClient.value.sendTextTurn(text, apiHistory.slice(0, -1))
    } catch (error: any) {
      console.error('Failed to send text message:', error)
      statusMessage.value = `Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
    }
  }

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

  const sendImageInput = async (
    base64ImageData: string,
    mimeType: string,
    promptText?: string
  ) => {
    const generalStoreInstance = useGeneralStore()
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      generalStoreInstance.takingScreenShot = false
      isProcessingRequest.value = false
      return
    }
    if (isPlaying.value) {
      console.log('User sent image, stopping playback.')
      generalStoreInstance.forceStopAudioPlayback()
    }
    statusMessage.value = 'Processing...'
    isProcessingRequest.value = true
    try {
      chatHistory.value.unshift({
        role: 'user',
        parts: [
          {
            text: `[Image Sent: ${mimeType}] ${promptText || 'Describe this image.'}`,
          },
        ],
      })
      scrollChat()
      generalStoreInstance.storeMessage = true
      const apiHistory = [...chatHistory.value]
        .filter(
          msg =>
            !(
              msg.role === 'user' &&
              msg.parts[0]?.text?.startsWith('[User Speaking')
            )
        )
        .reverse()
      await liveApiClient.value.sendImage(base64ImageData, mimeType)
      const effectivePrompt = promptText || 'Describe this image.'
      const imageTurnContent: Content = {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: '[IMAGE_DATA_REDACTED]' } },
          { text: effectivePrompt },
        ],
      }
      await liveApiClient.value.sendClientContent(
        [...apiHistory.slice(0, -1), imageTurnContent],
        true
      )
    } catch (error: any) {
      console.error('Failed to send image input:', error)
      statusMessage.value = `Image Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
    } finally {
      generalStoreInstance.takingScreenShot = false
    }
  }

  const sendFunctionResult = async (results: FunctionResponsePayload[]) => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      return
    }
    statusMessage.value = 'Processing function results...'
    isProcessingRequest.value = true
    try {
      await liveApiClient.value.sendFunctionResults(results)
    } catch (error: any) {
      console.error('Failed to send function results:', error)
      statusMessage.value = `Function Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
    }
  }

  const closeSession = () => {
    if (liveApiClient.value) liveApiClient.value.disconnect()
    webSocketStatus.value = 'CLOSED'
    isSessionInitialized.value = false
    statusMessage.value = 'Session closed.'
    liveApiClient.value = null
    isProcessingRequest.value = false
    bufferedUserTurn.value = null
  }

  const scrollChat = () => {
    nextTick(() => {
      const el = document.getElementById('chatHistory')
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    })
  }
  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      const s = atob(base64)
      const b = new Uint8Array(s.length)
      for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
      return b.buffer
    } catch (e) {
      console.error('Error decoding base64:', e)
      return new ArrayBuffer(0)
    }
  }

  watch([isModelTurnComplete, isPlaying], ([modelComplete, playing]) => {
    if (modelComplete && !playing && !bufferedUserTurn.value) {
      if (isProcessingRequest.value) {
        isProcessingRequest.value = false
      }
    }
  })

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
