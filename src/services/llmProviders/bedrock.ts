import type OpenAI from 'openai'
import {
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
import {
  BedrockClient,
  ListInferenceProfilesCommand,
} from '@aws-sdk/client-bedrock'
import { useSettingsStore } from '../../stores/settingsStore'
import { getBedrockClient } from '../apiClients'
import { buildToolsForProvider } from './tools'

console.log('🔵 Bedrock module loaded!')

/**
 * Static fallback list of Claude inference profiles
 * Used when dynamic fetching fails or user is offline
 */
const FALLBACK_INFERENCE_PROFILES = [
  // === Global Inference Profiles (Best availability - 24-28 regions) ===
  'global.anthropic.claude-sonnet-4-5-20250929-v1:0',  // Claude Sonnet 4.5 (28 regions)
  'global.anthropic.claude-opus-4-5-20251101-v1:0',    // Claude Opus 4.5 (24 regions)
  'global.anthropic.claude-haiku-4-5-20251001-v1:0',   // Claude Haiku 4.5 (24 regions)
  'global.anthropic.claude-sonnet-4-20250514-v1:0',    // Claude Sonnet 4 (5 regions)

  // === US Region Inference Profiles ===
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0',      // Claude Sonnet 4.5
  'us.anthropic.claude-opus-4-5-20251101-v1:0',        // Claude Opus 4.5
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',       // Claude Haiku 4.5
  'us.anthropic.claude-opus-4-1-20250805-v1:0',        // Claude Opus 4.1
  'us.anthropic.claude-sonnet-4-20250514-v1:0',        // Claude Sonnet 4
  'us.anthropic.claude-opus-4-20250514-v1:0',          // Claude Opus 4
  'us.anthropic.claude-3-7-sonnet-20250219-v1:0',      // Claude 3.7 Sonnet
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0',      // Claude 3.5 Sonnet v2
  'us.anthropic.claude-3-5-sonnet-20240620-v1:0',      // Claude 3.5 Sonnet
  'us.anthropic.claude-3-5-haiku-20241022-v1:0',       // Claude 3.5 Haiku
  'us.anthropic.claude-3-opus-20240229-v1:0',          // Claude 3 Opus
  'us.anthropic.claude-3-sonnet-20240229-v1:0',        // Claude 3 Sonnet
  'us.anthropic.claude-3-haiku-20240307-v1:0',         // Claude 3 Haiku

  // === EU Region Inference Profiles ===
  'eu.anthropic.claude-sonnet-4-5-20250929-v1:0',      // Claude Sonnet 4.5
  'eu.anthropic.claude-opus-4-5-20251101-v1:0',        // Claude Opus 4.5
  'eu.anthropic.claude-haiku-4-5-20251001-v1:0',       // Claude Haiku 4.5
  'eu.anthropic.claude-sonnet-4-20250514-v1:0',        // Claude Sonnet 4
  'eu.anthropic.claude-3-7-sonnet-20250219-v1:0',      // Claude 3.7 Sonnet
  'eu.anthropic.claude-3-5-sonnet-20240620-v1:0',      // Claude 3.5 Sonnet
  'eu.anthropic.claude-3-sonnet-20240229-v1:0',        // Claude 3 Sonnet
  'eu.anthropic.claude-3-haiku-20240307-v1:0',         // Claude 3 Haiku

  // === APAC Region Inference Profiles ===
  'apac.anthropic.claude-sonnet-4-20250514-v1:0',      // Claude Sonnet 4
  'apac.anthropic.claude-3-7-sonnet-20250219-v1:0',    // Claude 3.7 Sonnet
  'apac.anthropic.claude-3-5-sonnet-20241022-v2:0',    // Claude 3.5 Sonnet v2
  'apac.anthropic.claude-3-5-sonnet-20240620-v1:0',    // Claude 3.5 Sonnet
  'apac.anthropic.claude-3-sonnet-20240229-v1:0',      // Claude 3 Sonnet
  'apac.anthropic.claude-3-haiku-20240307-v1:0',       // Claude 3 Haiku

  // === Australia Region Inference Profiles ===
  'au.anthropic.claude-sonnet-4-5-20250929-v1:0',      // Claude Sonnet 4.5
  'au.anthropic.claude-haiku-4-5-20251001-v1:0',       // Claude Haiku 4.5

  // === Japan Region Inference Profiles ===
  'jp.anthropic.claude-sonnet-4-5-20250929-v1:0',      // Claude Sonnet 4.5
  'jp.anthropic.claude-haiku-4-5-20251001-v1:0',       // Claude Haiku 4.5

  // === US-GOV Region Inference Profiles ===
  'us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0',  // Claude Sonnet 4.5
  'us-gov.anthropic.claude-3-7-sonnet-20250219-v1:0',  // Claude 3.7 Sonnet
  'us-gov.anthropic.claude-3-5-sonnet-20240620-v1:0',  // Claude 3.5 Sonnet
  'us-gov.anthropic.claude-3-haiku-20240307-v1:0',     // Claude 3 Haiku
]

/**
 * List Claude inference profiles available in AWS Bedrock
 * Dynamically fetches from AWS API with static fallback
 */
export const listBedrockModels = async (): Promise<string[]> => {
  console.log('🔍 Fetching Bedrock Inference Profiles for Claude models')

  const settings = useSettingsStore().config

  // Create Bedrock client for listing inference profiles
  const bedrockClient = new BedrockClient({
    region: settings.awsRegion,
    credentials: {
      accessKeyId: settings.awsAccessKeyId,
      secretAccessKey: settings.awsSecretAccessKey,
      ...(settings.awsSessionToken ? { sessionToken: settings.awsSessionToken } : {}),
    },
  })

  try {
    // Fetch system-defined inference profiles from AWS
    const command = new ListInferenceProfilesCommand({
      maxResults: 1000,  // Get all profiles in one request
      typeEquals: 'SYSTEM_DEFINED',  // Only system-defined cross-region profiles
    })

    const response = await bedrockClient.send(command)

    if (!response.inferenceProfileSummaries || response.inferenceProfileSummaries.length === 0) {
      console.warn('⚠️ No inference profiles returned from AWS, using fallback list')
      return FALLBACK_INFERENCE_PROFILES
    }

    console.log(`📥 Received ${response.inferenceProfileSummaries.length} inference profiles from AWS`)

    // Filter for Claude/Anthropic models only
    const claudeProfiles = response.inferenceProfileSummaries
      .filter(profile => {
        // Check if any model in the profile is from Anthropic
        const hasAnthropicModel = profile.models?.some(model =>
          model.modelArn?.includes('anthropic') ||
          model.modelArn?.includes('claude')
        )

        // Only include ACTIVE profiles
        const isActive = profile.status === 'ACTIVE'

        if (hasAnthropicModel && isActive) {
          console.log('✅ Found Claude profile:', {
            id: profile.inferenceProfileId,
            name: profile.inferenceProfileName,
            models: profile.models?.length,
          })
        }

        return hasAnthropicModel && isActive
      })
      .map(profile => profile.inferenceProfileId!)
      .filter(id => id)  // Remove any undefined values
      .sort((a, b) => {
        // Sort profiles by preference:
        // 1. Global profiles first (best availability)
        // 2. Then by region (us, eu, apac, au, jp, us-gov)
        // 3. Then by model version (newer first)
        const getScore = (id: string) => {
          let score = 0

          // Region priority
          if (id.startsWith('global.')) score += 1000
          else if (id.startsWith('us.')) score += 900
          else if (id.startsWith('eu.')) score += 800
          else if (id.startsWith('apac.')) score += 700
          else if (id.startsWith('au.')) score += 600
          else if (id.startsWith('jp.')) score += 500
          else if (id.startsWith('us-gov.')) score += 400

          // Model version priority
          if (id.includes('claude-4') || id.includes('4-5')) score += 150
          else if (id.includes('3-7')) score += 140
          else if (id.includes('3-5')) score += 130
          else if (id.includes('claude-3')) score += 120

          // Model tier priority
          if (id.includes('sonnet')) score += 30
          else if (id.includes('opus')) score += 20
          else if (id.includes('haiku')) score += 10

          // Extract date for tie-breaking (newer first)
          const dateMatch = id.match(/(\d{8})/)
          if (dateMatch) {
            score += parseInt(dateMatch[1]) / 100000000
          }

          return score
        }

        return getScore(b) - getScore(a)
      })

    console.log(`✨ Found ${claudeProfiles.length} Claude inference profiles`)

    // If we got profiles, return them; otherwise use fallback
    if (claudeProfiles.length > 0) {
      return claudeProfiles
    } else {
      console.warn('⚠️ No Claude profiles found in API response, using fallback list')
      return FALLBACK_INFERENCE_PROFILES
    }

  } catch (error: any) {
    console.error('❌ Error fetching Bedrock inference profiles:', error)
    console.warn('📋 Using fallback inference profile list')

    // Don't throw error, just return fallback list
    // This ensures the app works even if AWS API is unreachable
    return FALLBACK_INFERENCE_PROFILES
  }
}

/**
 * Convert OpenAI Responses format to Anthropic Messages format
 */
function convertToAnthropicMessages(input: any[]): any[] {
  const messages: any[] = []

  console.log('[Bedrock] Converting input to Anthropic messages:', JSON.stringify(input, null, 2))

  for (const item of input) {
    console.log('[Bedrock] Processing item:', item.type || item.role, item)
    // User message
    if (item.role === 'user') {
      if (Array.isArray(item.content)) {
        const contentBlocks: any[] = []

        for (const part of item.content) {
          // Handle text content
          if (part.type === 'input_text' && part.text?.trim()) {
            contentBlocks.push({
              type: 'text',
              text: part.text,
            })
          }
          // Handle image content
          else if (part.type === 'input_image' && part.image_url) {
            // Extract base64 data and media type from data URL
            const imageData = part.image_url
            let mediaType = 'image/jpeg' // default
            let base64Data = imageData

            // If it's a data URL, parse it
            if (imageData.startsWith('data:')) {
              const matches = imageData.match(/^data:([^;]+);base64,(.+)$/)
              if (matches) {
                mediaType = matches[1]
                base64Data = matches[2]
              }
            }

            console.log('[Bedrock] Processing image:', {
              hasDataUrl: imageData.startsWith('data:'),
              mediaType,
              dataLength: base64Data.length,
            })

            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            })
          }
        }

        // If we have content blocks, use them; otherwise send a default message
        if (contentBlocks.length > 0) {
          messages.push({
            role: 'user',
            content: contentBlocks,
          })
        } else {
          messages.push({
            role: 'user',
            content: 'Hello',
          })
        }
      } else if (typeof item.content === 'string' && item.content.trim()) {
        messages.push({
          role: 'user',
          content: item.content,
        })
      } else {
        messages.push({
          role: 'user',
          content: 'Hello',
        })
      }
    }
    // Assistant message
    else if (item.role === 'assistant') {
      const content: any[] = []

      // Extract text content
      if (Array.isArray(item.content)) {
        const textParts = item.content.filter(
          (part: any) => part.type === 'output_text' && part.text?.trim()
        )
        for (const part of textParts) {
          content.push({
            type: 'text',
            text: part.text,
          })
        }
      } else if (typeof item.content === 'string' && item.content.trim()) {
        content.push({
          type: 'text',
          text: item.content,
        })
      }

      // Extract tool calls
      if (item.tool_calls && Array.isArray(item.tool_calls)) {
        for (const toolCall of item.tool_calls) {
          content.push({
            type: 'tool_use',
            id: toolCall.call_id || toolCall.id || `tool_${Date.now()}`,
            name: toolCall.name,
            input:
              typeof toolCall.arguments === 'string'
                ? JSON.parse(toolCall.arguments)
                : toolCall.arguments || {},
          })
        }
      }

      if (content.length > 0) {
        messages.push({
          role: 'assistant',
          content: content,
        })
      }
    }
    // Tool result (function_call_output)
    else if (item.type === 'function_call_output') {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: item.call_id,
            content:
              typeof item.output === 'string' ? item.output : JSON.stringify(item.output),
          },
        ],
      })
    }
  }

  console.log('[Bedrock] Final Anthropic messages:', JSON.stringify(messages, null, 2))
  return messages
}

