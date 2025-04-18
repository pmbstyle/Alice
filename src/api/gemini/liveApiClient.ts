import { assistantTools } from '../../utils/assistantTools'
import { assistantConfig } from '../../config/assistantConfig'

interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[]
}

interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters?: {
    type: 'OBJECT'
    properties: {
      [key: string]: {
        type: string
        description: string
        enum?: string[]
      }
    }
    required?: string[]
  }
}

interface BidiGenerateContentSetup {
  model: string
  generationConfig?: any
  tools?: GeminiTool[]
  realtimeInputConfig?: any
  systemInstruction?: Content
  sessionResumption?: {}
  contextWindowCompression?: {
    slidingWindow?: {}
  }
}

interface ContentPart {
  text?: string
  inlineData?: {
    mimeType: string
    data: string
  }
  functionCall?: any
  functionResponse?: FunctionResponsePart
}

export interface Content {
  role: 'user' | 'model'
  parts: ContentPart[]
}

interface BidiGenerateContentClientContent {
  turns: Content[]
  turnComplete?: boolean
}

interface RealtimeInputAudio {
  data: string
}

interface RealtimeInputInlineData {
  mimeType: string
  data: string
}

interface BidiGenerateContentRealtimeInput {
  audio?: RealtimeInputAudio
  inlineData?: RealtimeInputInlineData
  text?: string
  audioStreamEnd?: boolean
}

export interface FunctionResponsePayload {
  id: string
  response: {
    output?: any
    error?: any
  }
}

interface FunctionResponsePart {
  name: string
  response: any
}

interface BidiGenerateContentToolResponse {
  functionResponses: FunctionResponsePayload[]
}

interface ServerMessagePayloads {
  setupComplete?: any
  serverContent?: any
  toolCall?: any
  goAway?: any
  error?: any
  sessionResumptionUpdate?: any
}

interface UsageMetadata {
  promptTokenCount?: number
  responseTokenCount?: number
  totalTokenCount?: number
}

interface ServerMessage {
  messageType: keyof ServerMessagePayloads | 'unknown'
  payload: any
  usageMetadata?: UsageMetadata
}

export interface BidiGenerateContentToolCall {
  functionCalls: LiveFunctionCall[]
}

export interface LiveFunctionCall {
  id: string
  name: string
  args: { [key: string]: any }
}

type WebSocketStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'OPEN'
  | 'CLOSING'
  | 'CLOSED'
  | 'ERROR'

export interface GeminiLiveApiClient {
  connect(): Promise<void>
  disconnect(): void
  sendAudioChunk(base64AudioChunk: string): Promise<void>
  sendImage(base64ImageData: string, mimeType: string): Promise<void>
  sendTextTurn(text: string): Promise<void>
  sendFunctionResults(results: FunctionResponsePayload[]): Promise<void>
  onMessage(callback: (message: ServerMessage) => void): void
  getStatus(): WebSocketStatus
  sendClientContent(turns: Content[], turnComplete: boolean): Promise<void>
  sendAudioStreamEndSignal(): Promise<void>
}

class GeminiLiveApiClientImpl implements GeminiLiveApiClient {
  private ws: WebSocket | null = null
  private apiKey: string
  private wsUrl: string
  private status: WebSocketStatus = 'IDLE'
  private messageCallback: ((message: ServerMessage) => void) | null = null
  private connectionPromise: Promise<void> | null = null
  private resolveConnectionPromise: (() => void) | null = null
  private rejectConnectionPromise: ((reason?: any) => void) | null = null

  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY
    const baseUrl =
      import.meta.env.VITE_GEMINI_WS_URL ||
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'

    if (!this.apiKey || !baseUrl) {
      console.error(
        '[API Client] Gemini API Key or WebSocket URL base is missing in environment variables.'
      )
      this.status = 'ERROR'
      return
    }

