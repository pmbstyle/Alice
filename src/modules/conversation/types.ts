/**
 * Lifecycle events emitted while we consume the streaming response from the LLM.
 * The store will translate these events into Pinia state updates.
 */
import type OpenAI from 'openai'
import type { AppChatMessageContentPart } from '../../types/chat'
import type { AudioState } from '../../stores/generalStore'

export type ConversationStreamEvent =
  | {
      type: 'response-created'
      responseId: string
    }
  | {
      type: 'assistant-message-started'
      messageId: string
    }
  | {
      type: 'assistant-text-delta'
      textDelta: string
    }
  | {
      type: 'assistant-sentence'
      sentence: string
    }
  | {
      type: 'tool-call-delta'
      toolCallId: string
      argumentsDelta: string
    }
  | {
      type: 'tool-call-completed'
      toolCall: any
    }
  | {
      type: 'image-partial'
      generationId: string
      base64: string
      partialIndex: number
    }
  | {
      type: 'image-final'
      generationId: string
      base64: string
    }
  | {
      type: 'error'
      error: unknown
    }
  | {
      type: 'completed'
    }

export interface StreamProcessingOptions {
  /**
   * When true we avoid triggering summarisation logic after the stream finishes,
   * because another follow-up call will continue the response.
   */
  isContinuationAfterTool?: boolean
}

export interface StreamProcessingResult {
  streamEndedNormally: boolean
}

/**
 * Functions that the stream handler needs from the host store / services.
 */
export interface StreamHandlerDependencies {
  appendAssistantDelta(delta: string): void
  setAssistantResponseId(responseId: string): void
  setAssistantMessageId(messageId: string): void
  addToolCall(call: any): void
  handleToolCall(call: any): Promise<void>
  handleImagePartial(
    generationId: string,
    base64: string,
    partialIndex: number
  ): Promise<void>
  handleImageFinal(generationId: string, base64: string): Promise<void>
  enqueueSpeech(sentence: string): Promise<void>
  setAudioState(state: string): void
  getAudioState(): string
  handleStreamError(error: unknown): void
}

export interface ConversationStreamHandler {
  process({
    stream,
    options,
  }: {
    stream: AsyncIterable<any>
    options?: StreamProcessingOptions
  }): Promise<StreamProcessingResult>
}

export interface ToolCallHandlerDependencies {
  getToolStatusMessage(toolName: string, args?: object): string
  addSystemMessage(messageText: string): void
  addToolMessage(params: {
    toolCallId: string
    functionName: string
    content: string
  }): void
  executeFunction(functionName: string, args: object): Promise<string>
  buildApiInput(
    isNewChainAfterTool: boolean
  ): Promise<OpenAI.Responses.Request.InputItemLike[]>
  createAssistantPlaceholder(): string
  createAbortController(): AbortController
  setLlmAbortController(controller: AbortController): void
  createOpenAIResponse(
    input: OpenAI.Responses.Request.InputItemLike[],
    responseId: string | null,
    isContinuationAfterTool: boolean,
    systemPrompt: string,
    signal: AbortSignal
  ): Promise<AsyncIterable<OpenAI.Responses.StreamEvent>>
  processStream(
    stream: AsyncIterable<OpenAI.Responses.StreamEvent>,
    placeholderTempId: string,
    isContinuationAfterTool: boolean
  ): Promise<void>
  parseErrorMessage(error: unknown): AppChatMessageContentPart
  updateMessageContent(
    placeholderTempId: string,
    content: AppChatMessageContentPart[]
  ): void
  setAudioState(state: AudioState): void
  isRecordingRequested(): boolean
  getAssistantSystemPrompt(): string
  getCurrentResponseId(): string | null
  setCurrentResponseId(responseId: string | null): void
  logError(...args: any[]): void
  logInfo(...args: any[]): void
}

export interface ToolCallHandler {
  handleToolCall(params: {
    toolCall: OpenAI.Responses.FunctionCall
    originalResponseIdForTool: string | null
  }): Promise<void>
}
