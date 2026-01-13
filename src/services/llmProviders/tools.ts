import { useSettingsStore } from '../../stores/settingsStore'
import { useCustomToolsStore } from '../../stores/customToolsStore'
import {
  PREDEFINED_OPENAI_TOOLS,
  type ApiRequestBodyFunctionTool,
} from '../../utils/assistantTools'

export async function buildToolsForProvider(): Promise<any[]> {
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

  const customToolsStore = useCustomToolsStore()
  await customToolsStore.ensureInitialized()
  for (const customTool of customToolsStore.enabledAndValidTools) {
    finalToolsForApi.push({
      type: 'function',
      name: customTool.name,
      description: customTool.description,
      parameters: customTool.parameters,
      strict: customTool.strict ?? false,
    })
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
  } else if (settings.aiProvider === 'aws-bedrock') {
    // Bedrock supports all tools except image_generation
    // Claude on Bedrock supports full tool calling
    const allowedTools = finalToolsForApi.filter(tool => {
      if (tool.type === 'image_generation') {
        return false
      }
      return true
    })
    finalToolsForApi.length = 0
    finalToolsForApi.push(...allowedTools)
  }

  return finalToolsForApi
}