    this.wsUrl = `${baseUrl}?key=${this.apiKey}`
    console.log('[API Client] Gemini Client Initialized.')
  }

  getStatus(): WebSocketStatus {
    return this.status
  }

  onMessage(callback: (message: ServerMessage) => void): void {
    this.messageCallback = callback
  }

  connect(): Promise<void> {
    if (this.status === 'ERROR' && (!this.apiKey || !this.wsUrl)) {
      return Promise.reject(
        new Error('Gemini API Key or WebSocket URL is missing. Cannot connect.')
      )
    }
    if (this.status === 'OPEN' || this.status === 'CONNECTING') {
      console.log('[API Client] WebSocket already open or connecting.')
      return this.connectionPromise || Promise.resolve()
    }
    if (this.ws) {
      console.warn(
        '[API Client] Stale WebSocket instance detected. Forcing disconnect before reconnecting.'
      )
      this.disconnect()
    }

    console.log('[API Client] Attempting to connect WebSocket...')
    this.status = 'CONNECTING'

    this.connectionPromise = new Promise((resolve, reject) => {
      this.resolveConnectionPromise = resolve
      this.rejectConnectionPromise = reject

      try {
        this.ws = new WebSocket(this.wsUrl)
        this.ws.binaryType = 'blob'

        this.ws.onopen = () => {
          this.status = 'OPEN'
          console.log(
            `[API Client] WebSocket connection established (readyState: ${this.ws?.readyState}). Status set to OPEN. Sending setup...`
          )

          this.sendSetupMessage().catch(error => {
            console.error('[API Client] Failed to send setup message:', error)
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
            console.error(
              '[API Client] Received non-Blob message, which is unexpected:',
              event.data
            )
          }
        }

        this.ws.onerror = event => {
          console.error('[API Client] WebSocket Error:', event)
          const errorReason =
            event instanceof ErrorEvent
              ? event.message
              : 'Unknown WebSocket error'
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
          console.log(
            `[API Client] WebSocket Closed: Code=${event.code}, Reason=${event.reason || 'No reason specified'}`
          )
          const wasConnecting = this.status === 'CONNECTING'
          const previousStatus = this.status
          this.status = 'CLOSED'
          this.ws = null

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
      } catch (error: any) {
        console.error('[API Client] Failed to create WebSocket:', error)
        this.status = 'ERROR'
        reject(new Error(`Failed to create WebSocket: ${error.message}`))
        this.connectionPromise = null
      }
    })
    return this.connectionPromise
  }

  disconnect(): void {
    if (this.ws) {
      console.log(
        `[API Client] Disconnecting WebSocket (readyState: ${this.ws.readyState})...`
      )
      if (this.status !== 'CLOSED' && this.status !== 'CLOSING') {
        this.status = 'CLOSING'
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          try {
            this.ws.close(1000, 'Client initiated disconnect')
            console.log('[API Client] WebSocket close() called.')
          } catch (e) {
            console.error('[API Client] Error calling WebSocket close():', e)
          }
        } else {
          console.log(
            `[API Client] WebSocket not in OPEN/CONNECTING state (is ${this.ws.readyState}), skipping close() call.`
          )
        }
      }
      this.ws = null
    } else {
      console.log(
        '[API Client] Disconnect called but WebSocket instance was already null.'
      )
    }
    if (this.status !== 'CLOSED') {
      this.status = 'CLOSED'
      console.log('[API Client] Status set to CLOSED.')
    }

    if (this.rejectConnectionPromise && this.status !== 'OPEN') {
      this.rejectConnectionPromise(
        new Error('Connection attempt cancelled by disconnect.')
      )
    }
    this.connectionPromise = null
    this.resolveConnectionPromise = null
    this.rejectConnectionPromise = null
  }

  private async sendJson(payload: object): Promise<void> {
    const isSetupMessage = 'setup' in payload

    if (
      this.status !== 'OPEN' &&
      !(isSetupMessage && this.ws?.readyState === WebSocket.OPEN)
    ) {
      const payloadType = Object.keys(payload)[0] || 'unknown'
      const errorMsg = `[API Client] WebSocket not ready to send ${payloadType}. Status: ${this.status}, ReadyState: ${this.ws?.readyState}.`
      console.error(errorMsg)
      return Promise.reject(new Error(errorMsg))
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const errorMsg = `[API Client] ws.send() SKIPPED. WebSocket instance is null or not in OPEN state (current state: ${this.ws?.readyState}, status: ${this.status})`
      console.error(errorMsg)
      if (this.status === 'OPEN') {
        console.warn(
          '[API Client] Status discrepancy: Status is OPEN but readyState is not. Setting status to ERROR.'
        )
        this.status = 'ERROR'
      }
      return Promise.reject(new Error(errorMsg))
    }

    try {
      const jsonString = JSON.stringify(payload)
      this.ws.send(jsonString)
    } catch (error) {
      console.error(
        '[API Client] Failed to send WebSocket message:',
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
    console.debug(
      '[API Client] Sent setup message:',
      JSON.stringify(setupPayload, null, 2)
    )
  }

  private handleWebSocketMessage(blobData: Blob): void {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        if (typeof reader.result === 'string') {
          this.processJsonMessage(reader.result)
        } else {
          console.error(
            '[API Client] Failed to read Blob as text:',
            reader.result
          )
          this.notifyError('Failed to read Blob data')
        }
      } catch (error) {
        console.error(
          '[API Client] Error processing text from Blob:',
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
      console.error('[API Client] Error reading Blob data:', event)
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

      const hasToolCall = 'toolCall' in message

      if (hasToolCall) {
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
        if (this.status === 'CONNECTING' || this.status === 'OPEN') {
          if (this.status === 'CONNECTING') {
            console.log(
              '[API Client] Received setupComplete. Updating status from CONNECTING to OPEN.'
            )
            this.status = 'OPEN'
          }
          this.resolveConnectionPromise?.()
          this.resolveConnectionPromise = null
        } else {
          console.warn(
            `[API Client] Received setupComplete but status was unexpected: ${this.status}. Setting to OPEN.`
          )
          this.status = 'OPEN'
        }
      } else if ('serverContent' in message) {
        serverMsg = {
          messageType: 'serverContent',
          payload: message.serverContent,
          usageMetadata: message.usageMetadata,
        }
      } else if ('goAway' in message) {
        console.log(`[API Client] --> Identified as goAway.`)
        serverMsg = { messageType: 'goAway', payload: message.goAway }
        console.warn('[API Client] Received GoAway message from server.')
      } else if ('error' in message) {
        console.log(`[API Client] --> Identified as error.`)
        serverMsg = { messageType: 'error', payload: message.error }
        console.error(
          '[API Client] Received explicit error from server:',
          message.error
        )
        this.status = 'ERROR'
        this.notifyError(`Server error: ${JSON.stringify(message.error)}`)
      } else if ('sessionResumptionUpdate' in message) {
        console.log(`[API Client] --> Identified as sessionResumptionUpdate.`)
        serverMsg = {
          messageType: 'sessionResumptionUpdate',
          payload: message.sessionResumptionUpdate,
        }
      } else {
        console.warn(
          '[API Client] Received unhandled JSON message structure (no known top-level key found):',
          message
        )
        serverMsg.payload = { error: 'Unhandled JSON structure', data: message }
      }

      if (this.messageCallback) {
        this.messageCallback(serverMsg)
      } else {
        console.warn(
          '[API Client] No message callback registered to handle:',
          serverMsg
        )
      }
    } catch (error) {
      console.error(
        '[API Client] JSON parsing failed for message string:',
        error,
        'Raw String Data:',
        jsonString
      )
      this.notifyError(
        `JSON parsing failed: ${error instanceof Error ? error.message : String(error)}`
      )
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
    await this.sendJson(payload)
  }

  async sendAudioStreamEndSignal(): Promise<void> {
    const payload = { realtimeInput: { audioStreamEnd: true } }
    if (this.status === 'OPEN') {
      console.log('[API Client] Sending audioStreamEnd=true')
      try {
        await this.sendJson(payload)
      } catch (error) {
        console.error(
          '[API Client] Failed to send audioStreamEnd signal:',
          error
        )
        throw error
      }
    } else {
      const errorMsg = `[API Client] WebSocket not OPEN (state: ${this.status}). Cannot send audioStreamEnd.`
      console.warn(errorMsg)
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
      console.error(
        '[API Client] Error occurred but no message callback is registered:',
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
    await this.sendJson(payload)
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
    console.log(`[API Client] Sending Image Input (${mimeType})`)
    await this.sendJson(payload)
  }

  async sendTextTurn(text: string): Promise<void> {
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
    console.log(
      `[API Client] Sending Text Turn:`,
      JSON.stringify(payload, null, 2)
    )
    await this.sendJson(payload)
  }

  async sendFunctionResults(results: FunctionResponsePayload[]): Promise<void> {
    if (!Array.isArray(results) || results.length === 0) {
      const errorMsg =
        '[API Client] Invalid or empty results array provided to sendFunctionResults.'
      console.warn(errorMsg)
      return Promise.reject(new Error(errorMsg))
    }
    if (
      !results.every(
        r => r && typeof r.id === 'string' && typeof r.response === 'object'
      )
    ) {
      const errorMsg =
        '[API Client] Invalid structure in function results array.'
      console.error(errorMsg, results)
      return Promise.reject(new Error(errorMsg))
    }

    const payload: { toolResponse: BidiGenerateContentToolResponse } = {
      toolResponse: {
        functionResponses: results,
      },
    }
    console.log(
      '[API Client] Sending Function Results:',
      JSON.stringify(payload, null, 2)
    )
    await this.sendJson(payload)
  }
}

let instance: GeminiLiveApiClient | null = null

export function getGeminiLiveApiClient(): GeminiLiveApiClient {
  if (!instance) {
    console.log('[API Client] Creating GeminiLiveApiClient instance.')
    instance = new GeminiLiveApiClientImpl()
  }
  return instance
}
