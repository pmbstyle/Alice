import type OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'
import { getLMStudioClient } from '../apiClients'
import { convertLocalLLMStreamToResponsesFormat } from './streamAdapters'
import { buildToolsForProvider } from './tools'

export const listLMStudioModels = async (): Promise<OpenAI.Models.Model[]> => {
  const client = getLMStudioClient()
  const modelsPage = await client.models.list()
  return modelsPage.data.sort((a, b) => a.id.localeCompare(b.id))
}

export const createLMStudioResponse = async (
  input: OpenAI.Responses.Request.InputItemLike[],
  _previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> => {
  const client = getLMStudioClient()
  const settings = useSettingsStore().config
  const finalToolsForApi = await buildToolsForProvider()

  const messages = input
    .map((item: any) => {
      if (item.role === 'user') {
        if (Array.isArray(item.content)) {
          const textParts = item.content
            .filter((part: any) => part.type === 'input_text' && part.text?.trim())
            .map((part: any) => part.text)
            .join(' ')

          return {
            role: 'user',
            content: textParts || 'Hello',
          }
        } else if (typeof item.content === 'string' && item.content.trim()) {
          return {
            role: 'user',
            content: item.content,
          }
        } else {
          return {
            role: 'user',
            content: 'Hello',
          }
        }
      } else if (item.role === 'assistant') {
        const textContent = Array.isArray(item.content)
          ? item.content
              .filter(
                (part: any) => part.type === 'output_text' && part.text?.trim()
              )
              .map((part: any) => part.text)
              .join(' ')
          : typeof item.content === 'string' && item.content.trim()
            ? item.content
            : null

        const toolCalls = item.tool_calls || null

        const localLLMToolCalls = toolCalls
          ? toolCalls.map((toolCall: any) => ({
              id: toolCall.call_id || toolCall.id,
              type: 'function',
              function: {
                name: toolCall.name,
                arguments:
                  typeof toolCall.arguments === 'string'
                    ? toolCall.arguments
                    : JSON.stringify(toolCall.arguments || {}),
              },
            }))
          : null

        return {
          role: 'assistant',
          content: textContent,
          tool_calls: localLLMToolCalls,
        }
      } else if (item.role === 'system') {
        const content =
          typeof item.content === 'string'
            ? item.content
            : Array.isArray(item.content)
              ? item.content.map(p => p.text || '').join(' ')
              : 'You are a helpful assistant.'

        return {
          role: 'system',
          content: content.trim() || 'You are a helpful assistant.',
        }
      } else if (item.type === 'function_call_output') {
        return {
          role: 'tool',
          tool_call_id: item.call_id,
          content:
            typeof item.output === 'string'
              ? item.output
              : JSON.stringify(item.output),
        }
      }

      return {
        ...item,
        content:
          typeof item.content === 'string' && item.content.trim()
            ? item.content
            : 'Message received.',
      }
    })
    .filter(msg => msg.content?.trim && msg.content.trim())

  if (customInstructions && !messages.some(msg => msg.role === 'system')) {
    messages.unshift({
      role: 'system',
      content: customInstructions,
    })
  }

  console.log('[lm-studio] Final messages:', JSON.stringify(messages, null, 2))

  const params: OpenAI.Chat.ChatCompletionCreateParams = {
    model: settings.assistantModel || 'llama3.2',
    messages: messages,
    temperature: settings.assistantTemperature,
    top_p: settings.assistantTopP,
    tools:
      finalToolsForApi.length > 0
        ? finalToolsForApi.map(tool => {
            if (tool.type === 'function') {
              return {
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                },
              }
            }
            return tool
          })
        : undefined,
    stream: stream,
  }

  if (stream) {
    const localStream = await client.chat.completions.create(params as any, {
      signal,
    })
    return convertLocalLLMStreamToResponsesFormat(localStream, 'lm-studio')
  }

  return client.chat.completions.create(params as any, { signal })
}
