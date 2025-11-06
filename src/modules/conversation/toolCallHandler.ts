import type OpenAI from 'openai'
import type {
  ToolCallHandler,
  ToolCallHandlerDependencies,
} from './types'
import type { AudioState } from '../../stores/generalStore'

const PREVIOUS_RESPONSE_NOT_FOUND = 'Previous response with id'
const NOT_FOUND_SUFFIX = 'not found'

function isAbortError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { name?: string }).name === 'AbortError'
  )
}

function isPreviousResponseMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = (error as { message?: string }).message || ''
  return (
    message.includes(PREVIOUS_RESPONSE_NOT_FOUND) &&
    message.includes(NOT_FOUND_SUFFIX)
  )
}

export function createToolCallHandler(
  dependencies: ToolCallHandlerDependencies
): ToolCallHandler {
  return {
    async handleToolCall({
      toolCall,
      originalResponseIdForTool,
    }: {
      toolCall: OpenAI.Responses.FunctionCall
      originalResponseIdForTool: string | null
    }): Promise<void> {
      const functionName = toolCall.name
      const functionArgs =
        (toolCall.arguments as object | undefined) ?? {}

      const statusMessage = dependencies.getToolStatusMessage(
        functionName,
        functionArgs
      )
      if (statusMessage) {
        dependencies.addSystemMessage(statusMessage)
      }

      let resultString: string
      try {
        resultString = await dependencies.executeFunction(
          functionName,
          functionArgs
        )
      } catch (error: any) {
        dependencies.logError('Tool execution failed:', error)
        const errorMessage = error?.message || 'Unknown error'
        resultString = `Error: Tool execution failed - ${errorMessage}`
      }

      dependencies.addToolMessage({
        toolCallId: toolCall.call_id,
        functionName,
        content: resultString,
      })

      const isNewChainAfterTool =
        dependencies.getCurrentResponseId() === null
      const nextApiInput = await dependencies.buildApiInput(
        isNewChainAfterTool
      )

      const placeholderTempId =
        dependencies.createAssistantPlaceholder()

      const abortController = dependencies.createAbortController()
      dependencies.setLlmAbortController(abortController)

      const attemptContinuation = async (
        responseId: string | null
      ) => {
        const systemPrompt = dependencies.getAssistantSystemPrompt()
        const stream = await dependencies.createOpenAIResponse(
          nextApiInput,
          responseId,
          true,
          systemPrompt,
          abortController.signal
        )
        await dependencies.processStream(
          stream,
          placeholderTempId,
          true
        )
      }

      try {
        await attemptContinuation(originalResponseIdForTool)
        return
      } catch (error) {
        if (isAbortError(error)) {
          return
        }

        dependencies.logError(
          'Error in continued stream after tool call:',
          error
        )

        if (isPreviousResponseMissingError(error)) {
          dependencies.logInfo(
            '[Error Recovery] Previous response ID not found in tool continuation, clearing and starting new chain'
          )
          dependencies.setCurrentResponseId(null)

          try {
            dependencies.logInfo(
              '[Error Recovery] Retrying tool continuation without previous response ID'
            )
            await attemptContinuation(null)
            return
          } catch (retryError) {
            if (!isAbortError(retryError)) {
              dependencies.logError(
                '[Error Recovery] Retry also failed:',
                retryError
              )
            }
          }
        }

        const errorContent = dependencies.parseErrorMessage(error)
        dependencies.updateMessageContent(placeholderTempId, [
          errorContent,
        ])

        const nextAudioState: AudioState = dependencies.isRecordingRequested()
          ? 'LISTENING'
          : 'IDLE'
        dependencies.setAudioState(nextAudioState)
      }
    },
  }
}

