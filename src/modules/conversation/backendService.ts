import type { AudioState } from '../../stores/generalStore'

export interface BackendServiceDependencies {
  getConfig(): {
    sttProvider: string
    aiProvider: string
    assistantSystemPrompt: string
    VITE_OPENAI_API_KEY?: string
    VITE_OPENROUTER_API_KEY?: string
    VITE_ZAI_API_KEY?: string
    VITE_MINIMAX_API_KEY?: string
    VITE_DEEPSEEK_API_KEY?: string
    ollamaBaseUrl?: string
    lmStudioBaseUrl?: string
    zaiBaseUrl?: string
    minimaxBaseUrl?: string
    deepseekBaseUrl?: string
  }
  setStatusMessage(message: string): void
  fetchOpenAIModels(): Promise<any[]>
  transcribeWithOpenAI(audio: ArrayBuffer): Promise<string>
  transcribeWithGroq(audio: ArrayBuffer): Promise<string>
  transcribeWithGoogle(audio: ArrayBuffer): Promise<string>
  transcribeWithBackend(audio: ArrayBuffer): Promise<string>
  logInfo(...args: any[]): void
  logError(...args: any[]): void
}

export interface BackendService {
  transcribeAudioMessage(audio: ArrayBuffer): Promise<string>
  fetchModels(): Promise<any[] | undefined>
}

export function createBackendService(
  deps: BackendServiceDependencies
): BackendService {
  const transcribeAudioMessage = async (
    audioArrayBuffer: ArrayBuffer
  ): Promise<string> => {
    const { sttProvider } = deps.getConfig()
    try {
      if (sttProvider === 'openai') {
        return await deps.transcribeWithOpenAI(audioArrayBuffer)
      } else if (sttProvider === 'groq') {
        return await deps.transcribeWithGroq(audioArrayBuffer)
      } else if (sttProvider === 'google') {
        return await deps.transcribeWithGoogle(audioArrayBuffer)
      } else if (sttProvider === 'local') {
        return await deps.transcribeWithBackend(audioArrayBuffer)
      }
      throw new Error(`Unknown STT provider: ${sttProvider}`)
    } catch (error: any) {
      deps.setStatusMessage('Error: Transcription failed')
      deps.logError('Transcription service error:', error)

      if (
        sttProvider === 'local' &&
        error?.message?.includes('not initialized')
      ) {
        deps.setStatusMessage(
          'Error: Local STT service not ready. Please check backend status.'
        )
      }

      return ''
    }
  }

  const fetchModels = async () => {
    const config = deps.getConfig()
    const provider = config.aiProvider

    if (provider === 'openai' && !config.VITE_OPENAI_API_KEY) {
      deps.logInfo('Cannot fetch models: OpenAI API Key is missing.')
      return
    }
    if (provider === 'openrouter' && !config.VITE_OPENROUTER_API_KEY) {
      deps.logInfo('Cannot fetch models: OpenRouter API Key is missing.')
      return
    }
    if (provider === 'zai' && !config.VITE_ZAI_API_KEY) {
      deps.logInfo('Cannot fetch models: Z.ai API Key is missing.')
      return
    }
    if (provider === 'zai' && !config.zaiBaseUrl) {
      deps.logInfo('Cannot fetch models: Z.ai Base URL is missing.')
      return
    }
    if (provider === 'minimax' && !config.VITE_MINIMAX_API_KEY) {
      deps.logInfo('Cannot fetch models: MiniMax API Key is missing.')
      return
    }
    if (provider === 'minimax' && !config.minimaxBaseUrl) {
      deps.logInfo('Cannot fetch models: MiniMax Base URL is missing.')
      return
    }
    if (provider === 'deepseek' && !config.VITE_DEEPSEEK_API_KEY) {
      deps.logInfo('Cannot fetch models: DeepSeek API Key is missing.')
      return
    }
    if (provider === 'deepseek' && !config.deepseekBaseUrl) {
      deps.logInfo('Cannot fetch models: DeepSeek Base URL is missing.')
      return
    }
    if (provider === 'ollama' && !config.ollamaBaseUrl) {
      deps.logInfo('Cannot fetch models: Ollama Base URL is missing.')
      return
    }
    if (provider === 'lm-studio' && !config.lmStudioBaseUrl) {
      deps.logInfo('Cannot fetch models: LM Studio Base URL is missing.')
      return
    }

    try {
      return await deps.fetchOpenAIModels()
    } catch (error: any) {
      deps.logError('Failed to fetch models:', error.message)
      const providerNameMap: Record<string, string> = {
        openai: 'OpenAI',
        openrouter: 'OpenRouter',
        ollama: 'Ollama',
        'lm-studio': 'LM Studio',
        zai: 'Z.ai',
        minimax: 'MiniMax',
        deepseek: 'DeepSeek',
      }
      const providerName = providerNameMap[provider] || provider
      deps.setStatusMessage(`Error: Could not fetch ${providerName} models.`)
      return []
    }
  }

  return {
    transcribeAudioMessage,
    fetchModels,
  }
}
