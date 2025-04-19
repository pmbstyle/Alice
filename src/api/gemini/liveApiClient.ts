import { assistantTools } from '../../utils/assistantTools'
import { assistantConfig } from '../../config/assistantConfig'
import {
  BidiGenerateContentSetup,
  Content,
  BidiGenerateContentRealtimeInput,
  BidiGenerateContentClientContent,
  FunctionResponsePayload,
  BidiGenerateContentToolResponse,
  ServerMessage,
  BidiGenerateContentToolCall,
  ConnectionOptions,
  WebSocketStatus,
  GeminiLiveApiClient,
  RealtimeInputVideo,
} from '../../types/geminiTypes'

import { Logger } from '../../utils/logger'

const logger = new Logger('API Client')

class GeminiLiveApiClientImpl implements GeminiLiveApiClient {
  private ws: WebSocket | null = null
  private apiKey: string
  private wsUrl: string
  private status: WebSocketStatus = 'IDLE'
  private messageCallback: ((message: ServerMessage) => void) | null = null
  private connectionPromise: Promise<void> | null = null
  private resolveConnectionPromise: (() => void) | null = null
  private rejectConnectionPromise: ((reason?: any) => void) | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 3
  private reconnectDelay: number = 2000

  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY
    const baseUrl =
      import.meta.env.VITE_GEMINI_WS_URL ||
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'
    this.wsUrl = `${baseUrl}?key=${this.apiKey}`

