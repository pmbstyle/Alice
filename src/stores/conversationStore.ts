import { ref, nextTick, watch } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { useGeneralStore } from './generalStore'
import { executeFunction, FunctionResult } from '../utils/functionCaller'
import { getGeminiLiveApiClient } from '../api/gemini/liveApiClient'
import {
  GeminiLiveApiClient,
  Content,
  ServerMessage,
  FunctionResponsePayload,
  BidiGenerateContentToolCall,
  LiveFunctionCall,
} from '../types/geminiTypes'

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
  const {
    statusMessage,
    isProcessingRequest,
    chatHistory,
    isPlaying,
    isRecording,
    isRecordingRequested,
  } = storeToRefs(generalStore)

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
    ) {
      console.log(
        `[Store] Initialization skipped: Status=${webSocketStatus.value}, Initialized=${isSessionInitialized.value}`
      )
      return
    }
    if (webSocketStatus.value === 'ERROR' && !liveApiClient.value) {
      console.error(
        '[Store] Cannot initialize session, API client failed previously.'
      )
      statusMessage.value = 'Initialization Failed (Client Error)'
      return
    }
    try {
      statusMessage.value = 'Initializing session...'
      isProcessingRequest.value = true
      generalStore.updateVideo('PROCESSING')
      const client = liveApiClient.value || getGeminiLiveApiClient()
      liveApiClient.value = client
      if (
        webSocketStatus.value === 'CLOSED' ||
        webSocketStatus.value === 'ERROR'
      ) {
        webSocketStatus.value = 'IDLE'
      }
      client.onMessage(handleIncomingMessage)
      webSocketStatus.value = 'CONNECTING'
      await client.connect()
      isSessionInitialized.value = true
      console.log(
        '[Store] Session initialization sequence complete, waiting for setupComplete message...'
      )
    } catch (error: any) {
      console.error('[Store] Failed to initialize Gemini session:', error)
      webSocketStatus.value = 'ERROR'
      isSessionInitialized.value = false
      statusMessage.value = `Error: ${error.message || 'Connection failed'}`
      liveApiClient.value?.disconnect()
      liveApiClient.value = null
      isProcessingRequest.value = false
      generalStore.updateVideo('STAND_BY')
    }
  }

  const handleIncomingMessage = async (message: ServerMessage) => {
    switch (message.messageType) {
      case 'setupComplete':
        if (webSocketStatus.value === 'CONNECTING') {
          webSocketStatus.value = 'OPEN'
          statusMessage.value = 'Ready'
          isProcessingRequest.value = false
          generalStore.updateVideo('STAND_BY')
          console.log('[Store] WebSocket OPEN and ready after setupComplete.')
        } else {
          console.warn(
            `[Store] Received 'setupComplete' but status was ${webSocketStatus.value}. Setting to OPEN.`
          )
          webSocketStatus.value = 'OPEN'
          if (!isProcessingRequest.value && !isPlaying.value) {
            statusMessage.value = 'Ready'
            generalStore.updateVideo('STAND_BY')
          }
        }
        break

      case 'serverContent':
        const serverContentPayload = message.payload as
          | ServerContentPayload
          | undefined

        if (serverContentPayload?.interrupted) {
          console.log('[Store] Model INTERRUPTED by user activity.')
          generalStore.forceStopAudioPlayback()
          isModelTurnComplete.value = true
          isProcessingRequest.value = false
          if (isRecording.value || isRecordingRequested.value) {
            statusMessage.value = 'Listening...'
          } else {
            if (!isPlaying.value) {
              statusMessage.value = 'Ready'
              generalStore.updateVideo('STAND_BY')
            }
          }
          bufferedUserTurn.value = null
          return
        }

        let audioDataPart: any = null
        let textPartValue: string | null = null

        if (
          serverContentPayload?.modelTurn?.parts &&
          serverContentPayload.modelTurn.parts.length > 0
        ) {
          if (!isProcessingRequest.value && !isPlaying.value) {
            console.warn(
              '[Store] Receiving serverContent while supposedly idle. Updating state.'
            )
            isProcessingRequest.value = true
          }
          audioDataPart = serverContentPayload.modelTurn.parts.find((p: any) =>
            p.inlineData?.mimeType?.startsWith('audio/')
          )
          if (!audioDataPart) {
            const textPart = serverContentPayload.modelTurn.parts.find(
              (p: any) =>
                p.text !== undefined &&
                p.text !== null &&
                String(p.text).trim() !== ''
            )
            textPartValue = textPart?.text ? String(textPart.text) : null
          }
        }

        if (audioDataPart) {
          isModelTurnComplete.value = false
          if (statusMessage.value !== 'Speaking...') {
            statusMessage.value = 'Speaking...'
            generalStore.updateVideo('SPEAKING')
          }
          const base64Audio = audioDataPart.inlineData.data
          const mimeType = audioDataPart.inlineData.mimeType
          try {
            const audioBuffer = base64ToArrayBuffer(base64Audio)
            if (audioBuffer.byteLength === 0) {
              console.warn(
                '[Store] Received empty audio buffer after base64 decoding.'
              )
            } else {
              let sampleRate = 24000
              const rateMatch = mimeType.match(/rate=(\d+)/)
              if (rateMatch && rateMatch[1]) {
                sampleRate = parseInt(rateMatch[1], 10)
              } else {
                console.warn(
                  '[Store] No sample rate found in MIME type:',
                  mimeType
                )
              }
              const int16Array = new Int16Array(audioBuffer)
              const float32Array = new Float32Array(int16Array.length)
              for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768.0
              }
              generalStore.playAudioRaw(float32Array, sampleRate)
            }
          } catch (error) {
            console.error(
              '[Store] Error processing/decoding received audio data:',
              error
            )
            isProcessingRequest.value = false
            isModelTurnComplete.value = true
            statusMessage.value = 'Audio Error'
            generalStore.forceStopAudioPlayback()
            generalStore.updateVideo('STAND_BY')
          }
        } else if (textPartValue) {
          console.log('[Store] Received TEXT from model:', textPartValue)
          chatHistory.value.unshift({
            role: 'model',
            parts: [{ text: textPartValue }],
          })
          scrollChat()
          isProcessingRequest.value = true
        }

        if (serverContentPayload?.turnComplete) {
          console.log('[Store] Model turn complete signaled.')
          generalStore.updateVideo('STAND_BY')
          isModelTurnComplete.value = true
          checkAndSendBufferedTurn()
        }
        break

      case 'toolCall':
        const toolCallPayload = message.payload as
          | BidiGenerateContentToolCall
          | undefined
        if (toolCallPayload?.functionCalls?.length) {
          console.log(
            '[Store] Received TOOL_CALL request:',
            JSON.stringify(toolCallPayload, null, 2)
          )
          statusMessage.value = 'Thinking...'
          isProcessingRequest.value = true
          generalStore.updateVideo('PROCESSING')
          if (isPlaying.value) {
            console.log(
              '[Store] Tool call received, stopping current audio playback.'
            )
            generalStore.forceStopAudioPlayback()
            await new Promise(resolve => setTimeout(resolve, 50))
          }
          isModelTurnComplete.value = true

          const functionNames = toolCallPayload.functionCalls
            .map((c: LiveFunctionCall) => c.name)
            .join(', ')

          chatHistory.value.unshift({
            role: 'model',
            parts: [{ text: `⚙️ Calling function(s): ${functionNames}...` }],
          })
          scrollChat()

          const functionPromises = toolCallPayload.functionCalls.map(
            async (
              call: LiveFunctionCall
            ): Promise<FunctionResponsePayload> => {
              try {
                console.log(
                  `[Store] Executing function: ${call.name} with args:`,
                  JSON.stringify(call.args, null, 2)
                )
                const result: FunctionResult = await executeFunction(
                  call.name,
                  call.args
                )
                console.log(
                  `[Store] Function ${call.name} execution result:`,
                  JSON.stringify(result, null, 2)
                )
                if (result.success) {
                  const outputData =
                    result.data === undefined ? null : result.data
                  return {
                    id: call.id,
                    response: { output: outputData },
                  }
                } else {
                  return {
                    id: call.id,
                    response: {
                      error: {
                        message: result.error || 'Function execution failed',
                      },
                    },
                  }
                }
              } catch (execError: any) {
                console.error(
                  `[Store] Error executing function ${call.name} locally:`,
                  execError
                )
                return {
                  id: call.id,
                  response: {
                    error: {
                      message: `Internal error executing function: ${execError.message || execError}`,
                    },
                  },
                }
              }
            }
          )

          const results: FunctionResponsePayload[] =
            await Promise.all(functionPromises)
            console.log(
              '[Store] All functions executed, preparing results:',
              JSON.stringify(results, null, 2)
            )

            chatHistory.value.unshift({
              role: 'user',
              parts: results.map(r => {
                const originalCall = toolCallPayload.functionCalls.find(
                  fc => fc.id === r.id
                )
                const functionName = originalCall
                  ? originalCall.name
                  : 'unknown_function'
                const responseContent =
                  r.response.output !== undefined
                    ? r.response.output
                    : { error: r.response.error }
                return {
                  functionResponse: {
                    name: functionName,
                    response: responseContent,
                  },
                }
              }),
            })
            scrollChat()

            await sendFunctionResults(results)
        } else {
          console.warn(
            '[Store] Received toolCall message but no functionCalls found or payload invalid.'
          )
          if (
            isProcessingRequest.value &&
            statusMessage.value === 'Thinking...'
          ) {
            isProcessingRequest.value = false
            statusMessage.value = 'Ready'
            generalStore.updateVideo('STAND_BY')
          }
        }
        break

      case 'goAway':
        statusMessage.value = 'Server disconnecting soon.'
        console.warn('[Store] Received GoAway message:', message.payload)
        webSocketStatus.value = 'CLOSING'
        isProcessingRequest.value = false
        isModelTurnComplete.value = true
        generalStore.forceStopAudioPlayback()
        break

      case 'error':
        const errorPayload = message.payload as any
        const errorMsg =
          errorPayload?.error || 'Unknown client/connection error'
        console.error('[Store] WebSocket client error message:', errorMsg)
        statusMessage.value = `Connection Error: ${errorMsg}`
        webSocketStatus.value = 'ERROR'
        isProcessingRequest.value = false
        isModelTurnComplete.value = true
        generalStore.forceStopAudioPlayback()
        generalStore.updateVideo('STAND_BY')
        break

      case 'sessionResumptionUpdate':
        console.log(
          '[Store] Received sessionResumptionUpdate:',
          message.payload
        )
        break

      default:
        console.warn(
          '[Store] Received unhandled message type:',
          message.messageType,
          JSON.stringify(message.payload, null, 2)
        )
    }
  }

  const checkAndSendBufferedTurn = () => {
    if (
      isModelTurnComplete.value &&
      !isPlaying.value &&
      bufferedUserTurn.value
    ) {
      console.log('[Store] Model is idle, sending buffered user turn.')
      const sendTurn = bufferedUserTurn.value
      bufferedUserTurn.value = null

      sendTurn().catch(e => {
        console.error('[Store] Error sending buffered turn:', e)
        isProcessingRequest.value = false
        statusMessage.value = 'Error Sending Buffered Turn'
        generalStore.updateVideo('STAND_BY')
      })
    }
  }

  const completeUserTurn = async () => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      isProcessingRequest.value = false
      console.error(
        '[Store] completeUserTurn called but WebSocket is not OPEN.'
      )
      return
    }

    console.log('[Store] Finalizing user audio turn...')

    const sendLogic = async () => {
      if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
        console.error(
          '[Store] Cannot send audioStreamEnd, WebSocket disconnected.'
        )
        isProcessingRequest.value = false
        bufferedUserTurn.value = null
        statusMessage.value = 'Error: Disconnected'
        return
      }

      chatHistory.value = chatHistory.value.filter(
        msg =>
          !(
            msg.role === 'user' &&
            msg.parts[0]?.text?.startsWith('[User Speaking')
          )
      )

      try {
        await liveApiClient.value.sendAudioStreamEndSignal()
        console.log('[Store] Sent audioStreamEnd signal.')
        isModelTurnComplete.value = false
        isProcessingRequest.value = true
        statusMessage.value = 'Processing...'
        generalStore.updateVideo('PROCESSING')
      } catch (error: any) {
        console.error('[Store] Failed to send audioStreamEnd signal:', error)
        statusMessage.value = `Error: ${error.message || 'Send failed'}`
        isProcessingRequest.value = false
        bufferedUserTurn.value = null
        isModelTurnComplete.value = true
        generalStore.updateVideo('STAND_BY')
      }
    }

    if (!isModelTurnComplete.value || isPlaying.value) {
      console.log(
        '[Store] Model busy or playing, buffering audioStreamEnd signal.'
      )
      bufferedUserTurn.value = sendLogic
    } else {
      console.log(
        '[Store] Model idle, sending audioStreamEnd signal immediately.'
      )
      bufferedUserTurn.value = null
      await sendLogic()
    }
  }

  const sendAudioChunk = async (base64AudioChunk: string) => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      return
    }
    try {
      await liveApiClient.value.sendAudioChunk(base64AudioChunk)
    } catch (error: any) {
      console.error('[Store] Failed to send audio chunk:', error)
    }
  }

  const sendTextMessage = async (text: string) => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      isProcessingRequest.value = false
      console.error('[Store] sendTextMessage called but WebSocket is not OPEN.')
      return
    }
    if (!text.trim()) {
      console.warn('[Store] Attempted to send empty text message.')
      return
    }

    if (isPlaying.value) {
      console.log('[Store] User sent text, interrupting playback.')
      generalStore.forceStopAudioPlayback()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    if (!isModelTurnComplete.value) {
      console.warn(
        '[Store] Sending text, marking previous model turn complete due to interruption.'
      )
      isModelTurnComplete.value = true
    }

    statusMessage.value = 'Sending message...'
    isProcessingRequest.value = true
    generalStore.updateVideo('PROCESSING')

    const userMessageContent: Content = {
      role: 'user',
      parts: [{ text: text }],
    }
    chatHistory.value.unshift(userMessageContent)
    scrollChat()

    console.log(
      '[Store] Sending text message content:',
      JSON.stringify(userMessageContent, null, 2)
    )

    try {
      await liveApiClient.value.sendTextTurn(text)
      console.log('[Store] Sent text message turn.')
      isModelTurnComplete.value = false
      statusMessage.value = 'Processing...'
    } catch (error: any) {
      console.error('[Store] Failed to send text message turn:', error)
      statusMessage.value = `Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
      isModelTurnComplete.value = true
      generalStore.updateVideo('STAND_BY')
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
      console.error('[Store] sendImageInput called but WebSocket is not OPEN.')
      return
    }

    if (isPlaying.value) {
      console.log('[Store] User sent image, interrupting playback.')
      generalStoreInstance.forceStopAudioPlayback()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    if (!isModelTurnComplete.value) {
      console.warn(
        '[Store] Sending image, marking previous model turn complete due to interruption.'
      )
      isModelTurnComplete.value = true
    }

    statusMessage.value = 'Sending image...'
    isProcessingRequest.value = true
    generalStoreInstance.updateVideo('PROCESSING')
    generalStoreInstance.takingScreenShot = true

    const effectivePrompt = promptText || 'Describe this image.'

    const imageTurnForApi: Content = {
      role: 'user',
      parts: [
        { inlineData: { mimeType: mimeType, data: base64ImageData } },
        { text: effectivePrompt },
      ],
    }

    chatHistory.value.unshift({
      role: 'user',
      parts: [{ text: `[Image Sent: ${mimeType}]` }, { text: effectivePrompt }],
    })
    scrollChat()

    console.log(
      '[Store] Sending image turn content:',
      JSON.stringify(imageTurnForApi, null, 2)
    )

    try {
      await liveApiClient.value.sendClientContent([imageTurnForApi], true)

      console.log('[Store] Sent image input turn.')
      isModelTurnComplete.value = false
      statusMessage.value = 'Processing image...'
    } catch (error: any) {
      console.error('[Store] Failed to send image input:', error)
      statusMessage.value = `Image Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
      isModelTurnComplete.value = true
      generalStoreInstance.updateVideo('STAND_BY')
    } finally {
      generalStoreInstance.takingScreenShot = false
    }
  }

  const sendFunctionResults = async (results: FunctionResponsePayload[]) => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      console.error(
        '[Store] sendFunctionResults called but WebSocket is not OPEN.'
      )
      isProcessingRequest.value = false
      isModelTurnComplete.value = true
      generalStore.updateVideo('STAND_BY')
      return
    }

    console.log(
      '[Store] Sending function results back to model:',
      JSON.stringify(results, null, 2)
    )
    statusMessage.value = 'Sending function results...'

    try {
      await liveApiClient.value.sendFunctionResults(results)
      console.log('[Store] Function results sent successfully.')
      isModelTurnComplete.value = false
      statusMessage.value = 'Processing function results...'
    } catch (error: any) {
      console.error('[Store] Failed to send function results:', error)
      statusMessage.value = `Function Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
      isModelTurnComplete.value = true
      generalStore.updateVideo('STAND_BY')
    }
  }

  const closeSession = () => {
    console.log('[Store] Closing session...')
    if (liveApiClient.value) {
      liveApiClient.value.disconnect()
    }
    webSocketStatus.value = 'CLOSED'
    isSessionInitialized.value = false
    statusMessage.value = 'Session closed.'
    liveApiClient.value = null
    isProcessingRequest.value = false
    isModelTurnComplete.value = true
    bufferedUserTurn.value = null
    generalStore.forceStopAudioPlayback()
    generalStore.isRecording = false
    generalStore.isRecordingRequested = false
    generalStore.updateVideo('STAND_BY')
  }

  const scrollChat = () => {
    nextTick(() => {
      const el = document.getElementById('chatHistory')
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        console.warn('[Store] Chat history element not found for scrolling.')
      }
    })
  }

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      const binaryString = atob(base64)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      return bytes.buffer
    } catch (e) {
      console.error('[Store] Error decoding base64 string:', e)
      return new ArrayBuffer(0)
    }
  }

  watch(
    [
      isModelTurnComplete,
      isPlaying,
      isProcessingRequest,
      isRecording,
      isRecordingRequested,
    ],
    (
      [modelComplete, playing, processing, recording, recordingRequested],
      [
        oldModelComplete,
        oldPlaying,
        oldProcessing,
        oldRecording,
        oldRecordingRequested,
      ]
    ) => {
      const isIdle =
        modelComplete &&
        !playing &&
        !processing &&
        !recording &&
        !recordingRequested
      const wasBusy =
        !oldModelComplete ||
        oldPlaying ||
        oldProcessing ||
        oldRecording ||
        oldRecordingRequested

      const isErrorOrFinalState =
        statusMessage.value.includes('Error') ||
        statusMessage.value.includes('Failed') ||
        statusMessage.value === 'Session closed' ||
        statusMessage.value === 'Disconnected' ||
        statusMessage.value === 'Server disconnecting soon.'

      if (isIdle && wasBusy && !isErrorOrFinalState) {
        setTimeout(() => {
          const stillIdle =
            isModelTurnComplete.value &&
            !isPlaying.value &&
            !isProcessingRequest.value &&
            !isRecording.value &&
            !isRecordingRequested.value
          const stillNotError =
            !statusMessage.value.includes('Error') &&
            !statusMessage.value.includes('Failed')

          if (stillIdle && stillNotError) {
            console.log(
              '[Store Watcher] System confirmed idle after delay, setting status to Ready.'
            )
            statusMessage.value = 'Ready'
            generalStore.updateVideo('STAND_BY')
          } else {
            console.log(
              '[Store Watcher] State changed during Ready delay, skipping status update.'
            )
          }
        }, 100)
      } else if (
        isIdle &&
        !wasBusy &&
        statusMessage.value !== 'Ready' &&
        !isErrorOrFinalState
      ) {
        console.log(
          '[Store Watcher] System started idle but status not Ready, forcing Ready.'
        )
        statusMessage.value = 'Ready'
        generalStore.updateVideo('STAND_BY')
      }
    },
    { deep: false }
  )

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