/**
 * Convert OpenAI tools to Anthropic tool format
 */
function convertToAnthropicTools(tools: any[]): any[] {
  return tools.map(tool => {
    if (tool.type === 'function') {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters, // Anthropic uses input_schema instead of parameters
      }
    }
    return tool
  })
}

/**
 * Convert Anthropic response to OpenAI Responses format
 */
function convertAnthropicToResponsesFormat(anthropicResponse: any): any {
  const content: any[] = []

  // Convert text blocks
  if (anthropicResponse.content) {
    for (const block of anthropicResponse.content) {
      if (block.type === 'text') {
        content.push({
          type: 'output_text',
          text: block.text,
        })
      } else if (block.type === 'tool_use') {
        // Tool calls handled separately
      }
    }
  }

  // Extract tool calls
  const toolCalls = anthropicResponse.content
    ?.filter((block: any) => block.type === 'tool_use')
    .map((block: any) => ({
      call_id: block.id,
      type: 'function',
      name: block.name,
      arguments: block.input,
    }))

  return {
    id: anthropicResponse.id || `bedrock_${Date.now()}`,
    model: anthropicResponse.model,
    role: 'assistant',
    content: content.length > 0 ? content : null,
    tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
    stop_reason: anthropicResponse.stop_reason,
    usage: anthropicResponse.usage,
  }
}

