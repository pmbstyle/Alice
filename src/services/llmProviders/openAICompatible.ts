import type OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  convertChatCompletionToResponsesFormat,
  convertLocalLLMStreamToResponsesFormat,
} from './streamAdapters'
import { buildToolsForProvider } from './tools'
import {
  MINIMAX_OPENAI_BASE_URL,
  type ChatCompletionsProviderKey,
  getSafeProviderModel,
} from './providerCatalog'

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
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'system') {
      messages.splice(index, 1)
    }
  }

  if (!customInstructions) {
    return
  }

  messages.unshift({
    role: 'system',
    content: customInstructions,
  })
}

function prepareMiniMaxMessages(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  customInstructions?: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const instructionBlock = customInstructions?.trim() || ''
  const nonSystemMessages = messages.filter(
    message => message.role !== 'system'
  )

  if (!instructionBlock) {
    return nonSystemMessages
  }

  const firstUserMessage = nonSystemMessages.find(
    message => message.role === 'user'
  ) as any

  if (firstUserMessage) {
    const originalContent =
      typeof firstUserMessage.content === 'string'
        ? firstUserMessage.content
        : JSON.stringify(firstUserMessage.content || '')
    firstUserMessage.content = `${instructionBlock}\n\n${originalContent}`
    return nonSystemMessages
  }

  return [
    {
      role: 'user',
      content: instructionBlock,
    },
    ...nonSystemMessages,
  ]
}

function prepareChatMessagesForProvider(
  provider: OpenAICompatibleProviderKey,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  customInstructions?: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  if (provider === 'minimax') {
    return prepareMiniMaxMessages(messages, customInstructions)
  }

  addCustomInstructions(messages, customInstructions)
  return messages
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

export function stripReasoningFromMiniMaxContent(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(
      /^\s*(?:reasoning|thinking)[\s_-]*content\s*:\s*[\s\S]*?\n{2,}/i,
      ''
    )
    .trim()
}

function normalizeBaseUrl(baseURL: string): string {
  return baseURL.replace(/\/+$/, '')
}

export async function createMiniMaxChatCompletionViaMain(
  params: OpenAI.Chat.ChatCompletionCreateParams
): Promise<any> {
  const settings = useSettingsStore().config
  if (!settings.VITE_MINIMAX_API_KEY?.trim()) {
    throw new Error('MiniMax API Key is not configured.')
  }
  if (typeof window === 'undefined' || !window.httpAPI) {
    throw new Error('Electron HTTP bridge is unavailable.')
  }

  const body = {
    ...params,
    stream: false,
    reasoning_split: true,
  }

  const response = await window.httpAPI.request({
    url: `${normalizeBaseUrl(settings.minimaxBaseUrl || MINIMAX_OPENAI_BASE_URL)}/chat/completions`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.VITE_MINIMAX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    data: body,
    timeout: 120 * 1000,
  })

  if (!response.success) {
    throw new Error(response.error || 'MiniMax chat completion request failed.')
  }

  if (response.status && response.status >= 400) {
    const message =
      response.data?.error?.message ||
      response.data?.message ||
      `MiniMax chat completion failed with status ${response.status}.`
    const error = new Error(message) as Error & { status?: number; data?: any }
    error.status = response.status
    error.data = response.data
    throw error
  }

  const data = response.data
  const message = data?.choices?.[0]?.message
  if (message && typeof message.content === 'string') {
    message.content = stripReasoningFromMiniMaxContent(message.content)
  }
  return data
}

export async function createChatCompletionForProvider(
  provider: ChatCompletionsProviderKey,
  getClient: OpenAIClientGetter,
  params: OpenAI.Chat.ChatCompletionCreateParams,
  signal?: AbortSignal
): Promise<any> {
  if (provider === 'minimax') {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    return createMiniMaxChatCompletionViaMain(params)
  }

  return getClient().chat.completions.create(params as any, { signal })
}

export async function createOpenAICompatibleResponse(
  provider: OpenAICompatibleProviderKey,
  getClient: OpenAIClientGetter,
  input: OpenAI.Responses.Request.InputItemLike[],
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> {
  const settings = useSettingsStore().config
  const finalToolsForApi = await buildToolsForProvider()
  const messages = prepareChatMessagesForProvider(
    provider,
    convertResponsesInputToChatMessages(input),
    customInstructions
  )

  console.log(
    `[${provider}] Final messages:`,
    JSON.stringify(messages, null, 2)
  )

  const model = getSafeProviderModel(provider, settings.assistantModel)
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

  if (provider === 'minimax') {
    const completion = await createChatCompletionForProvider(
      provider,
      getClient,
      params,
      signal
    )
    return stream
      ? convertChatCompletionToResponsesFormat(completion, provider)
      : completion
  }

  if (stream) {
    const chatStream = await createChatCompletionForProvider(
      provider,
      getClient,
      params,
      signal
    )
    return convertLocalLLMStreamToResponsesFormat(chatStream, provider)
  }

  return createChatCompletionForProvider(provider, getClient, params, signal)
}
