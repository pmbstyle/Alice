import type OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'
import { convertLocalLLMStreamToResponsesFormat } from './streamAdapters'
import { buildToolsForProvider } from './tools'
import { PROVIDER_CONFIGS } from './providerCatalog'

type OpenAIClientGetter = () => OpenAI
type OpenAICompatibleProviderKey = 'zai' | 'minimax'

function convertResponsesInputToChatMessages(
  input: OpenAI.Responses.Request.InputItemLike[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return input
    .map((item: any) => {
      if (item.role === 'user') {
        if (Array.isArray(item.content)) {
          const textParts = item.content
            .filter(
              (part: any) => part.type === 'input_text' && part.text?.trim()
            )
            .map((part: any) => part.text)
            .join(' ')

          return {
            role: 'user',
            content: textParts || 'Hello',
          }
        }

        return {
          role: 'user',
          content:
            typeof item.content === 'string' && item.content.trim()
              ? item.content
              : 'Hello',
        }
      }

      if (item.role === 'assistant') {
        const textContent = Array.isArray(item.content)
          ? item.content
              .filter(
                (part: any) => part.type === 'output_text' && part.text?.trim()
              )
              .map((part: any) => part.text)
              .join(' ')
          : typeof item.content === 'string' && item.content.trim()
            ? item.content
            : ''

        const toolCalls = item.tool_calls || null
        const chatToolCalls = toolCalls
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
          : undefined

        return {
          role: 'assistant',
          content: textContent,
          tool_calls: chatToolCalls,
        }
      }

      if (item.role === 'system') {
        const content =
          typeof item.content === 'string'
            ? item.content
            : Array.isArray(item.content)
              ? item.content.map((part: any) => part.text || '').join(' ')
              : 'You are a helpful assistant.'

        return {
          role: 'system',
          content: content.trim() || 'You are a helpful assistant.',
        }
      }

      if (item.type === 'function_call_output') {
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
    .filter((message: any) => {
      if (message.role === 'assistant' && message.tool_calls?.length) {
        return true
      }
      return typeof message.content === 'string' && message.content.trim()
    })
}

function addCustomInstructions(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  customInstructions?: string
): void {
  if (!customInstructions) {
    return
  }

  const systemIndex = messages.findIndex(message => message.role === 'system')
  if (systemIndex === -1) {
    messages.unshift({
      role: 'system',
      content: customInstructions,
    })
    return
  }

  const existing = String(messages[systemIndex]?.content || '').trim()
  if (!existing.includes(customInstructions.trim())) {
    ;(messages[systemIndex] as any).content = existing
      ? `${customInstructions}\n\n${existing}`
      : customInstructions
  }
}

function convertToolsForChatCompletions(finalToolsForApi: any[]) {
  if (finalToolsForApi.length === 0) {
    return undefined
  }

  return finalToolsForApi.map(tool => {
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
}

export async function listOpenAICompatibleModels(
  getClient: OpenAIClientGetter
): Promise<OpenAI.Models.Model[]> {
  const modelsPage = await getClient().models.list()
  return modelsPage.data.sort((a, b) => a.id.localeCompare(b.id))
}

export async function createOpenAICompatibleResponse(
  provider: OpenAICompatibleProviderKey,
  getClient: OpenAIClientGetter,
  input: OpenAI.Responses.Request.InputItemLike[],
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> {
  const client = getClient()
  const settings = useSettingsStore().config
  const finalToolsForApi = await buildToolsForProvider()
  const messages = convertResponsesInputToChatMessages(input)

  addCustomInstructions(messages, customInstructions)

  console.log(
    `[${provider}] Final messages:`,
    JSON.stringify(messages, null, 2)
  )

  const model =
    settings.assistantModel || PROVIDER_CONFIGS[provider].defaultModel
  const params: OpenAI.Chat.ChatCompletionCreateParams = {
    model,
    messages,
    ...(!model.startsWith('gpt-5')
      ? {
          temperature: settings.assistantTemperature,
          top_p: settings.assistantTopP,
        }
      : {}),
    tools: convertToolsForChatCompletions(finalToolsForApi),
    stream,
  }

  if (stream) {
    const chatStream = await client.chat.completions.create(params as any, {
      signal,
    })
    return convertLocalLLMStreamToResponsesFormat(chatStream, provider)
  }

  return client.chat.completions.create(params as any, { signal })
}
