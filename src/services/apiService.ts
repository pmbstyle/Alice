import OpenAI from 'openai'
import { toFile, type FileLike } from 'openai/uploads'
import { useSettingsStore } from '../stores/settingsStore'
import {
  getOpenAIClient,
  getOpenRouterClient,
  getGroqClient,
  getOllamaClient,
  getLMStudioClient,
} from './apiClients'
import type { AppChatMessageContentPart } from '../stores/conversationStore'
import {
  PREDEFINED_OPENAI_TOOLS,
  type ApiRequestBodyFunctionTool,
} from '../utils/assistantTools'

/**
 * Parse WAV file ArrayBuffer and extract raw PCM audio data as Float32Array
 */
function parseWavToFloat32Array(arrayBuffer: ArrayBuffer): Float32Array {
  const dataView = new DataView(arrayBuffer)
  
  // Verify WAV format
  if (dataView.getUint32(0, false) !== 0x52494646) { // "RIFF"
    throw new Error('Invalid WAV file: missing RIFF header')
  }
  
  if (dataView.getUint32(8, false) !== 0x57415645) { // "WAVE"
    throw new Error('Invalid WAV file: missing WAVE header')
  }
  
  // Find data chunk
  let offset = 12
  let dataOffset = -1
  let dataSize = 0
  
  while (offset < arrayBuffer.byteLength) {
    const chunkId = dataView.getUint32(offset, false)
    const chunkSize = dataView.getUint32(offset + 4, true)
    
    if (chunkId === 0x64617461) { // "data"
      dataOffset = offset + 8
      dataSize = chunkSize
      break
    }
    
    offset += 8 + chunkSize
  }
  
  if (dataOffset === -1) {
    throw new Error('Invalid WAV file: data chunk not found')
  }
  
  // Extract PCM data and convert to Float32
  const pcmData = new Int16Array(arrayBuffer, dataOffset, dataSize / 2)
  const float32Data = new Float32Array(pcmData.length)
  
  // Convert 16-bit PCM to Float32 (-1.0 to 1.0 range)
  for (let i = 0; i < pcmData.length; i++) {
    float32Data[i] = pcmData[i] / 32768.0
  }
  
  return float32Data
}

/* 
API Function Exports
*/

function getAIClient(): OpenAI {
  const settings = useSettingsStore().config
  switch (settings.aiProvider) {
    case 'openrouter':
      return getOpenRouterClient()
    case 'ollama':
      return getOllamaClient()
    case 'lm-studio':
      return getLMStudioClient()
    default:
      return getOpenAIClient()
  }
}

