export type AIProviderKey =
  | 'openai'
  | 'openrouter'
  | 'ollama'
  | 'lm-studio'
  | 'zai'
  | 'minimax'
  | 'deepseek'
  | 'codex'

export type ChatCompletionsProviderKey = Exclude<AIProviderKey, 'openai' | 'codex'>

export interface ProviderConfig {
  displayName: string
  defaultModel: string
  nativeWebSearch: boolean
}

export interface ProviderModelDefinition {
  id: string
  displayName: string
}

export const ZAI_CODING_MODELS: ProviderModelDefinition[] = [
  { id: 'glm-5.1', displayName: 'GLM-5.1' },
  { id: 'glm-5-turbo', displayName: 'GLM-5-Turbo' },
  { id: 'glm-4.7', displayName: 'GLM-4.7' },
  { id: 'glm-4.5-air', displayName: 'GLM-4.5-Air' },
]

export const MINIMAX_TEXT_MODELS: ProviderModelDefinition[] = [
  { id: 'MiniMax-M2.7', displayName: 'MiniMax M2.7' },
  { id: 'MiniMax-M2.5', displayName: 'MiniMax M2.5' },
  { id: 'MiniMax-M2.1', displayName: 'MiniMax M2.1' },
  { id: 'MiniMax-M2', displayName: 'MiniMax M2' },
]

export const DEEPSEEK_TEXT_MODELS: ProviderModelDefinition[] = [
  { id: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-pro', displayName: 'DeepSeek V4 Pro' },
]

export const CODEX_TEXT_MODELS: ProviderModelDefinition[] = [
  { id: 'gpt-5.2', displayName: 'GPT-5.2' },
  { id: 'gpt-5.4-mini', displayName: 'GPT-5.4 Mini' },
  { id: 'gpt-5.5', displayName: 'GPT-5.5' },
]

export const PROVIDER_CONFIGS: Record<AIProviderKey, ProviderConfig> = {
  openai: {
    displayName: 'OpenAI',
    defaultModel: 'gpt-4.1-mini',
    nativeWebSearch: true,
  },
  openrouter: {
    displayName: 'OpenRouter',
    defaultModel: 'gpt-4.1-mini',
    nativeWebSearch: true,
  },
  ollama: {
    displayName: 'Ollama',
    defaultModel: 'llama3.2',
    nativeWebSearch: false,
  },
  'lm-studio': {
    displayName: 'LM Studio',
    defaultModel: 'llama3.2',
    nativeWebSearch: false,
  },
  zai: {
    displayName: 'Z.ai',
    defaultModel: 'glm-5.1',
    nativeWebSearch: false,
  },
  minimax: {
    displayName: 'MiniMax',
    defaultModel: 'MiniMax-M2.7',
    nativeWebSearch: false,
  },
  deepseek: {
    displayName: 'DeepSeek',
    defaultModel: 'deepseek-v4-flash',
    nativeWebSearch: false,
  },
  codex: {
    displayName: 'ChatGPT Codex',
    defaultModel: 'gpt-5.2',
    nativeWebSearch: false,
  },
}

export const ZAI_CODING_BASE_URL = 'https://api.z.ai/api/coding/paas/v4'
export const MINIMAX_OPENAI_BASE_URL = 'https://api.minimax.io/v1'
export const DEEPSEEK_OPENAI_BASE_URL = 'https://api.deepseek.com'

export const CHAT_COMPLETIONS_PROVIDERS: ChatCompletionsProviderKey[] = [
  'openrouter',
  'ollama',
  'lm-studio',
  'zai',
  'minimax',
  'deepseek',
]

export function getProviderDisplayName(provider: string): string {
  return PROVIDER_CONFIGS[provider as AIProviderKey]?.displayName || provider
}

export function getStaticModelsForProvider(
  provider: string
): ProviderModelDefinition[] {
  if (provider === 'zai') {
    return ZAI_CODING_MODELS
  }
  if (provider === 'minimax') {
    return MINIMAX_TEXT_MODELS
  }
  if (provider === 'deepseek') {
    return DEEPSEEK_TEXT_MODELS
  }
  if (provider === 'codex') {
    return CODEX_TEXT_MODELS
  }
  return []
}

export function isKnownProviderModel(provider: string, model: string): boolean {
  const staticModels = getStaticModelsForProvider(provider)
  if (staticModels.length === 0) {
    return true
  }
  if (provider === 'codex') {
    return (
      staticModels.some(staticModel => staticModel.id === model) ||
      model.startsWith('gpt-5')
    )
  }
  return staticModels.some(staticModel => staticModel.id === model)
}

export function getSafeProviderModel(
  provider: string,
  configuredModel?: string
): string {
  const fallback =
    PROVIDER_CONFIGS[provider as AIProviderKey]?.defaultModel ||
    PROVIDER_CONFIGS.openai.defaultModel
  const trimmedModel = configuredModel?.trim()
  if (!trimmedModel) {
    return fallback
  }
  return isKnownProviderModel(provider, trimmedModel) ? trimmedModel : fallback
}

export function isChatCompletionsProvider(
  provider: string
): provider is ChatCompletionsProviderKey {
  return CHAT_COMPLETIONS_PROVIDERS.includes(
    provider as ChatCompletionsProviderKey
  )
}
