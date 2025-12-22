import type OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'
import { getOpenRouterClient } from '../apiClients'
import { convertOpenRouterStreamToResponsesFormat } from './streamAdapters'
import { buildToolsForProvider } from './tools'

export const listOpenRouterModels = async (): Promise<OpenAI.Models.Model[]> => {
  const client = getOpenRouterClient()
  const modelsPage = await client.models.list()

  return modelsPage.data
    .filter(model => {
      const id = model.id
      const isExcluded =
        id.includes('instruct') ||
        id.includes('code') ||
        id.includes('completion') ||
        id.includes('embed') ||
        id.includes('moderate') ||
        id.includes('whisper') ||
        id.includes('tts') ||
        id.includes('dall-e') ||
        id.includes('moderation')

      return !isExcluded
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export const createOpenRouterResponse = async (
  input: OpenAI.Responses.Request.InputItemLike[],
  _previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> => {
  const client = getOpenRouterClient()
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

        const openRouterToolCalls = toolCalls
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
          tool_calls: openRouterToolCalls,
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
    .filter(msg => msg.content.trim())

  if (customInstructions && !messages.some(msg => msg.role === 'system')) {
    const openrouterSystemPrompt =
      customInstructions +
      '\n\nIMPORTANT: You have built-in web search capabilities. When you need to search the web or get current information, you can directly search without using any tools. Do NOT use open_path or other tools for web searches.'

    messages.unshift({
      role: 'system',
      content: openrouterSystemPrompt,
    })
  }

  console.log('[OpenRouter] Final messages:', JSON.stringify(messages, null, 2))

  const openrouterModel = settings.assistantModel || 'gpt-4.1-mini'
  const modelWithWebSearch = openrouterModel.includes(':online')
    ? openrouterModel
    : `${openrouterModel}:online`

  const params: OpenAI.Chat.ChatCompletionCreateParams = {
    model: modelWithWebSearch,
    messages: messages,
    ...(!settings.assistantModel.startsWith('gpt-5')
      ? {
          temperature: settings.assistantTemperature,
          top_p: settings.assistantTopP,
        }
      : {}),
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
    const openrouterStream = await client.chat.completions.create(params as any, {
      signal,
    })
    return convertOpenRouterStreamToResponsesFormat(openrouterStream)
  }

  return client.chat.completions.create(params as any, { signal })
}