async function* convertLocalLLMStreamToResponsesFormat(
  stream: any,
  provider: 'ollama' | 'lm-studio'
) {
  let responseId = `${provider}-${Date.now()}`
  let messageItemId = `message-${Date.now()}`
  let toolCallsBuffer = new Map()

  yield {
    type: 'response.created',
    response: {
      id: responseId,
      object: 'realtime.response',
      status: 'in_progress',
      output: [],
    },
  }

  yield {
    type: 'response.output_item.added',
    response_id: responseId,
    item_id: messageItemId,
    item: {
      id: messageItemId,
      type: 'message',
      role: 'assistant',
      content: [],
    },
  }

  try {
    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices[0]) {
        const choice = chunk.choices[0]

        if (choice.delta && choice.delta.content) {
          yield {
            type: 'response.output_text.delta',
            response_id: responseId,
            item_id: messageItemId,
            output_index: 0,
            content_index: 0,
            delta: choice.delta.content,
          }
        }

        if (choice.delta && choice.delta.tool_calls) {
          for (const toolCall of choice.delta.tool_calls) {
            if (toolCall.function || toolCall.id) {
              const toolCallIndex = toolCall.index || 0
              const toolCallId = `tool-${toolCallIndex}`


              if (!toolCallsBuffer.has(toolCallId)) {
                toolCallsBuffer.set(toolCallId, {
                  id: toolCall.id || toolCallId,
                  name: toolCall.function?.name || '',
                  arguments: '',
                })
              }

              const bufferedCall = toolCallsBuffer.get(toolCallId)
              if (bufferedCall) {
                if (toolCall.id && !bufferedCall.id.startsWith('tool-')) {
                  bufferedCall.id = toolCall.id
                }

                if (toolCall.function?.name && !bufferedCall.name) {
                  bufferedCall.name = toolCall.function.name
                  console.log(
                    `[${provider}] Updated name for ${toolCallId}:`,
                    bufferedCall.name
                  )

                  yield {
                    type: 'response.output_item.added',
                    response_id: responseId,
                    item_id: toolCallId,
                    item: {
                      id: toolCallId,
                      type: 'function_call',
                      name: toolCall.function.name,
                      arguments: '',
                    },
                  }
                }

                if (toolCall.function?.arguments) {
                  bufferedCall.arguments += toolCall.function.arguments
                  console.log(
                    `[${provider}] Accumulated arguments for ${toolCallId}:`,
                    bufferedCall.arguments
                  )

                  yield {
                    type: 'response.function_call_arguments.delta',
                    response_id: responseId,
                    item_id: toolCallId,
                    delta: toolCall.function.arguments,
                  }
                }
              }
            }
          }
        }

        if (
          choice.finish_reason === 'stop' ||
          choice.finish_reason === 'tool_calls'
        ) {
          console.log(
            `[${provider}] Finishing stream, toolCallsBuffer size:`,
            toolCallsBuffer.size
          )

          for (const [toolCallId, toolData] of toolCallsBuffer) {
            if (!toolData.name) {
              console.log(
                `[${provider}] Skipping tool call ${toolCallId} - no function name`
              )
              continue
            }

            console.log(
              `[${provider}] Completing tool call ${toolCallId}:`,
              toolData
            )

            let parsedArguments = toolData.arguments
            if (
              typeof toolData.arguments === 'string' &&
              toolData.arguments.trim()
            ) {
              try {
                parsedArguments = JSON.parse(toolData.arguments)
              } catch (e) {
                console.error(
                  `[${provider}] Failed to parse tool arguments:`,
                  toolData.arguments,
                  e
                )
                parsedArguments = {}
              }
            } else if (!toolData.arguments || toolData.arguments === '') {
              console.error(
                `[${provider}] Empty arguments for tool call ${toolCallId}`
              )
              parsedArguments = {}
            }

            yield {
              type: 'response.output_item.done',
              response_id: responseId,
              item_id: toolCallId,
              item: {
                id: toolCallId,
                call_id: toolData.id,
                type: 'function_call',
                name: toolData.name,
                arguments: parsedArguments,
              },
            }
          }

          yield {
            type: 'response.output_item.done',
            response_id: responseId,
            item_id: messageItemId,
            item: {
              id: messageItemId,
              type: 'message',
              role: 'assistant',
              content: [],
            },
          }

          yield {
            type: 'response.done',
            response: {
              id: responseId,
              object: 'realtime.response',
              status: 'completed',
              output: [],
            },
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error in ${provider} stream conversion:`, error)

    yield {
      type: 'error',
      error: {
        type: 'server_error',
        message: error.message || 'Unknown error',
      },
    }
  }
}

async function* convertOpenRouterStreamToResponsesFormat(stream: any) {
  let responseId = `openrouter-${Date.now()}`
  let messageItemId = `message-${Date.now()}`
  let toolCallsBuffer = new Map()

  yield {
    type: 'response.created',
    response: {
      id: responseId,
      object: 'realtime.response',
      status: 'in_progress',
      output: [],
    },
  }

  yield {
    type: 'response.output_item.added',
    response_id: responseId,
    item_id: messageItemId,
    item: {
      id: messageItemId,
      type: 'message',
      role: 'assistant',
      content: [],
    },
  }

  try {
    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices[0]) {
        const choice = chunk.choices[0]

        if (choice.delta && choice.delta.content) {
          yield {
            type: 'response.output_text.delta',
            response_id: responseId,
            item_id: messageItemId,
            output_index: 0,
            content_index: 0,
            delta: choice.delta.content,
          }
        }

        if (choice.delta && choice.delta.tool_calls) {
          for (const toolCall of choice.delta.tool_calls) {
            if (toolCall.function || toolCall.id) {
              const toolCallIndex = toolCall.index || 0
              const toolCallId = `tool-${toolCallIndex}`


              if (!toolCallsBuffer.has(toolCallId)) {
                toolCallsBuffer.set(toolCallId, {
                  id: toolCall.id || toolCallId,
                  name: toolCall.function?.name || '',
                  arguments: '',
                })
              }

              const bufferedCall = toolCallsBuffer.get(toolCallId)
              if (bufferedCall) {
                if (toolCall.id && !bufferedCall.id.startsWith('tool-')) {
                  bufferedCall.id = toolCall.id
                }

                if (toolCall.function?.name && !bufferedCall.name) {
                  bufferedCall.name = toolCall.function.name
                  console.log(
                    `[OpenRouter] Updated name for ${toolCallId}:`,
                    bufferedCall.name
                  )

                  yield {
                    type: 'response.output_item.added',
                    response_id: responseId,
                    item_id: toolCallId,
                    item: {
                      id: toolCallId,
                      type: 'function_call',
                      name: toolCall.function.name,
                      arguments: '',
                    },
                  }
                }

                if (toolCall.function?.arguments) {
                  bufferedCall.arguments += toolCall.function.arguments
                  console.log(
                    `[OpenRouter] Accumulated arguments for ${toolCallId}:`,
                    bufferedCall.arguments
                  )

                  yield {
                    type: 'response.function_call_arguments.delta',
                    response_id: responseId,
                    item_id: toolCallId,
                    delta: toolCall.function.arguments,
                  }
                }
              }
            }
          }
        }

        if (
          choice.finish_reason === 'stop' ||
          choice.finish_reason === 'tool_calls'
        ) {
          console.log(
            `[OpenRouter] Finishing stream, toolCallsBuffer size:`,
            toolCallsBuffer.size
          )
          console.log(
            `[OpenRouter] toolCallsBuffer contents:`,
            Array.from(toolCallsBuffer.entries())
          )

          for (const [toolCallId, toolData] of toolCallsBuffer) {
            if (!toolData.name) {
              console.log(
                `[OpenRouter] Skipping tool call ${toolCallId} - no function name`
              )
              continue
            }

            console.log(
              `[OpenRouter] Completing tool call ${toolCallId}:`,
              toolData
            )
            console.log(
              `[OpenRouter] Raw arguments string:`,
              toolData.arguments
            )

            let parsedArguments = toolData.arguments
            if (
              typeof toolData.arguments === 'string' &&
              toolData.arguments.trim()
            ) {
              try {
                parsedArguments = JSON.parse(toolData.arguments)
              } catch (e) {
                console.error(
                  `[OpenRouter] Failed to parse tool arguments:`,
                  toolData.arguments,
                  e
                )
                parsedArguments = {}
              }
            } else if (!toolData.arguments || toolData.arguments === '') {
              console.error(
                `[OpenRouter] Empty arguments for tool call ${toolCallId}`
              )
              parsedArguments = {}
            }

            yield {
              type: 'response.output_item.done',
              response_id: responseId,
              item_id: toolCallId,
              item: {
                id: toolCallId,
                call_id: toolData.id,
                type: 'function_call',
                name: toolData.name,
                arguments: parsedArguments,
              },
            }
          }

          yield {
            type: 'response.output_item.done',
            response_id: responseId,
            item_id: messageItemId,
            item: {
              id: messageItemId,
              type: 'message',
              role: 'assistant',
              content: [],
            },
          }

          yield {
            type: 'response.done',
            response: {
              id: responseId,
              object: 'realtime.response',
              status: 'completed',
              output: [],
            },
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in OpenRouter stream conversion:', error)

    yield {
      type: 'error',
      error: {
        type: 'server_error',
        message: error.message || 'Unknown error',
      },
    }
  }
}

export const fetchOpenAIModels = async (): Promise<OpenAI.Models.Model[]> => {
  const settings = useSettingsStore().config
  const client = getAIClient()
  const modelsPage = await client.models.list()

  if (settings.aiProvider === 'openrouter') {
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
  } else if (
    settings.aiProvider === 'ollama' ||
    settings.aiProvider === 'lm-studio'
  ) {
    // For local LLMs, return all available models (they should be curated by user)
    return modelsPage.data.sort((a, b) => a.id.localeCompare(b.id))
  } else {
    return modelsPage.data
      .filter(model => {
        const id = model.id

        const isSupportedPrefix =
          id.startsWith('gpt-4') ||
          id.startsWith('gpt-5') ||
          id.startsWith('o1') ||
          id.startsWith('o2') ||
          id.startsWith('o3') ||
          id.startsWith('o4')

        const isExcluded =
          id.includes('research') ||
          id.includes('search') ||
          id.includes('realtime') ||
          id.includes('transcribe') ||
          id.includes('audio') ||
          id.includes('tts') ||
          id.includes('4-') ||
          id.includes('4.5') ||
          id == 'gpt-4'

        return isSupportedPrefix && !isExcluded
      })
      .sort((a, b) => a.id.localeCompare(b.id))
  }
}

export const createOpenAIResponse = async (
  input: OpenAI.Responses.Request.InputItemLike[],
  previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> => {
  const client = getAIClient()
  const settings = useSettingsStore().config

  const finalToolsForApi: any[] = []

  if (settings.assistantTools && settings.assistantTools.length > 0) {
    for (const toolName of settings.assistantTools) {
      const toolDefinition = PREDEFINED_OPENAI_TOOLS.find(
        (tool: ApiRequestBodyFunctionTool) => tool.name === toolName
      )
      if (toolDefinition) {
        finalToolsForApi.push({
          type: 'function',
          name: toolDefinition.name,
          description: toolDefinition.description,
          parameters: toolDefinition.parameters,
        })
      }
    }
  }

  if (
    settings.mcpServersConfig &&
    settings.mcpServersConfig.trim() !== '[]' &&
    settings.mcpServersConfig.trim() !== ''
  ) {
    try {
      const mcpServerDefinitions = JSON.parse(settings.mcpServersConfig)
      if (Array.isArray(mcpServerDefinitions)) {
        mcpServerDefinitions.forEach(mcpTool => {
          if (
            mcpTool.type === 'mcp' &&
            mcpTool.server_label &&
            mcpTool.server_url
          ) {
            finalToolsForApi.push(mcpTool)
          }
        })
      }
    } catch (e) {
      console.error('Failed to parse MCP servers config JSON:', e)
    }
  }

  const modelName = settings.assistantModel || ''
  const isOModel = modelName.startsWith('o')

  if (settings.aiProvider === 'openai') {
    const isGpt5WithMinimalReasoning =
      settings.assistantModel.startsWith('gpt-5') &&
      settings.assistantReasoningEffort === 'minimal'

    if (!isOModel) {
      if (!isGpt5WithMinimalReasoning) {
        finalToolsForApi.push({ type: 'image_generation', partial_images: 2 })
        finalToolsForApi.push({ type: 'web_search_preview' })
      }
    } else {
      if (modelName.includes('o3-pro') && modelName === 'o3') {
        finalToolsForApi.push({ type: 'image_generation', partial_images: 2 })
        finalToolsForApi.push({ type: 'web_search_preview' })
      }
    }
  }

  if (settings.aiProvider === 'openrouter') {
    const allowedTools = finalToolsForApi
      .filter(tool => {
        if (
          tool.type === 'image_generation' ||
          tool.type === 'web_search_preview'
        ) {
          return false
        }
        return true
      })
      .map(tool => {
        if (tool.name === 'open_path') {
          return {
            ...tool,
            description: tool.description?.replace(
              'Use this tool to open web search result url for user command.',
              'Do NOT use this tool for web searches. For web searches, use the built-in web search capabilities.'
            ),
          }
        }
        return tool
      })
    finalToolsForApi.length = 0
    finalToolsForApi.push(...allowedTools)
  } else if (
    settings.aiProvider === 'ollama' ||
    settings.aiProvider === 'lm-studio'
  ) {
    const allowedTools = finalToolsForApi.filter(tool => {
      if (
        tool.type === 'image_generation' ||
        tool.type === 'web_search_preview'
      ) {
        return false
      }
      return true
    })
    finalToolsForApi.length = 0
    finalToolsForApi.push(...allowedTools)
  }

  if (settings.aiProvider === 'openrouter') {
    const messages = input
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
                  (part: any) =>
                    part.type === 'output_text' && part.text?.trim()
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

    console.log(
      '[OpenRouter] Final messages:',
      JSON.stringify(messages, null, 2)
    )

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
      const openrouterStream = await client.chat.completions.create(
        params as any,
        { signal }
      )
      return convertOpenRouterStreamToResponsesFormat(openrouterStream)
    } else {
      return client.chat.completions.create(params as any, { signal })
    }
  } else if (
    settings.aiProvider === 'ollama' ||
    settings.aiProvider === 'lm-studio'
  ) {
    const messages = input
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
                  (part: any) =>
                    part.type === 'output_text' && part.text?.trim()
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

    console.log(
      `[${settings.aiProvider}] Final messages:`,
      JSON.stringify(messages, null, 2)
    )

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
      return convertLocalLLMStreamToResponsesFormat(
        localStream,
        settings.aiProvider as 'ollama' | 'lm-studio'
      )
    } else {
      return client.chat.completions.create(params as any, { signal })
    }
  } else {
    const params: OpenAI.Responses.ResponseCreateParams = {
      model: settings.assistantModel || 'gpt-4.1-mini',
      input: input,
      instructions: customInstructions || settings.assistantSystemPrompt,
      ...(isOModel || settings.assistantModel.startsWith('gpt-5')
        ? {}
        : {
            temperature: settings.assistantTemperature,
            top_p: settings.assistantTopP,
          }),
      ...(settings.assistantModel.startsWith('gpt-5')
        ? {
            reasoning: {
              effort: settings.assistantReasoningEffort || 'medium',
            },
            text: {
              verbosity: settings.assistantVerbosity || 'medium',
            },
          }
        : {}),
      tools: finalToolsForApi.length > 0 ? finalToolsForApi : undefined,
      previous_response_id: previousResponseId || undefined,
      stream: stream,
      store: true,
      truncation: 'auto',
    }

    return client.responses.create(params as any, { signal })
  }
}

function removeLinksFromText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s\)]+/g, '')
    .replace(/www\.[^\s\)]+/g, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const ttsStream = async (
  text: string,
  signal: AbortSignal
): Promise<Response> => {
  const settings = useSettingsStore().config
  const cleanedText = removeLinksFromText(text)

  if (settings.ttsProvider === 'local') {
    try {
      // Import the backend API
      const { backendApi } = await import('./backendApi')
      
      const ttsReady = await backendApi.isTTSReady()
      
      if (!ttsReady) {
        return fallbackToOpenAITTS(cleanedText, signal)
      }

      const speechResult = await backendApi.synthesizeSpeech(
        cleanedText,
        settings.localTtsVoice
      )

      if (!speechResult.audio) {
        return fallbackToOpenAITTS(cleanedText, signal)
      }

      // Convert number array to ArrayBuffer
      const audioBuffer = new ArrayBuffer(speechResult.audio.length)
      const audioView = new Uint8Array(audioBuffer)
      audioView.set(speechResult.audio)
      
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' })
      return new Response(audioBlob, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': audioBuffer.byteLength.toString()
        }
      })
    } catch (error: any) {
      return fallbackToOpenAITTS(cleanedText, signal)
    }
  } else {
    return fallbackToOpenAITTS(cleanedText, signal)
  }
}

// Helper function for OpenAI TTS (extracted from original function)
const fallbackToOpenAITTS = async (
  text: string,
  signal: AbortSignal
): Promise<Response> => {
  const openai = getOpenAIClient()
  const settings = useSettingsStore().config

  return openai.audio.speech.create(
    {
      model: 'tts-1',
      voice: settings.ttsVoice || 'nova',
      input: text,
      response_format: 'mp3',
    },
    { signal }
  )
}

export const transcribeWithGroq = async (
  audioBuffer: ArrayBuffer
): Promise<string> => {
  const groq = getGroqClient()
  const file: FileLike = await toFile(audioBuffer, 'audio.wav', {
    type: 'audio/wav',
  })
  const transcription = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    response_format: 'json',
  })
  return transcription?.text || ''
}

export const transcribeWithBackend = async (
  audioBuffer: ArrayBuffer,
  fallbackToOpenAI: boolean = false,
  language?: string
): Promise<string> => {
  try {
    const settingsStore = useSettingsStore()
    const selectedLanguage = language || settingsStore.config.transformersLanguage || 'auto'
    
    // Import the backend API
    const { backendApi } = await import('./backendApi')
    
    // Check if Go backend is ready
    const isHealthy = await backendApi.isHealthy()
    if (!isHealthy) {
      throw new Error('Go backend not available - server not running')
    }

    const sttReady = await backendApi.isSTTReady()
    if (!sttReady) {
      throw new Error('Go STT service not ready - AI dependencies may not be installed')
    }

    // Parse WAV file to extract raw PCM audio data
    const audioData = parseWavToFloat32Array(audioBuffer)
    
    // Filter out null/NaN values and ensure valid number range
    const cleanedAudioData = Array.from(audioData).filter(value => 
      value !== null && 
      value !== undefined && 
      !isNaN(value) && 
      isFinite(value) &&
      Math.abs(value) <= 1.5 // Allow slight headroom beyond -1.0 to 1.0 range
    )
    
    if (cleanedAudioData.length === 0) {
      throw new Error('Audio data contains no valid samples')
    }
    
    // Skip very short audio clips
    if (cleanedAudioData.length / 16000 < 0.5) {
      throw new Error('Audio clip too short for reliable transcription')
    }
    
    const audioDataFloat32 = new Float32Array(cleanedAudioData)
    const result = await backendApi.transcribeAudio(audioDataFloat32, 16000, selectedLanguage === 'auto' ? undefined : selectedLanguage)
    
    return result.text
  } catch (error: any) {
    if (fallbackToOpenAI) {
      try {
        return await transcribeWithOpenAI(audioBuffer)
      } catch (fallbackError: any) {
        throw new Error(
          `Local STT failed: ${error.message}. Fallback to OpenAI also failed: ${fallbackError.message}`
        )
      }
    }

    throw error
  }
}

export const transcribeWithOpenAI = async (
  audioBuffer: ArrayBuffer
): Promise<string> => {
  const openai = getOpenAIClient()
  const file: FileLike = await toFile(audioBuffer, 'audio.wav', {
    type: 'audio/wav',
  })
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'gpt-4o-transcribe',
    response_format: 'json',
  })
  return transcription?.text || ''
}

export const createEmbedding = async (textInput: any): Promise<number[]> => {
  const settings = useSettingsStore().settings
  let textToEmbed = ''

  if (typeof textInput === 'string') {
    textToEmbed = textInput
  } else if (textInput && typeof textInput.content === 'string') {
    textToEmbed = textInput.content
  } else if (textInput && Array.isArray(textInput.content)) {
    const contentArray = textInput.content as AppChatMessageContentPart[]
    const textParts = contentArray
      .filter(item => item.type === 'app_text')
      .map(item => item.text || '')
    textToEmbed = textParts.join(' ')
  }

  if (!textToEmbed.trim()) return []

  if (settings.embeddingProvider === 'local') {
    try {
      // Import the backend API
      const { backendApi } = await import('./backendApi')
      
      const embeddingsReady = await backendApi.isEmbeddingsReady()
      if (!embeddingsReady) {
        return fallbackToOpenAIEmbedding(textToEmbed)
      }

      const embedding = await backendApi.generateEmbedding(textToEmbed)
      
      if (embedding && embedding.length > 0) {
        return embedding
      } else {
        return fallbackToOpenAIEmbedding(textToEmbed)
      }
    } catch (error) {
      return fallbackToOpenAIEmbedding(textToEmbed)
    }
  } else {
    return fallbackToOpenAIEmbedding(textToEmbed)
  }
}

const fallbackToOpenAIEmbedding = async (textToEmbed: string): Promise<number[]> => {
  const openai = getOpenAIClient()
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: textToEmbed,
    encoding_format: 'float',
  })
  return response.data[0]?.embedding || []
}

export const indexMessageForThoughts = async (
  conversationId: string,
  role: string,
  message: any
): Promise<void> => {
  const embedding = await createEmbedding(message)
  if (embedding.length === 0) return

  let textContentForMetadata = 'No textual content'
  if (message.content && Array.isArray(message.content)) {
    const firstTextPart = message.content.find(
      (item: any) => item.type === 'app_text'
    )
    if (firstTextPart) {
      textContentForMetadata = firstTextPart.text || ''
    }
  } else if (typeof message.content === 'string') {
    textContentForMetadata = message.content
  }

  await window.ipcRenderer.invoke('thoughtVector:add', {
    conversationId,
    role,
    textContent: textContentForMetadata,
    embedding,
  })
}

export const retrieveRelevantThoughtsForPrompt = async (
  content: string,
  topK = 3
): Promise<string[]> => {
  if (!content.trim()) return []
  const queryEmbedding = await createEmbedding(content)
  if (queryEmbedding.length === 0) return []

  const ipcResult = await window.ipcRenderer.invoke('thoughtVector:search', {
    queryEmbedding,
    topK,
  })
  return ipcResult.success && Array.isArray(ipcResult.data)
    ? ipcResult.data
    : []
}

export const createSummarizationResponse = async (
  messagesToSummarize: { role: string; content: string }[],
  summarizationModel: string,
  systemPrompt: string
): Promise<string | null> => {
  const settings = useSettingsStore().config
  const client = getAIClient()
  const combinedText = messagesToSummarize
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n\n')

  if (
    settings.aiProvider === 'openrouter' ||
    settings.aiProvider === 'ollama' ||
    settings.aiProvider === 'lm-studio'
  ) {
    const response = await client.chat.completions.create({
      model: summarizationModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: combinedText },
      ],
      stream: false,
    } as any)

    return response.choices[0]?.message?.content?.trim() || null
  } else {
    const response = await client.responses.create({
      model: summarizationModel,
      input: [
        { role: 'user', content: [{ type: 'input_text', text: combinedText }] },
      ],
      instructions: systemPrompt,
      ...(summarizationModel.startsWith('gpt-5')
        ? {
            reasoning: {
              effort: 'minimal',
            },
            text: {
              verbosity: 'low',
            },
          }
        : {}),
      stream: false,
      store: false,
    } as any)

    const textPart = response.output?.[0]?.content?.[0]
    if (textPart?.type === 'output_text') {
      return textPart.text.trim()
    }
    return null
  }
}

export const createContextAnalysisResponse = async (
  messagesToAnalyze: { role: string; content: string }[],
  analysisModel: string
): Promise<string | null> => {
  const settings = useSettingsStore().config
  const client = getAIClient()
  const analysisSystemPrompt = `You are an expert in emotional intelligence. Analyze the tone and emotional state of the 'user' in the following conversation transcript. Provide a single, concise sentence describing their likely emotional state. Do not add any extra commentary.`
  const combinedText = messagesToAnalyze
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n\n')

  if (
    settings.aiProvider === 'openrouter' ||
    settings.aiProvider === 'ollama' ||
    settings.aiProvider === 'lm-studio'
  ) {
    const response = await client.chat.completions.create({
      model: analysisModel,
      messages: [
        { role: 'system', content: analysisSystemPrompt },
        { role: 'user', content: combinedText },
      ],
      stream: false,
    } as any)

    return (
      response.choices[0]?.message?.content?.trim().replace(/"/g, '') || null
    )
  } else {
    const response = await client.responses.create({
      model: analysisModel,
      input: [
        { role: 'user', content: [{ type: 'input_text', text: combinedText }] },
      ],
      instructions: analysisSystemPrompt,
      ...(analysisModel.startsWith('gpt-5')
        ? {
            reasoning: {
              effort: 'minimal',
            },
            text: {
              verbosity: 'low',
            },
          }
        : {}),
      stream: false,
      store: false,
    } as any)

    const textPart = response.output?.[0]?.content?.[0]
    if (textPart?.type === 'output_text') {
      return textPart.text.trim().replace(/"/g, '')
    }
    return null
  }
}

export const uploadFileToOpenAI = async (
  file: File
): Promise<string | null> => {
  const settings = useSettingsStore().config

  if (settings.aiProvider !== 'openai') {
    console.error('File upload is only supported with OpenAI provider')
    return null
  }

  try {
    const supportedTypes = [
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (!supportedTypes.includes(file.type)) {
      console.error(
        `Unsupported file type: ${file.type}. Supported types: ${supportedTypes.join(', ')}`
      )
      return null
    }

    const maxSize = 32 * 1024 * 1024
    if (file.size > maxSize) {
      console.error(
        `File too large: ${file.size} bytes. Maximum allowed: ${maxSize} bytes (32MB)`
      )
      return null
    }

    const openai = getOpenAIClient()
    const fileUpload = await openai.files.create({
      file: file,
      purpose: 'user_data',
    })

    console.log(
      `File uploaded successfully: ${fileUpload.id} (${file.name}, ${file.type})`
    )
    return fileUpload.id
  } catch (error) {
    console.error('Error uploading file to OpenAI:', error)
    if (error instanceof Error && error.message.includes('purpose')) {
      try {
        console.log('Retrying with assistants purpose...')
        const openai = getOpenAIClient()
        const fileUpload = await openai.files.create({
          file: file,
          purpose: 'assistants',
        })
        console.log(
          `File uploaded successfully with assistants purpose: ${fileUpload.id}`
        )
        return fileUpload.id
      } catch (fallbackError) {
        console.error('Fallback upload also failed:', fallbackError)
        return null
      }
    }
    return null
  }
}
