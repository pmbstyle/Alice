import type OpenAI from 'openai'
import type { AppChatMessageContentPart } from '../../types/chat'

export type ConversationHistoryRole =
  | 'user'
  | 'assistant'
  | 'system'
  | 'developer'
  | 'tool'

export interface ConversationHistoryMessage {
  local_id_temp?: string
  api_message_id?: string
  api_response_id?: string
  role: ConversationHistoryRole
  content: string | AppChatMessageContentPart[]
  tool_call_id?: string
  name?: string
  tool_calls?: any[]
}

export interface ApiInputBuilderDependencies {
  getChatHistory(): ConversationHistoryMessage[]
  getMaxHistoryMessagesForApi(): number
  getAiProvider(): string
}

export interface ApiInputBuilder {
  build(params: {
    isNewChain: boolean
  }): Promise<OpenAI.Responses.Request.InputItemLike[]>
}

export function createApiInputBuilder(
  dependencies: ApiInputBuilderDependencies
): ApiInputBuilder {
  return {
    async build({ isNewChain }): Promise<
      OpenAI.Responses.Request.InputItemLike[]
    > {
      // `isNewChain` currently does not affect construction but kept for parity.
      void isNewChain

      const historyToBuildFrom = [...dependencies.getChatHistory()]
      const maxHistory = dependencies.getMaxHistoryMessagesForApi()
      const apiInput: OpenAI.Responses.Request.InputItemLike[] = []
      const recentHistory = historyToBuildFrom.slice(0, maxHistory).reverse()

      const lastUserMessageInFullHistoryId = historyToBuildFrom.find(
        msg => msg.role === 'user'
      )?.local_id_temp

      const aiProvider = dependencies.getAiProvider()

      for (const msg of recentHistory) {
        let apiItemPartial: any

        if (msg.role === 'tool') {
          apiItemPartial = {
            type: 'function_call_output',
            call_id: msg.tool_call_id || `unknown_call_id_${Date.now()}`,
            output:
              typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content),
          }
        } else if (msg.role === 'system') {
          apiItemPartial = {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text:
                  typeof msg.content === 'string'
                    ? msg.content
                    : JSON.stringify(msg.content),
              },
            ],
          }
        } else {
          const currentApiRole = msg.role as
            | 'user'
            | 'assistant'
            | 'developer'
          apiItemPartial = { role: currentApiRole, content: [] }
          if (msg.name) apiItemPartial.name = msg.name

          let messageContentParts: OpenAI.Responses.Request.ContentPartLike[] =
            []

          if (typeof msg.content === 'string') {
            const typeForPart =
              currentApiRole === 'user' || currentApiRole === 'developer'
                ? 'input_text'
                : 'output_text'
            messageContentParts = [{ type: typeForPart, text: msg.content }]
          } else if (Array.isArray(msg.content)) {
            const isLastUserMessageWithPotentialImage =
              currentApiRole === 'user' &&
              msg.local_id_temp === lastUserMessageInFullHistoryId

            messageContentParts = msg.content
              .map((appPart: AppChatMessageContentPart) => {
                if (appPart.type === 'app_text') {
                  const typeForPart =
                    currentApiRole === 'user' || currentApiRole === 'developer'
                      ? 'input_text'
                      : 'output_text'
                  return { type: typeForPart, text: appPart.text || '' }
                }

                if (appPart.type === 'app_image_uri') {
                  if (!appPart.uri) return null
                  if (
                    isLastUserMessageWithPotentialImage &&
                    (currentApiRole === 'user' ||
                      currentApiRole === 'developer')
                  ) {
                    return {
                      type: 'input_image',
                      image_url: appPart.uri,
                    } as OpenAI.Responses.Request.InputImagePart
                  }

                  if (
                    currentApiRole === 'user' ||
                    currentApiRole === 'developer'
                  ) {
                    return {
                      type: 'input_text',
                      text: '[User previously sent an image]',
                    }
                  }
                  return null
                }

                if (appPart.type === 'app_file') {
                  if (!appPart.fileId) return null
                  if (
                    currentApiRole === 'user' ||
                    currentApiRole === 'developer'
                  ) {
                    return {
                      type: 'input_file',
                      file_id: appPart.fileId,
                    } as OpenAI.Responses.Request.InputFilePart
                  }
                  return null
                }

                if (appPart.type === 'app_generated_image_path') {
                  if (
                    currentApiRole !== 'user' &&
                    currentApiRole !== 'developer'
                  ) {
                    return {
                      type: 'output_text',
                      text: '[Assistant previously generated an image]',
                    }
                  }
                  return null
                }

                return null
              })
              .filter(Boolean) as OpenAI.Responses.Request.ContentPartLike[]
          }

          apiItemPartial.content =
            messageContentParts.length > 0
              ? messageContentParts
              : [
                  {
                    type:
                      currentApiRole === 'assistant'
                        ? 'output_text'
                        : 'input_text',
                    text: '',
                  },
                ]

          if (
            currentApiRole === 'assistant' &&
            msg.tool_calls &&
            aiProvider === 'openrouter'
          ) {
            apiItemPartial.tool_calls = msg.tool_calls
          }
        }

        apiInput.push(apiItemPartial)
      }

      return apiInput
    },
  }
}