/**
 * Create a response from AWS Bedrock using Claude models
 */
export const createBedrockResponse = async (
  input: any[],
  previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> => {
  console.log('=== createBedrockResponse START ===')
  console.log('Input:', JSON.stringify(input, null, 2))
  console.log('Stream:', stream)

  const client = getBedrockClient()
  const settings = useSettingsStore().config
  const finalToolsForApi = await buildToolsForProvider()

  console.log('Tools:', finalToolsForApi)

  // Convert to Anthropic messages format
  const messages = convertToAnthropicMessages(input)
  console.log('Converted messages:', JSON.stringify(messages, null, 2))

  // Build request body
  const requestBody: any = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4096,
    messages: messages,
  }

  // Add system prompt
  if (customInstructions) {
    requestBody.system = customInstructions
  } else if (settings.assistantSystemPrompt) {
    requestBody.system = settings.assistantSystemPrompt
  }

  // Add temperature (AWS Bedrock doesn't allow both temperature and top_p)
  // Only use temperature as it's more commonly used for controlling randomness
  if (settings.assistantTemperature !== undefined && settings.assistantTemperature !== null) {
    requestBody.temperature = settings.assistantTemperature
  }

  // Add tools if available
  if (finalToolsForApi.length > 0) {
    requestBody.tools = convertToAnthropicTools(finalToolsForApi)
  }

  // Use inference profile instead of direct model ID
  // Default to global inference profile for best availability (28 regions)
  const modelId = settings.assistantModel || 'global.anthropic.claude-sonnet-4-5-20250929-v1:0'

  console.log('Bedrock request:', {
    modelId,
    requestBody: JSON.stringify(requestBody, null, 2),
  })

  if (stream) {
    // Streaming response
    const command = new InvokeModelWithResponseStreamCommand({
      modelId: modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    })

    try {
      const response = await client.send(command)

      if (!response.body) {
        throw new Error('No response body from Bedrock')
      }

      // Return async generator for streaming
      return convertBedrockStreamToResponsesFormat(response.body, modelId)
    } catch (error: any) {
      console.error('Bedrock streaming error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      throw new Error(handleBedrockError(error))
    }
  } else {
    // Non-streaming response
    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    })

    try {
      const response = await client.send(command)

      if (!response.body) {
        throw new Error('No response body from Bedrock')
      }

      const responseBody = JSON.parse(new TextDecoder().decode(response.body))
      console.log('Bedrock response:', JSON.stringify(responseBody, null, 2))
      return convertAnthropicToResponsesFormat(responseBody)
    } catch (error: any) {
      console.error('Bedrock error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      throw new Error(handleBedrockError(error))
    }
  }
}

