export interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[]
}

export interface GeminiFunctionDeclaration {
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

export interface BidiGenerateContentSetup {
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

export interface ContentPart {
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

export interface BidiGenerateContentClientContent {
  turns: Content[]
  turnComplete?: boolean
}

export interface RealtimeInputAudio {
  data: string
}

export interface RealtimeInputInlineData {
  mimeType: string
  data: string
}

export interface BidiGenerateContentRealtimeInput {
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

export interface FunctionResponsePart {
  name: string
  response: any
}

export interface BidiGenerateContentToolResponse {
  functionResponses: FunctionResponsePayload[]
}

export interface ServerMessagePayloads {
  setupComplete?: any
  serverContent?: any
  toolCall?: any
  goAway?: any
  error?: any
  sessionResumptionUpdate?: any
}

export interface UsageMetadata {
  promptTokenCount?: number
  responseTokenCount?: number
  totalTokenCount?: number
}

export interface ServerMessage {
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

export interface ConnectionOptions {
  timeoutMs?: number
  retries?: number
}

export interface ServerContentPayload {
  interrupted?: boolean
  turnComplete?: boolean
  modelTurn?: { parts: any[] }
}

export type WebSocketStatus =
  | 'IDLE'
  | 'CONNECTING'
  | 'OPEN'
  | 'CLOSING'
  | 'CLOSED'
  | 'ERROR'
  | 'RECONNECTING'

export interface GeminiLiveApiClient {
  connect(options?: ConnectionOptions): Promise<void>
  disconnect(): void
  sendAudioChunk(base64AudioChunk: string): Promise<void>
  sendImage(base64ImageData: string, mimeType: string): Promise<void>
  sendTextTurn(text: string): Promise<void>
  sendFunctionResults(results: FunctionResponsePayload[]): Promise<void>
  onMessage(callback: (message: ServerMessage) => void): void
  getStatus(): WebSocketStatus
  sendClientContent(turns: Content[], turnComplete: boolean): Promise<void>
  sendAudioStreamEndSignal(): Promise<void>
  resetReconnectAttempts(): void
}