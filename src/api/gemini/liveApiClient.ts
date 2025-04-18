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
  safetySettings?: any[]
}

interface ContentPart {
  text?: string
  inlineData?: {
    mimeType: string
    data: string
  }
  functionCall?: any
  functionResponse?: FunctionResponsePayload
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

interface FunctionResponsePayload {
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
  sendTextTurn(text: string, history: Content[]): Promise<void>
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
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

    if (!this.apiKey || !baseUrl) {
      console.error(
        'Gemini API Key or WebSocket URL base is missing in environment variables.'
      )
      this.status = 'ERROR'
      return
    }

    this.wsUrl = `${baseUrl}?key=${this.apiKey}&alt=json`
    console.log('Gemini Client Initialized.')
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
      console.log('WebSocket already open or connecting.')
      return this.connectionPromise || Promise.resolve()
    }
    if (this.ws) {
      console.warn(
        'Stale WebSocket instance detected. Forcing disconnect before reconnecting.'
      )
      this.disconnect()
    }

    console.log('Attempting to connect WebSocket...')
    this.status = 'CONNECTING'

    this.connectionPromise = new Promise((resolve, reject) => {
      this.resolveConnectionPromise = resolve
      this.rejectConnectionPromise = reject

      try {
        this.ws = new WebSocket(this.wsUrl)

        this.ws.onopen = () => {
          console.log('WebSocket connection established. Sending setup...')
          this.sendSetupMessage().catch(error => {
            console.error('Failed to send setup message:', error)
            this.status = 'ERROR'
            this.rejectConnectionPromise?.(
              new Error('Failed to send setup message')
            )
            this.disconnect()
          })
        }

        this.ws.onmessage = event => {
          this.handleWebSocketMessage(event.data)
        }

        this.ws.onerror = event => {
          console.error('WebSocket Error:', event)
          this.status = 'ERROR'
          this.rejectConnectionPromise?.(
            new Error('WebSocket connection error')
          )
          this.ws = null
          this.connectionPromise = null
        }

        this.ws.onclose = event => {
          console.log(
            `WebSocket Closed: Code=${event.code}, Reason=${event.reason}`
          )
          const wasConnecting = this.status === 'CONNECTING'
          this.status = 'CLOSED'
          this.ws = null
          if (wasConnecting) {
            this.rejectConnectionPromise?.(
              new Error(
                `WebSocket closed unexpectedly during setup: ${event.code}`
              )
            )
          }
          this.connectionPromise = null
          if (this.messageCallback && !event.wasClean) {
            this.messageCallback({
              messageType: 'error',
              payload: {
                error: `WebSocket closed unexpectedly: ${event.code}`,
                code: event.code,
                reason: event.reason,
              },
            })
          }
        }
      } catch (error) {
        console.error('Failed to create WebSocket:', error)
        this.status = 'ERROR'
        reject(error)
        this.connectionPromise = null
      }
    })
    return this.connectionPromise
  }

  disconnect(): void {
    if (this.ws) {
      console.log('Disconnecting WebSocket...')
      if (this.status !== 'CLOSED' && this.status !== 'CLOSING') {
        this.status = 'CLOSING'
        this.ws.close(1000, 'Client initiated disconnect')
      }
      this.ws = null
    }
    this.status = 'CLOSED'
    this.connectionPromise = null
    this.resolveConnectionPromise = null
    this.rejectConnectionPromise = null
  }

  private async sendJson(payload: object): Promise<void> {
    if (this.status !== 'OPEN') {
      const payloadType = Object.keys(payload)[0] || 'unknown'
      console.error(
        `Client: WebSocket not open (state: ${this.status}). Cannot send ${payloadType} message.`
      )
      throw new Error(
        `WebSocket connection is not open (state: ${this.status}).`
      )
    }
    if (!this.ws) {
      console.error('Client: WebSocket instance is null despite OPEN status.')
      this.status = 'ERROR'
      throw new Error('Internal error: WebSocket instance is null.')
    }
    try {
      const jsonString = JSON.stringify(payload)
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(jsonString)
      } else {
        console.error(
          `Client: ws.send() SKIPPED. ReadyState: ${this.ws?.readyState}`
        )
        throw new Error(
          `WebSocket not ready to send (state: ${this.ws?.readyState}).`
        )
      }
    } catch (error) {
      console.error(
        'Client: Failed to send WebSocket message:',
        error,
        'Payload:',
        payload
      )
      this.status = 'ERROR'
      throw error
    }
  }

  private async sendSetupMessage(): Promise<void> {
    const translatedTools = this.translateTools(assistantTools)

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
        tools: translatedTools,
        realtimeInputConfig: {
          automaticActivityDetection: {},
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
        },
        // This is not needed for now
        // safetySettings: [
        //   {
        //       "category": "HARM_CATEGORY_HARASSMENT",
        //       "threshold": assistantConfig.safetySettings.harassment || "HARM_BLOCK_THRESHOLD_UNSPECIFIED"
        //   },
        //   {
        //       "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
        //       "threshold": assistantConfig.safetySettings.dangerousContent || "HARM_BLOCK_THRESHOLD_UNSPECIFIED"
        //   },
        //   {
        //       "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        //       "threshold": assistantConfig.safetySettings.sexualityExplicit || "HARM_BLOCK_THRESHOLD_UNSPECIFIED"
        //   },
        //   {
        //       "category": "HARM_CATEGORY_HATE_SPEECH",
        //       "threshold": assistantConfig.safetySettings.hateSpeech || "HARM_BLOCK_THRESHOLD_UNSPECIFIED"
        //   },
        //   {
        //       "category": "HARM_CATEGORY_CIVIC_INTEGRITY",
        //       "threshold": assistantConfig.safetySettings.civicIntegrity || "HARM_BLOCK_THRESHOLD_UNSPECIFIED"
        //   }
        // ],
      },
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      throw new Error('WebSocket not ready for setup message.')
    this.ws.send(JSON.stringify(setupPayload))
  }

  private handleWebSocketMessage(eventData: any): void {
    if (eventData instanceof Blob) {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          if (typeof reader.result === 'string') {
            this.processJsonMessage(reader.result)
          } else {
            console.error('Failed to read Blob as text:', reader.result)
            this.notifyError('Failed to read Blob data')
          }
        } catch (error) {
          console.error(
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
        console.error('Error reading Blob data:', event)
        this.notifyError('Error reading incoming Blob')
      }
      reader.readAsText(eventData)
    } else if (typeof eventData === 'string') {
      try {
        this.processJsonMessage(eventData)
      } catch (error) {
        console.error(
          'Failed to parse incoming WebSocket message string:',
          error,
          'Raw String Data:',
          eventData
        )
        this.notifyError(
          `Failed to parse message: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    } else {
      console.error(
        'Received unexpected WebSocket message data type:',
        typeof eventData,
        eventData
      )
      this.notifyError(`Unexpected message data type: ${typeof eventData}`)
    }
  }

  private processJsonMessage(jsonString: string): void {
    let message
    try {
      message = JSON.parse(jsonString)

      let serverMsg: ServerMessage = {
        messageType: 'unknown',
        payload: message,
      }

      if ('setupComplete' in message) {
        console.log('Setup Complete received from server.')
        serverMsg = {
          messageType: 'setupComplete',
          payload: message.setupComplete,
        }
        if (this.status === 'CONNECTING') {
          this.status = 'OPEN'
          this.resolveConnectionPromise?.()
        } else {
          console.warn(
            "Received setupComplete but status wasn't CONNECTING. Current status:",
            this.status
          )
        }
      } else if ('serverContent' in message) {
        serverMsg = {
          messageType: 'serverContent',
          payload: message.serverContent,
          usageMetadata: message.usageMetadata,
        }
      } else if ('toolCall' in message) {
        serverMsg = {
          messageType: 'toolCall',
          payload: message.toolCall,
          usageMetadata: message.usageMetadata,
        }
      } else if ('goAway' in message) {
        serverMsg = { messageType: 'goAway', payload: message.goAway }
        console.warn('Received GoAway message from server. Disconnecting soon.')
      } else {
        console.warn(
          'Received unhandled JSON message structure from server:',
          message
        )
        serverMsg.payload = { error: 'Unhandled JSON structure', data: message }
      }

      if (this.messageCallback) {
        this.messageCallback(serverMsg)
      }
    } catch (error) {
      console.error(
        'JSON parsing failed for message string:',
        error,
        'String Data:',
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
    if (this.status === 'OPEN' && this.ws) {
      console.log('Client: Sending audioStreamEnd=true')
      try {
        await this.sendJson(payload)
      } catch (error) {
        console.error('Client: Failed to send audioStreamEnd signal:', error)
      }
    } else {
      console.warn(
        'WebSocket not OPEN, cannot send audioStreamEnd signal. Status:',
        this.status
      )
    }
  }

  private notifyError(errorMessage: string): void {
    if (this.messageCallback) {
      this.messageCallback({
        messageType: 'error',
        payload: { error: errorMessage },
      })
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
    console.log('Client: Sending Image Input')
    await this.sendJson(payload)
  }

  async sendTextTurn(text: string, history: Content[]): Promise<void> {
    const currentTurnContent: Content = {
      role: 'user',
      parts: [{ text: text }],
    }

    const uniqueHistory = history.filter(
      turn =>
        !(
          turn.role === 'user' &&
          turn.parts.length === 1 &&
          turn.parts[0].text === text
        )
    )

    const turnsPayload = [...uniqueHistory, currentTurnContent]

    const payload: { clientContent: BidiGenerateContentClientContent } = {
      clientContent: {
        turns: turnsPayload,
        turnComplete: true,
      },
    }
    console.log(
      `Client: Sending Text Turn (History length: ${uniqueHistory.length})`
    )
    await this.sendJson(payload)
  }

  async sendFunctionResults(results: FunctionResponsePayload[]): Promise<void> {
    const payload: { toolResponse: BidiGenerateContentToolResponse } = {
      toolResponse: {
        functionResponses: results,
      },
    }
    console.log(
      'Client: Sending Function Results:',
      JSON.stringify(payload, null, 2)
    )
    await this.sendJson(payload)
  }

  private translateTools(toolsToTranslate: any[]): GeminiTool[] {
    if (!Array.isArray(toolsToTranslate)) {
      console.warn('translateTools received non-array input:', toolsToTranslate)
      return []
    }

    const geminiTools: GeminiTool[] = toolsToTranslate
      .map(tool => {
        if (tool && tool.type === 'function' && tool.function) {
          const func = tool.function
          const properties: { [key: string]: any } = {}
          let requiredParams: string[] = []

          if (
            func.parameters &&
            func.parameters.type === 'object' &&
            func.parameters.properties
          ) {
            requiredParams = func.parameters.required || []
            for (const [key, value] of Object.entries(
              func.parameters.properties as any
            )) {
              if (value && typeof value === 'object') {
                properties[key] = {
                  type: this.mapTypeToGemini((value as { type?: string }).type),
                  description:
                    (value as { description?: string }).description || '',
                  ...((value as { enum?: string[] }).enum && {
                    enum: (value as { enum: string[] }).enum,
                  }),
                }
              } else {
                console.warn(
                  `Skipping invalid property definition for key "${key}" in tool "${func.name}":`,
                  value
                )
              }
            }
          } else if (func.parameters) {
            console.warn(
              `Unsupported parameters structure for tool "${func.name}":`,
              func.parameters
            )
          }

          const declaration: GeminiFunctionDeclaration = {
            name: func.name,
            description: func.description || '',
            parameters:
              Object.keys(properties).length > 0
                ? {
                    type: 'OBJECT',
                    properties: properties,
                    ...(requiredParams.length > 0 && {
                      required: requiredParams,
                    }),
                  }
                : undefined,
          }

          return {
            functionDeclarations: [declaration],
          }
        }
        if (tool && tool.type) {
          console.warn(
            'Skipping translation for unsupported tool type:',
            tool.type
          )
        } else if (tool) {
          console.warn('Skipping translation for invalid tool object:', tool)
        }
        return null
      })
      .filter((t): t is GeminiTool => t !== null)

    return geminiTools
  }

  private mapTypeToGemini(type: string | undefined): string {
    if (!type) return 'STRING'

    switch (type.toLowerCase()) {
      case 'string':
        return 'STRING'
      case 'number':
        return 'NUMBER'
      case 'integer':
        return 'INTEGER'
      case 'boolean':
        return 'BOOLEAN'
      case 'array':
        return 'ARRAY'
      case 'object':
        return 'OBJECT'
      default:
        console.warn(
          `Unsupported parameter type encountered: ${type}, defaulting to STRING`
        )
        return 'STRING'
    }
  }
}

let instance: GeminiLiveApiClient | null = null

export function getGeminiLiveApiClient(): GeminiLiveApiClient {
  if (!instance) {
    console.log('Creating GeminiLiveApiClient instance.')
    instance = new GeminiLiveApiClientImpl()
  }
  return instance
}