/**
 * Convert Bedrock streaming response to OpenAI Responses format
 */
async function* convertBedrockStreamToResponsesFormat(
  stream: any,
  modelId: string
): AsyncGenerator<any, void, unknown> {
  const responseId = `bedrock_stream_${Date.now()}`
  let currentToolUseId = ''
  let currentToolName = ''
  let currentToolInput = ''
  let textDelta = ''
  let currentAssistantMessageId = ''

  try {
    for await (const event of stream) {
      if (event.chunk) {
        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes))

        // Message start
        if (chunk.type === 'message_start') {
          yield {
            type: 'response.created',
            response: {
              id: responseId,
              model: modelId,
              role: 'assistant',
              content: [],
            },
          }
        }

        // Content block start
        if (chunk.type === 'content_block_start') {
          const block = chunk.content_block

          if (block.type === 'text') {
            // Set the current message ID for text output
            currentAssistantMessageId = `msg_${Date.now()}`

            yield {
              type: 'response.output_item.added',
              item: {
                type: 'message',
                id: currentAssistantMessageId,
                role: 'assistant',
              },
            }
          } else if (block.type === 'tool_use') {
            currentToolUseId = block.id
            currentToolName = block.name
            currentToolInput = ''

            yield {
              type: 'response.function_call_arguments.added',
              item_id: currentToolUseId,
              name: currentToolName,
              arguments: '',
            }
          }
        }

        // Content block delta
        if (chunk.type === 'content_block_delta') {
          const delta = chunk.delta

          if (delta.type === 'text_delta') {
            textDelta += delta.text
            console.log('[Bedrock Stream] Text delta:', delta.text, 'item_id:', currentAssistantMessageId)
            yield {
              type: 'response.output_text.delta',
              item_id: currentAssistantMessageId,
              delta: delta.text,
            }
          } else if (delta.type === 'input_json_delta') {
            currentToolInput += delta.partial_json
            yield {
              type: 'response.function_call_arguments.delta',
              item_id: currentToolUseId,
              delta: delta.partial_json,
            }
          }
        }

        // Content block stop
        if (chunk.type === 'content_block_stop') {
          if (currentToolUseId) {
            yield {
              type: 'response.output_item.done',
              item: {
                type: 'function_call',
                id: currentToolUseId,
                name: currentToolName,
                arguments: currentToolInput,
              },
            }
            currentToolUseId = ''
            currentToolName = ''
            currentToolInput = ''
          }
        }

        // Message delta (usage info)
        if (chunk.type === 'message_delta') {
          // Usage information
        }

        // Message stop
        if (chunk.type === 'message_stop') {
          yield {
            type: 'response.done',
            response: {
              id: responseId,
              model: modelId,
              role: 'assistant',
              status: 'completed',
            },
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Bedrock stream error:', error)
    yield {
      type: 'response.failed',
      error: {
        message: handleBedrockError(error),
      },
    }
  }
}

/**
 * Handle Bedrock-specific errors
 */
function handleBedrockError(error: any): string {
  const errorName = error.name || error.__type || ''
  const errorMessage = error.message || 'Unknown error'

  if (errorName.includes('UnrecognizedClientException')) {
    return 'Invalid AWS credentials. Check your Access Key and Secret Key.'
  }

  if (errorName.includes('AccessDeniedException')) {
    return 'AWS credentials lack required permissions. Ensure bedrock:InvokeModel permission.'
  }

  if (errorName.includes('ResourceNotFoundException')) {
    return `Model not found. Check model availability in your AWS region.`
  }

  if (errorName.includes('ThrottlingException')) {
    return 'AWS Bedrock rate limit exceeded. Please wait and try again.'
  }

  if (errorName.includes('ValidationException')) {
    return `Invalid request: ${errorMessage}`
  }

  if (errorName.includes('ServiceUnavailableException')) {
    return 'AWS Bedrock service is temporarily unavailable. Please try again later.'
  }

  if (errorMessage.includes('not available in region')) {
    return 'Bedrock is not available in the selected region. Try us-east-1 or us-west-2.'
  }

  return errorMessage
}
