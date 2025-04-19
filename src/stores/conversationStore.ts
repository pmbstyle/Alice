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
  WebSocketStatus,
  ServerContentPayload,
} from '../types/geminiTypes'
import { Logger } from '../utils/logger'

const logger = new Logger('ConversationStore')

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
  const bufferedUserTurn = ref<(() => Promise<void>) | null>(null)

  /**
   * Initializes a new session with the Gemini Live API
   */
  const initializeSession = async (): Promise<void> => {
    if (
      isSessionInitialized.value ||
      webSocketStatus.value === 'CONNECTING' ||
      webSocketStatus.value === 'OPEN'
    ) {
      logger.info(
        `Initialization skipped: Status=${webSocketStatus.value}, Initialized=${isSessionInitialized.value}`
      )
      return
    }

    if (webSocketStatus.value === 'ERROR' && !liveApiClient.value) {
      logger.error('Cannot initialize session, API client failed previously.')
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
      logger.info(
        'Session initialization sequence complete, waiting for setupComplete message...'
      )
    } catch (error: any) {
      handleSessionInitError(error)
    }
  }

  /**
   * Handles errors during session initialization
   */
  const handleSessionInitError = (error: any): void => {
    logger.error('Failed to initialize Gemini session:', error)
    webSocketStatus.value = 'ERROR'
    isSessionInitialized.value = false
    statusMessage.value = `Error: ${error.message || 'Connection failed'}`

    if (liveApiClient.value) {
      liveApiClient.value.disconnect()
      liveApiClient.value = null
    }

    isProcessingRequest.value = false
    generalStore.updateVideo('STAND_BY')
  }

  /**
   * Main handler for incoming messages from the API
   */
  const handleIncomingMessage = async (
    message: ServerMessage
  ): Promise<void> => {
    switch (message.messageType) {
      case 'setupComplete':
        handleSetupComplete()
        break

      case 'serverContent':
        await handleServerContent(message.payload as ServerContentPayload)
        break

      case 'toolCall':
        await handleToolCall(message.payload as BidiGenerateContentToolCall)
        break

      case 'goAway':
        handleGoAway(message.payload)
        break

      case 'error':
        handleErrorMessage(message.payload)
        break

      case 'sessionResumptionUpdate':
        logger.info('Received sessionResumptionUpdate:', message.payload)
        break

      default:
        logger.warn(
          'Received unhandled message type:',
          message.messageType,
          JSON.stringify(message.payload, null, 2)
        )
    }
  }

  /**
   * Handles setup complete messages
   */
  const handleSetupComplete = (): void => {
    if (webSocketStatus.value === 'CONNECTING') {
      webSocketStatus.value = 'OPEN'
      statusMessage.value = 'Ready'
      isProcessingRequest.value = false
      generalStore.updateVideo('STAND_BY')
      logger.info('WebSocket OPEN and ready after setupComplete.')
    } else {
      logger.warn(
        `Received 'setupComplete' but status was ${webSocketStatus.value}. Setting to OPEN.`
      )
      webSocketStatus.value = 'OPEN'
      if (!isProcessingRequest.value && !isPlaying.value) {
        statusMessage.value = 'Ready'
        generalStore.updateVideo('STAND_BY')
      }
    }
  }

  /**
   * Handles server content messages containing audio or text responses
   */
  const handleServerContent = async (
    payload?: ServerContentPayload
  ): Promise<void> => {
    if (!payload) return

    if (payload.interrupted) {
      handleModelInterruption()
      return
    }

    if (payload.modelTurn?.parts && payload.modelTurn.parts.length > 0) {
      if (!isProcessingRequest.value && !isPlaying.value) {
        logger.warn(
          'Receiving serverContent while supposedly idle. Updating state.'
        )
        isProcessingRequest.value = true
      }

      const audioDataPart = payload.modelTurn.parts.find((p: any) =>
        p.inlineData?.mimeType?.startsWith('audio/')
      )

      if (!audioDataPart) {
        const textPart = payload.modelTurn.parts.find(
          (p: any) =>
            p.text !== undefined &&
            p.text !== null &&
            String(p.text).trim() !== ''
        )
        const textPartValue = textPart?.text ? String(textPart.text) : null

        if (textPartValue) {
          handleTextResponse(textPartValue)
        }
      } else {
        await processAudioResponse(audioDataPart)
      }
    }

    if (payload.turnComplete) {
      logger.info('Model turn complete signaled.')
      generalStore.updateVideo('STAND_BY')
      isModelTurnComplete.value = true
      checkAndSendBufferedTurn()
    }
  }

  /**
   * Handles interruption of model output by user
   */
  const handleModelInterruption = (): void => {
    logger.info('Model INTERRUPTED by user activity.')
    generalStore.forceStopAudioPlayback()
    isModelTurnComplete.value = true
    isProcessingRequest.value = false

    if (isRecording.value || isRecordingRequested.value) {
      statusMessage.value = 'Listening...'
    } else if (!isPlaying.value) {
      statusMessage.value = 'Ready'
      generalStore.updateVideo('STAND_BY')
    }

    bufferedUserTurn.value = null
  }

  /**
   * Processes text responses from the model
   */
  const handleTextResponse = (text: string): void => {
    logger.info('Received TEXT from model:', text)
    chatHistory.value.unshift({
      role: 'model',
      parts: [{ text }],
    })
    scrollChat()
    isProcessingRequest.value = true
  }

  /**
   * Processes audio responses from the model
   */
  const processAudioResponse = async (audioDataPart: any): Promise<void> => {
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
        logger.warn('Received empty audio buffer after base64 decoding.')
        return
      }

      let sampleRate = 24000
      const rateMatch = mimeType.match(/rate=(\d+)/)
      if (rateMatch && rateMatch[1]) {
        sampleRate = parseInt(rateMatch[1], 10)
      } else {
        logger.warn('No sample rate found in MIME type:', mimeType)
      }

      const int16Array = new Int16Array(audioBuffer)
      const float32Array = new Float32Array(int16Array.length)
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0
      }

      generalStore.playAudioRaw(float32Array, sampleRate)
    } catch (error) {
      logger.error('Error processing/decoding received audio data:', error)
      isProcessingRequest.value = false
      isModelTurnComplete.value = true
      statusMessage.value = 'Audio Error'
      generalStore.forceStopAudioPlayback()
      generalStore.updateVideo('STAND_BY')
    }
  }

  /**
   * Handles tool call messages to execute functions
   */
  const handleToolCall = async (
    payload?: BidiGenerateContentToolCall
  ): Promise<void> => {
    if (!payload?.functionCalls?.length) {
      logger.warn(
        'Received toolCall message but no functionCalls found or payload invalid.'
      )
      if (isProcessingRequest.value && statusMessage.value === 'Thinking...') {
        isProcessingRequest.value = false
        statusMessage.value = 'Ready'
        generalStore.updateVideo('STAND_BY')
      }
      return
    }

    logger.info('Received TOOL_CALL request:', JSON.stringify(payload, null, 2))
    statusMessage.value = 'Thinking...'
    isProcessingRequest.value = true
    generalStore.updateVideo('PROCESSING')

    if (isPlaying.value) {
      logger.info('Tool call received, stopping current audio playback.')
      generalStore.forceStopAudioPlayback()
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    isModelTurnComplete.value = true

    const functionNames = payload.functionCalls
      .map((c: LiveFunctionCall) => c.name)
      .join(', ')

    chatHistory.value.unshift({
      role: 'model',
      parts: [{ text: `⚙️ Calling function(s): ${functionNames}...` }],
    })
    scrollChat()

    try {
      const results = await executeFunctions(payload.functionCalls)
      await sendFunctionResults(results)
    } catch (error) {
      logger.error('Error processing function calls:', error)
      isProcessingRequest.value = false
      isModelTurnComplete.value = true
      statusMessage.value = 'Function Error'
      generalStore.updateVideo('STAND_BY')
    }
  }

  /**
   * Executes functions and prepares results
   */
  const executeFunctions = async (
    functionCalls: LiveFunctionCall[]
  ): Promise<FunctionResponsePayload[]> => {
    const functionPromises = functionCalls.map(
      async (call: LiveFunctionCall): Promise<FunctionResponsePayload> => {
        try {
          logger.info(
            `Executing function: ${call.name} with args:`,
            JSON.stringify(call.args, null, 2)
          )
          const result: FunctionResult = await executeFunction(
            call.name,
            call.args
          )
          logger.info(
            `Function ${call.name} execution result:`,
            JSON.stringify(result, null, 2)
          )

          if (result.success) {
            const outputData = result.data === undefined ? null : result.data
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
          logger.error(
            `Error executing function ${call.name} locally:`,
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

    const results = await Promise.all(functionPromises)
    logger.info(
      'All functions executed, preparing results:',
      JSON.stringify(results, null, 2)
    )

    updateChatWithFunctionResults(functionCalls, results)

    return results
  }

  /**
   * Updates chat history with function results
   */
  const updateChatWithFunctionResults = (
    functionCalls: LiveFunctionCall[],
    results: FunctionResponsePayload[]
  ): void => {
    chatHistory.value.unshift({
      role: 'user',
      parts: results.map(r => {
        const originalCall = functionCalls.find(fc => fc.id === r.id)
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
  }

  /**
   * Handles Go Away message from server
   */
  const handleGoAway = (payload: any): void => {
    statusMessage.value = 'Server disconnecting soon.'
    logger.warn('Received GoAway message:', payload)
    webSocketStatus.value = 'CLOSING'
    isProcessingRequest.value = false
    isModelTurnComplete.value = true
    generalStore.forceStopAudioPlayback()
  }

  /**
   * Handles error messages from the server
   */
  const handleErrorMessage = (payload: any): void => {
    const errorMsg = payload?.error || 'Unknown client/connection error'
    logger.error('WebSocket client error message:', errorMsg)
    statusMessage.value = `Connection Error: ${errorMsg}`
    webSocketStatus.value = 'ERROR'
    isProcessingRequest.value = false
    isModelTurnComplete.value = true
    generalStore.forceStopAudioPlayback()
    generalStore.updateVideo('STAND_BY')
  }

  /**
   * Checks and sends buffered user turn if model is not busy
   */
  const checkAndSendBufferedTurn = (): void => {
    if (
      isModelTurnComplete.value &&
      !isPlaying.value &&
      bufferedUserTurn.value
    ) {
      logger.info('Model is idle, sending buffered user turn.')
      const sendTurn = bufferedUserTurn.value
      bufferedUserTurn.value = null

      sendTurn().catch(e => {
        logger.error('Error sending buffered turn:', e)
        isProcessingRequest.value = false
        statusMessage.value = 'Error Sending Buffered Turn'
        generalStore.updateVideo('STAND_BY')
      })
    }
  }

  /**
   * Closes the current session and resets state
   */
  const closeSession = (): void => {
    logger.info('Closing session...')
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

  /**
   * Completes user's audio turn, sending the end signal to the API
   */
  const completeUserTurn = async (): Promise<void> => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      isProcessingRequest.value = false
      logger.error('completeUserTurn called but WebSocket is not OPEN.')
      return
    }

    logger.info('Finalizing user audio turn...')

    const sendLogic = async (): Promise<void> => {
      if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
        logger.error('Cannot send audioStreamEnd, WebSocket disconnected.')
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
        logger.info('Sent audioStreamEnd signal.')
        isModelTurnComplete.value = false
        isProcessingRequest.value = true
        statusMessage.value = 'Processing...'
        generalStore.updateVideo('PROCESSING')
      } catch (error: any) {
        logger.error('Failed to send audioStreamEnd signal:', error)
        statusMessage.value = `Error: ${error.message || 'Send failed'}`
        isProcessingRequest.value = false
        bufferedUserTurn.value = null
        isModelTurnComplete.value = true
        generalStore.updateVideo('STAND_BY')
      }
    }

    if (!isModelTurnComplete.value || isPlaying.value) {
      logger.info('Model busy or playing, buffering audioStreamEnd signal.')
      bufferedUserTurn.value = sendLogic
    } else {
      logger.info('Model idle, sending audioStreamEnd signal immediately.')
      bufferedUserTurn.value = null
      await sendLogic()
    }
  }

  /**
   * Sends an audio chunk to the API
   */
  const sendAudioChunk = async (base64AudioChunk: string): Promise<void> => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      return
    }

    try {
      await liveApiClient.value.sendAudioChunk(base64AudioChunk)
    } catch (error: any) {
      logger.error('Failed to send audio chunk:', error)
    }
  }

  /**
   * Sends a text message to the API
   */
  const sendTextMessage = async (text: string): Promise<void> => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      isProcessingRequest.value = false
      logger.error('sendTextMessage called but WebSocket is not OPEN.')
      return
    }

    if (!text.trim()) {
      logger.warn('Attempted to send empty text message.')
      return
    }

    if (isPlaying.value) {
      logger.info('User sent text, interrupting playback.')
      generalStore.forceStopAudioPlayback()
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    if (!isModelTurnComplete.value) {
      logger.warn(
        'Sending text, marking previous model turn complete due to interruption.'
      )
      isModelTurnComplete.value = true
    }

    statusMessage.value = 'Sending message...'
    isProcessingRequest.value = true
    generalStore.updateVideo('PROCESSING')
    const userMessageContent: Content = {
      role: 'user',
      parts: [{ text }],
    }
    chatHistory.value.unshift(userMessageContent)
    scrollChat()

    logger.info(
      'Sending text message content:',
      JSON.stringify(userMessageContent, null, 2)
    )

    try {
      await liveApiClient.value.sendTextTurn(text)
      logger.info('Sent text message turn.')
      isModelTurnComplete.value = false
      statusMessage.value = 'Processing...'
    } catch (error: any) {
      logger.error('Failed to send text message turn:', error)
      statusMessage.value = `Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
      isModelTurnComplete.value = true
      generalStore.updateVideo('STAND_BY')
    }
  }

  /**
   * Sends an image to the API for processing
   */
  const sendImageInput = async (
    base64ImageData: string,
    mimeType: string,
    promptText?: string
  ): Promise<void> => {
    const generalStoreInstance = useGeneralStore()

    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      generalStoreInstance.takingScreenShot = false
      isProcessingRequest.value = false
      logger.error('sendImageInput called but WebSocket is not OPEN.')
      return
    }

    if (isPlaying.value) {
      logger.info('User sent image, interrupting playback.')
      generalStoreInstance.forceStopAudioPlayback()
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    if (!isModelTurnComplete.value) {
      logger.warn(
        'Sending image, marking previous model turn complete due to interruption.'
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
        { inlineData: { mimeType, data: base64ImageData } },
        { text: effectivePrompt },
      ],
    }

    chatHistory.value.unshift({
      role: 'user',
      parts: [{ text: `[Image Sent: ${mimeType}]` }, { text: effectivePrompt }],
    })
    scrollChat()

    logger.info(
      'Sending image turn content via sendClientContent:',
      JSON.stringify(imageTurnForApi, null, 2)
    )

    try {
      await liveApiClient.value.sendClientContent([imageTurnForApi], true)
      logger.info('Sent image input turn.')
      isModelTurnComplete.value = false
      statusMessage.value = 'Processing image...'
    } catch (error: any) {
      logger.error('Failed to send image input:', error)
      statusMessage.value = `Image Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
      isModelTurnComplete.value = true
      generalStoreInstance.updateVideo('STAND_BY')
    } finally {
      generalStoreInstance.takingScreenShot = false
    }
  }

  /**
   * Sends function results back to the API
   */
  const sendFunctionResults = async (
    results: FunctionResponsePayload[]
  ): Promise<void> => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      statusMessage.value = 'Error: Not connected.'
      logger.error('sendFunctionResults called but WebSocket is not OPEN.')
      isProcessingRequest.value = false
      isModelTurnComplete.value = true
      generalStore.updateVideo('STAND_BY')
      return
    }

    logger.info(
      'Sending function results back to model:',
      JSON.stringify(results, null, 2)
    )
    statusMessage.value = 'Sending function results...'

    try {
      await liveApiClient.value.sendFunctionResults(results)
      logger.info('Function results sent successfully.')
      isModelTurnComplete.value = false
      statusMessage.value = 'Processing function results...'
    } catch (error: any) {
      logger.error('Failed to send function results:', error)
      statusMessage.value = `Function Error: ${error.message || 'Send failed'}`
      isProcessingRequest.value = false
      isModelTurnComplete.value = true
      generalStore.updateVideo('STAND_BY')
    }
  }

  /**
   * Scrolls the chat history to the bottom
   */
  const scrollChat = (): void => {
    nextTick(() => {
      const el = document.getElementById('chatHistory')
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        logger.warn('Chat history element not found for scrolling.')
      }
    })
  }

  /**
   * Converts a base64 string to an ArrayBuffer
   */
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    try {
      const binaryString = atob(base64)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      return bytes.buffer
    } catch (e) {
      logger.error('Error decoding base64 string:', e)
      return new ArrayBuffer(0)
    }
  }

  /**
   * Sends a single screen frame as image data to the API using realtimeInput.
   */
  const sendScreenFrame = async (base64ImageData: string): Promise<void> => {
    if (webSocketStatus.value !== 'OPEN' || !liveApiClient.value) {
      return
    }
    if (!base64ImageData) {
      logger.warn('sendScreenFrame called with empty image data.')
      return
    }

    try {
      await liveApiClient.value.sendRealtimeVideoFrame(
        base64ImageData,
        'image/jpeg'
      )
    } catch (error: any) {
      logger.error('Failed to send screen frame:', error)
      if (
        error.message.includes('WebSocket not ready') ||
        error.message.includes('CLOSED')
      ) {
        const generalStore = useGeneralStore()
        if (generalStore.isScreenSharing) {
          logger.warn(
            'Stopping screen share due to WebSocket closed/error during send.'
          )
        }
      }
    }
  }

  /**
   * Watches conversation state and updates UI accordingly
   */
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
            logger.info(
              'System confirmed idle after delay, setting status to Ready.'
            )
            statusMessage.value = 'Ready'
            generalStore.updateVideo('STAND_BY')
          } else {
            logger.info(
              'State changed during Ready delay, skipping status update.'
            )
          }
        }, 100)
      } else if (
        isIdle &&
        !wasBusy &&
        statusMessage.value !== 'Ready' &&
        !isErrorOrFinalState
      ) {
        logger.info('System started idle but status not Ready, forcing Ready.')
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
    liveApiClient,
    initializeSession,
    closeSession,
    sendTextMessage,
    sendAudioChunk,
    sendImageInput,
    completeUserTurn,
    checkAndSendBufferedTurn,
    sendScreenFrame,
  }
})
