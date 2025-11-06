/**
 * Lifecycle events emitted while we consume the streaming response from the LLM.
 * The store will translate these events into Pinia state updates.
 */
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
