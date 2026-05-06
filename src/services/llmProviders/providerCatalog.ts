export type AIProviderKey =
  | 'openai'
  | 'openrouter'
  | 'ollama'
  | 'lm-studio'
  | 'zai'
  | 'minimax'

export type ChatCompletionsProviderKey = Exclude<AIProviderKey, 'openai'>

export interface ProviderConfig {
  displayName: string
  defaultModel: string
  nativeWebSearch: boolean
}

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
}

export const ZAI_CODING_BASE_URL = 'https://api.z.ai/api/coding/paas/v4'
export const MINIMAX_OPENAI_BASE_URL = 'https://api.minimax.io/v1'

export const CHAT_COMPLETIONS_PROVIDERS: ChatCompletionsProviderKey[] = [
  'openrouter',
  'ollama',
  'lm-studio',
  'zai',
  'minimax',
]

export function getProviderDisplayName(provider: string): string {
  return PROVIDER_CONFIGS[provider as AIProviderKey]?.displayName || provider
}

export function isChatCompletionsProvider(
  provider: string
): provider is ChatCompletionsProviderKey {
  return CHAT_COMPLETIONS_PROVIDERS.includes(
    provider as ChatCompletionsProviderKey
  )
}