    if (!this.apiKey || !baseUrl) {
      logger.error(
        'Gemini API Key or WebSocket URL base is missing in environment variables.'
      )
      this.status = 'ERROR'
      return
    }
    logger.info('Gemini Client Initialized.')
  }

  getStatus(): WebSocketStatus {
    return this.status
  }

  onMessage(callback: (message: ServerMessage) => void): void {
    this.messageCallback = callback
  }

  connect(options: ConnectionOptions = {}): Promise<void> {
    const timeoutMs = options.timeoutMs || 10000

    if (this.status === 'ERROR' && (!this.apiKey || !this.wsUrl)) {
      return Promise.reject(
        new Error('Gemini API Key or WebSocket URL is missing. Cannot connect.')
      )
    }

    if (this.status === 'OPEN' || this.status === 'CONNECTING') {
      logger.info(`Already ${this.status.toLowerCase()}, reusing connection`)
      return this.connectionPromise || Promise.resolve()
    }

    this.disconnect()

    this.status = 'CONNECTING'
    logger.info('Attempting to establish WebSocket connection...')

    this.connectionPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.status === 'CONNECTING') {
          logger.error(`Connection timeout after ${timeoutMs}ms`)
          this.status = 'ERROR'
          reject(new Error(`Connection timeout after ${timeoutMs}ms`))
          this.disconnect()
        }
      }, timeoutMs)

      this.resolveConnectionPromise = () => {
        clearTimeout(timeoutId)
        resolve()
      }

      this.rejectConnectionPromise = (error: Error) => {
        clearTimeout(timeoutId)
        reject(error)
      }

      try {
        this.ws = new WebSocket(this.wsUrl)
        this.ws.binaryType = 'blob'

        this.setupWebSocketEventHandlers()
      } catch (error: any) {
        clearTimeout(timeoutId)
        logger.error('Failed to create WebSocket:', error)
        this.status = 'ERROR'
        reject(new Error(`Failed to create WebSocket: ${error.message}`))
        this.connectionPromise = null
      }
    })

    return this.connectionPromise
  }

  private setupWebSocketEventHandlers(): void {
    if (!this.ws) return

    this.ws.onopen = () => {
      this.status = 'OPEN'
      logger.info(
        `WebSocket connection established (readyState: ${this.ws?.readyState})`
      )

      this.sendSetupMessage().catch(error => {
        logger.error('Failed to send setup message:', error)
        this.status = 'ERROR'
        this.rejectConnectionPromise?.(
          new Error(`Failed to send setup message: ${error.message}`)
        )
        this.disconnect()
      })
    }

    this.ws.onmessage = event => {
      if (event.data instanceof Blob) {
        this.handleWebSocketMessage(event.data)
      } else {
        logger.error(
          'Received non-Blob message, which is unexpected:',
          event.data
        )
      }
    }

    this.ws.onerror = event => {
      const errorReason =
        event instanceof ErrorEvent ? event.message : 'Unknown WebSocket error'
      logger.error('WebSocket Error:', event)
      this.status = 'ERROR'

      if (this.rejectConnectionPromise) {
        this.rejectConnectionPromise(
          new Error(`WebSocket connection error: ${errorReason}`)
        )
        this.rejectConnectionPromise = null
      }

      this.ws = null
      this.connectionPromise = null
    }

    this.ws.onclose = event => {
      const wasConnecting = this.status === 'CONNECTING'
      const previousStatus = this.status

      logger.info(
        `WebSocket Closed: Code=${event.code}, Reason=${event.reason || 'No reason specified'}`
      )
      this.status = 'CLOSED'
      this.ws = null

      const shouldAttemptReconnect =
        !event.wasClean &&
        this.reconnectAttempts < this.maxReconnectAttempts &&
        previousStatus !== 'ERROR' &&
        previousStatus !== 'CLOSING'

      if (shouldAttemptReconnect) {
        logger.info(
          `Attempting reconnection (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`
        )
        this.status = 'RECONNECTING'
        this.reconnectAttempts++

        setTimeout(() => {
          this.connect({ timeoutMs: 10000 }).catch(error => {
            logger.error(`Reconnection attempt failed:`, error)
          })
        }, this.reconnectDelay)

        return
      }

      if (event.wasClean) {
        this.reconnectAttempts = 0
      }

      if (
        this.rejectConnectionPromise &&
        (wasConnecting || previousStatus === 'OPEN')
      ) {
        this.rejectConnectionPromise(
          new Error(
            `WebSocket closed unexpectedly (Code: ${event.code}, Reason: ${event.reason || 'Unknown'}) before session was fully established.`
          )
        )
        this.rejectConnectionPromise = null
      }

      this.connectionPromise = null

      if (this.messageCallback && !event.wasClean) {
        this.messageCallback({
          messageType: 'error',
          payload: {
            error: `WebSocket closed unexpectedly`,
            code: event.code,
            reason: event.reason,
          },
        })
      }

      this.resolveConnectionPromise = null
      this.rejectConnectionPromise = null
    }
  }

  disconnect(): void {
    if (this.ws) {
      logger.info(
        `Disconnecting WebSocket (readyState: ${this.ws.readyState})...`
      )

      if (this.status !== 'CLOSED' && this.status !== 'CLOSING') {
        this.status = 'CLOSING'

        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          try {
            this.ws.close(1000, 'Client initiated disconnect')
            logger.info('WebSocket close() called.')
          } catch (e) {
            logger.error('Error calling WebSocket close():', e)
          }
        } else {
          logger.info(
            `WebSocket not in OPEN/CONNECTING state (is ${this.ws.readyState}), skipping close() call.`
          )
        }
      }

      this.ws = null
    } else {
      logger.info('Disconnect called but WebSocket instance was already null.')
    }

    if (this.status !== 'CLOSED') {
      this.status = 'CLOSED'
      logger.info('Status set to CLOSED.')
    }

    if (this.rejectConnectionPromise) {
      this.rejectConnectionPromise(
        new Error('Connection attempt cancelled by disconnect.')
      )
      this.rejectConnectionPromise = null
    }

    this.connectionPromise = null
    this.resolveConnectionPromise = null
    this.rejectConnectionPromise = null

    this.reconnectAttempts = 0
  }

  private async sendJson(payload: object): Promise<void> {
    const isSetupMessage = 'setup' in payload
    const payloadType = Object.keys(payload)[0] || 'unknown'

    if (
      this.status !== 'OPEN' &&
      !(isSetupMessage && this.ws?.readyState === WebSocket.OPEN)
    ) {
      const errorMsg = `WebSocket not ready to send ${payloadType}. Status: ${this.status}, ReadyState: ${this.ws?.readyState}.`
      logger.error(errorMsg)
      return Promise.reject(new Error(errorMsg))
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const errorMsg = `ws.send() SKIPPED. WebSocket instance is null or not in OPEN state (current state: ${this.ws?.readyState}, status: ${this.status})`
      logger.error(errorMsg)

      if (this.status === 'OPEN') {
        logger.warn(
          'Status discrepancy: Status is OPEN but readyState is not. Setting status to ERROR.'
        )
        this.status = 'ERROR'
      }

      return Promise.reject(new Error(errorMsg))
    }

    try {
      const jsonString = JSON.stringify(payload)
      this.ws.send(jsonString)
      return Promise.resolve()
    } catch (error) {
      logger.error(
        'Failed to send WebSocket message:',
        error,
        'Payload:',
        payload
      )
      this.status = 'ERROR'
      return Promise.reject(error)
    }
  }

  private async sendSetupMessage(): Promise<void> {
    const toolsToSend = assistantTools.length > 0 ? assistantTools : undefined

    const setupPayload: { setup: BidiGenerateContentSetup } = {
      setup: {
        model: assistantConfig.model,
        generationConfig: {
          temperature: assistantConfig.temperature,
          maxOutputTokens: assistantConfig.maxOutputTokens,
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: assistantConfig.voiceName,
              },
            },
          },
        },
        systemInstruction: {
          role: 'user',
          parts: [
            {
              text: assistantConfig.systemInstruction,
            },
          ],
        },
        tools: toolsToSend,
        realtimeInputConfig: {
          automaticActivityDetection: {},
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
        },
        ...(assistantConfig.sessionResumption?.enabled && {
          sessionResumption: {},
        }),
        ...(assistantConfig.contextWindowCompression?.slidingWindow
          ?.enabled && { contextWindowCompression: { slidingWindow: {} } }),
      },
    }

    await this.sendJson(setupPayload)
    logger.debug('Sent setup message:', JSON.stringify(setupPayload, null, 2))
  }

  private handleWebSocketMessage(blobData: Blob): void {
    const reader = new FileReader()

    reader.onload = () => {
      try {
        if (typeof reader.result === 'string') {
          this.processJsonMessage(reader.result)
        } else {
          logger.error('Failed to read Blob as text:', reader.result)
          this.notifyError('Failed to read Blob data')
        }
      } catch (error) {
        logger.error(
          'Error processing text from Blob:',
          error,
          'Blob Text:',
          reader.result
        )
        this.notifyError(
          `Error processing Blob content: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    reader.onerror = event => {
      logger.error('Error reading Blob data:', event)
      this.notifyError('Error reading incoming Blob')
    }

    reader.readAsText(blobData)
  }

  private processJsonMessage(jsonString: string): void {
    let message
    try {
      message = JSON.parse(jsonString)
      let serverMsg: ServerMessage = {
        messageType: 'unknown',
        payload: message,
      }

      if (!message) {
        logger.warn('Received empty or null JSON message')
        return
      }

      if ('toolCall' in message) {
        serverMsg = {
          messageType: 'toolCall',
          payload: message.toolCall as BidiGenerateContentToolCall,
          usageMetadata: message.usageMetadata,
        }
      } else if ('setupComplete' in message) {
        serverMsg = {
          messageType: 'setupComplete',
          payload: message.setupComplete,
        }
        this.handleSetupComplete()
      } else if ('serverContent' in message) {
        serverMsg = {
          messageType: 'serverContent',
          payload: message.serverContent,
          usageMetadata: message.usageMetadata,
        }
      } else if ('goAway' in message) {
        logger.info('--> Identified as goAway.')
        serverMsg = { messageType: 'goAway', payload: message.goAway }
        logger.warn('Received GoAway message from server.')
      } else if ('error' in message) {
        logger.info('--> Identified as error.')
        serverMsg = { messageType: 'error', payload: message.error }
        logger.error('Received explicit error from server:', message.error)
        this.status = 'ERROR'
        this.notifyError(`Server error: ${JSON.stringify(message.error)}`)
      } else if ('sessionResumptionUpdate' in message) {
        logger.info('--> Identified as sessionResumptionUpdate.')
        serverMsg = {
          messageType: 'sessionResumptionUpdate',
          payload: message.sessionResumptionUpdate,
        }
      } else {
        logger.warn(
          'Received unhandled JSON message structure (no known top-level key found):',
          message
        )
        serverMsg.payload = { error: 'Unhandled JSON structure', data: message }
      }

      if (this.messageCallback) {
        this.messageCallback(serverMsg)
      } else {
        logger.warn('No message callback registered to handle:', serverMsg)
      }
    } catch (error) {
      logger.error(
        'JSON parsing failed for message string:',
        error,
        'Raw String Data:',
        jsonString
      )
      this.notifyError(
        `JSON parsing failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private handleSetupComplete(): void {
    if (this.status === 'CONNECTING' || this.status === 'OPEN') {
      if (this.status === 'CONNECTING') {
        logger.info(
          'Received setupComplete. Updating status from CONNECTING to OPEN.'
        )
        this.status = 'OPEN'
      }
      this.resolveConnectionPromise?.()
      this.resolveConnectionPromise = null
    } else {
      logger.warn(
        `Received setupComplete but status was unexpected: ${this.status}. Setting to OPEN.`
      )
      this.status = 'OPEN'
    }
  }

  async sendClientContent(
    turns: Content[],
    turnComplete: boolean
  ): Promise<void> {
    const payload: { clientContent: BidiGenerateContentClientContent } = {
      clientContent: {
        turns: turns,
        turnComplete: turnComplete,
      },
    }
    logger.info(`Sending Client Content Turn`, payload)
    return this.sendJson(payload)
  }

  async sendAudioStreamEndSignal(): Promise<void> {
    const payload = { realtimeInput: { audioStreamEnd: true } }

    if (this.status === 'OPEN') {
      logger.info('Sending audioStreamEnd=true')
      try {
        await this.sendJson(payload)
      } catch (error) {
        logger.error('Failed to send audioStreamEnd signal:', error)
        throw error
      }
    } else {
      const errorMsg = `WebSocket not OPEN (state: ${this.status}). Cannot send audioStreamEnd.`
      logger.warn(errorMsg)
      return Promise.reject(new Error(errorMsg))
    }
  }

  private notifyError(errorMessage: string): void {
    if (this.messageCallback) {
      this.messageCallback({
        messageType: 'error',
        payload: { error: errorMessage },
      })
    } else {
      logger.error(
        'Error occurred but no message callback is registered:',
        errorMessage
      )
    }
  }

  async sendAudioChunk(base64AudioChunk: string): Promise<void> {
    const payload: { realtimeInput: BidiGenerateContentRealtimeInput } = {
      realtimeInput: {
        audio: { data: base64AudioChunk },
      },
    }
    return this.sendJson(payload)
  }

  async sendImage(base64ImageData: string, mimeType: string): Promise<void> {
    const payload: { realtimeInput: BidiGenerateContentRealtimeInput } = {
      realtimeInput: {
        inlineData: {
          mimeType: mimeType,
          data: base64ImageData,
        },
      },
    }
    logger.info(`Sending Image Input (${mimeType})`)
    return this.sendJson(payload)
  }

  async sendRealtimeVideoFrame(
    base64ImageData: string,
    mimeType?: string
  ): Promise<void> {
    const payload: { realtimeInput: BidiGenerateContentRealtimeInput } = {
      realtimeInput: {
        video: {
          mimeType: mimeType,
          data: base64ImageData,
        } as RealtimeInputVideo,
      },
    }
    logger.info(`Sending Realtime Frame via video field ({mimeType, data})`)
    return this.sendJson(payload)
  }

  async sendTextTurn(text: string, retries = 1): Promise<void> {
    const currentTurnContent: Content = {
      role: 'user',
      parts: [{ text: text }],
    }
    const payload: { clientContent: BidiGenerateContentClientContent } = {
      clientContent: {
        turns: [currentTurnContent],
        turnComplete: true,
      },
    }
    logger.info(`Sending Text Turn:`, JSON.stringify(payload, null, 2))

    try {
      return await this.sendJson(payload)
    } catch (error) {
      if (retries > 0 && this.status === 'OPEN') {
        logger.warn(
          `Text turn send failed, retrying (${retries} attempts left)...`
        )
        return this.sendTextTurn(text, retries - 1)
      }
      throw error
    }
  }

  async sendFunctionResults(results: FunctionResponsePayload[]): Promise<void> {
    if (!Array.isArray(results) || results.length === 0) {
      const errorMsg =
        'Invalid or empty results array provided to sendFunctionResults.'
      logger.warn(errorMsg)
      return Promise.reject(new Error(errorMsg))
    }

    if (
      !results.every(
        r => r && typeof r.id === 'string' && typeof r.response === 'object'
      )
    ) {
      const errorMsg = 'Invalid structure in function results array.'
      logger.error(errorMsg, results)
      return Promise.reject(new Error(errorMsg))
    }

    const payload: { toolResponse: BidiGenerateContentToolResponse } = {
      toolResponse: {
        functionResponses: results,
      },
    }
    logger.info('Sending Function Results:', JSON.stringify(payload, null, 2))
    return this.sendJson(payload)
  }

  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0
    logger.info('Reconnect attempts reset to 0')
  }
}

let instance: GeminiLiveApiClient | null = null

export function getGeminiLiveApiClient(forceNew = false): GeminiLiveApiClient {
  if (forceNew || !instance) {
    logger.info(
      forceNew
        ? 'Creating new GeminiLiveApiClient instance (forced).'
        : 'Creating GeminiLiveApiClient instance.'
    )
    instance = new GeminiLiveApiClientImpl()
  }
  return instance
}

export function resetGeminiLiveApiClient(): void {
  if (instance) {
    try {
      instance.resetReconnectAttempts()
      instance.disconnect()
    } catch (e) {
      logger.warn('Error while disconnecting during reset:', e)
    }
    instance = null
    logger.info('GeminiLiveApiClient instance reset.')
  }
}
