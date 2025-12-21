import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useConversationStore } from './conversationStore'
import { useGeneralStore } from './generalStore'
import { reinitializeClients } from '../services/apiClients'
import defaultSystemPromptFromMD from '../../docs/systemPrompt.md?raw'

export const DEFAULT_ASSISTANT_SYSTEM_PROMPT = defaultSystemPromptFromMD

const DEFAULT_SUMMARIZATION_SYSTEM_PROMPT = `You are an expert conversation summarizer.
Your task is to create a **concise and brief** factual summary of the following conversation segment.
Focus on:
- Key topics discussed.
- Important information, facts, or preferences shared by the user or assistant.
- Decisions made.
- Any unresolved questions or outstanding tasks.

The summary should help provide context for future interactions, allowing the conversation to resume naturally.
**Keep the summary to 2-4 sentences and definitely no more than 150 words.**
Do not add any conversational fluff, commentary, or an introductory/concluding sentence like "Here is the summary:". Just provide the factual summary of the conversation transcript.`

export interface AliceSettings {
  VITE_OPENAI_API_KEY: string
  VITE_OPENROUTER_API_KEY: string
  VITE_GROQ_API_KEY: string
  VITE_GOOGLE_API_KEY: string
  sttProvider: 'openai' | 'groq' | 'google' | 'local'
  aiProvider: 'openai' | 'openrouter' | 'ollama' | 'lm-studio'

  // Local Go Backend STT settings
  localSttModel: string
  localSttLanguage: string
  localSttEnabled: boolean
  localSttWakeWord: string

  ollamaBaseUrl: string
  lmStudioBaseUrl: string

  assistantModel: string
  assistantSystemPrompt: string
  assistantTemperature: number
  assistantTopP: number
  assistantReasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  assistantVerbosity: 'low' | 'medium' | 'high'
  assistantTools: string[]
  assistantAvatar: string
  mcpServersConfig?: string
  MAX_HISTORY_MESSAGES_FOR_API: number
  SUMMARIZATION_MESSAGE_COUNT: number
  SUMMARIZATION_MODEL: string
  SUMMARIZATION_SYSTEM_PROMPT: string
  ttsProvider: 'openai' | 'google' | 'local'
  ttsVoice: 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer'
  googleTtsVoice: string
  localTtsVoice: string
  embeddingProvider: 'openai' | 'local'

  microphoneToggleHotkey: string
  mutePlaybackHotkey: string
  takeScreenshotHotkey: string

  VITE_JACKETT_API_KEY: string
  VITE_JACKETT_URL: string
  VITE_QB_URL: string
  VITE_QB_USERNAME: string
  VITE_QB_PASSWORD: string

  VITE_TAVILY_API_KEY: string

  VITE_SEARXNG_URL: string
  VITE_SEARXNG_API_KEY: string

  websocketPort: number

  approvedCommands: string[]
  onboardingCompleted: boolean
}

function hasMinimumConfigForOnboarding(config: AliceSettings): boolean {
  return Boolean(
    config.assistantModel?.trim() ||
      config.VITE_OPENAI_API_KEY?.trim() ||
      config.VITE_OPENROUTER_API_KEY?.trim() ||
      config.ollamaBaseUrl?.trim() ||
      config.lmStudioBaseUrl?.trim()
  )
}

const defaultSettings: AliceSettings = {
  VITE_OPENAI_API_KEY: '',
  VITE_OPENROUTER_API_KEY: '',
  VITE_GROQ_API_KEY: '',
  VITE_GOOGLE_API_KEY: '',
  sttProvider: 'openai',
  aiProvider: 'openai',

  localSttModel: 'whisper-base',
  localSttLanguage: 'auto',
  localSttEnabled: false,
  localSttWakeWord: 'alice',

  ollamaBaseUrl: 'http://localhost:11434',
  lmStudioBaseUrl: 'http://localhost:1234',

  assistantModel: 'gpt-4.1-mini',
  assistantSystemPrompt: defaultSystemPromptFromMD,
  assistantTemperature: 0.7,
  assistantTopP: 1.0,
  assistantReasoningEffort: 'medium',
  assistantVerbosity: 'medium',
  assistantTools: [
    'get_current_datetime',
    'perform_web_search',
    'save_memory',
    'delete_memory',
    'recall_memories',
  ],
  assistantAvatar: 'alice',
  mcpServersConfig: '[]',
  MAX_HISTORY_MESSAGES_FOR_API: 10,
  SUMMARIZATION_MESSAGE_COUNT: 20,
  SUMMARIZATION_MODEL: 'gpt-4.1-nano',
  SUMMARIZATION_SYSTEM_PROMPT: DEFAULT_SUMMARIZATION_SYSTEM_PROMPT,
  ttsProvider: 'openai',
  ttsVoice: 'nova',
  googleTtsVoice: 'en-US-Journey-F',
  localTtsVoice: 'en_US-amy-medium',
  embeddingProvider: 'openai',

  microphoneToggleHotkey: 'Alt+M',
  mutePlaybackHotkey: 'Alt+S',
  takeScreenshotHotkey: 'Alt+C',

  VITE_JACKETT_API_KEY: '',
  VITE_JACKETT_URL: '',
  VITE_QB_URL: '',
  VITE_QB_USERNAME: '',
  VITE_QB_PASSWORD: '',

  VITE_TAVILY_API_KEY: '',

  VITE_SEARXNG_URL: '',
  VITE_SEARXNG_API_KEY: '',

  websocketPort: 5421,

  approvedCommands: ['ls', 'dir'],
  onboardingCompleted: false,
}

const settingKeyToLabelMap: Record<keyof AliceSettings, string> = {
  VITE_OPENAI_API_KEY: 'OpenAI API Key',
  VITE_OPENROUTER_API_KEY: 'OpenRouter API Key',
  VITE_GROQ_API_KEY: 'Groq API Key (STT)',
  VITE_GOOGLE_API_KEY: 'Google API Key',
  sttProvider: 'Speech-to-Text Provider',
  aiProvider: 'AI Provider',

  // Local Go Backend STT labels
  localSttModel: 'Local STT Model',
  localSttLanguage: 'Language',
  localSttEnabled: 'Enable Wake Word',
  localSttWakeWord: 'Wake Word',

  ollamaBaseUrl: 'Ollama Base URL',
  lmStudioBaseUrl: 'LM Studio Base URL',

  assistantModel: 'Assistant Model',
  assistantSystemPrompt: 'Assistant System Prompt',
  assistantTemperature: 'Assistant Temperature',
  assistantTopP: 'Assistant Top P',
  assistantReasoningEffort: 'Reasoning Effort',
  assistantVerbosity: 'Response Verbosity',
  assistantTools: 'Enabled Assistant Tools',
  assistantAvatar: 'Assistant Avatar',
  MAX_HISTORY_MESSAGES_FOR_API: 'Max History Messages for API',
  SUMMARIZATION_MESSAGE_COUNT: 'Summarization Message Count',
  SUMMARIZATION_MODEL: 'Summarization Model',
  SUMMARIZATION_SYSTEM_PROMPT: 'Summarization System Prompt',
  ttsProvider: 'Text-to-Speech Provider',
  ttsVoice: 'OpenAI TTS Voice',
  googleTtsVoice: 'Google TTS Voice',
  localTtsVoice: 'Local TTS Voice',
  embeddingProvider: 'Embedding Provider',
  microphoneToggleHotkey: 'Microphone Toggle Hotkey',
  mutePlaybackHotkey: 'Mute Playback Hotkey',
  takeScreenshotHotkey: 'Take Screenshot Hotkey',

  VITE_JACKETT_API_KEY: 'Jackett API Key (Torrents)',
  VITE_JACKETT_URL: 'Jackett URL (Torrents)',
  VITE_QB_URL: 'qBittorrent URL',
  VITE_QB_USERNAME: 'qBittorrent Username',
  VITE_QB_PASSWORD: 'qBittorrent Password',

  VITE_TAVILY_API_KEY: 'Tavily API Key (Web Search)',

  VITE_SEARXNG_URL: 'SearXNG Instance URL',
  VITE_SEARXNG_API_KEY: 'SearXNG API Key (optional)',

  websocketPort: 'WebSocket Port',
  mcpServersConfig: 'MCP Servers JSON Configuration',
  approvedCommands: 'Approved Commands',
  onboardingCompleted: 'Onboarding Completed',
}

const ESSENTIAL_CORE_API_KEYS: (keyof AliceSettings)[] = [
  'VITE_OPENAI_API_KEY',
  'VITE_OPENROUTER_API_KEY',
]

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AliceSettings>({ ...defaultSettings })
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)
  const successMessage = ref<string | null>(null)
  const initialLoadAttempted = ref(false)
  const coreOpenAISettingsValid = ref(false)
  const sessionApprovedCommands = ref<string[]>([])

  const validateAndFixSettings = (
    loadedSettings: Partial<AliceSettings>
  ): { settings: AliceSettings; migrated: boolean } => {
    const validated = { ...defaultSettings, ...loadedSettings }
    let migrated = false

    // Migration: Handle old 'transformers' provider
    if ((validated.sttProvider as any) === 'transformers') {
      console.log(
        '🔄 Migrating settings: Converting old "transformers" provider to "local" (Go backend)'
      )
      validated.sttProvider = 'local'
      migrated = true

      // Migrate old transformers settings to new local settings
      if ((loadedSettings as any).transformersModel) {
        validated.localSttModel = (loadedSettings as any).transformersModel
        console.log(`📝 Migrated STT model: ${validated.localSttModel}`)
      }
      if ((loadedSettings as any).transformersLanguage) {
        validated.localSttLanguage = (
          loadedSettings as any
        ).transformersLanguage
        console.log(`🌐 Migrated STT language: ${validated.localSttLanguage}`)
      }
      if ((loadedSettings as any).transformersWakeWordEnabled !== undefined) {
        validated.localSttEnabled = (
          loadedSettings as any
        ).transformersWakeWordEnabled
        console.log(`🎤 Migrated STT enabled: ${validated.localSttEnabled}`)
      }
      if ((loadedSettings as any).transformersWakeWord) {
        validated.localSttWakeWord = (
          loadedSettings as any
        ).transformersWakeWord
        console.log(`🎯 Migrated wake word: ${validated.localSttWakeWord}`)
      }
      console.log('✅ Settings migration completed successfully')
    }

    const validSTTProviders = ['openai', 'groq', 'google', 'local'] as const
    if (!validSTTProviders.includes(validated.sttProvider as any)) {
      validated.sttProvider = 'openai'
    }

    const validAIProviders = [
      'openai',
      'openrouter',
      'ollama',
      'lm-studio',
    ] as const
    if (!validAIProviders.includes(validated.aiProvider as any)) {
      validated.aiProvider = 'openai'
    }

    if (validated.sttProvider === 'local') {
      const validModelIds = [
        'whisper-tiny.en',
        'whisper-base',
        'whisper-small',
        'whisper-medium',
        'whisper-large',
      ]
      if (!validModelIds.includes(validated.localSttModel)) {
        validated.localSttModel = validModelIds[1] || 'whisper-base'
      }
    }

    return { settings: validated, migrated }
  }

  const isProduction = computed(() => import.meta.env.PROD)

  const areEssentialSettingsProvided = computed(() => {
    if (!isProduction.value) return true
    const essentialKeys: (keyof AliceSettings)[] = [
      'assistantModel',
      'SUMMARIZATION_MODEL',
    ]

    // API keys requirements based on provider
    if (settings.value.aiProvider === 'openai') {
      essentialKeys.push('VITE_OPENAI_API_KEY')
    } else if (settings.value.aiProvider === 'openrouter') {
      essentialKeys.push('VITE_OPENROUTER_API_KEY')
    } else if (settings.value.aiProvider === 'ollama') {
      essentialKeys.push('ollamaBaseUrl')
    } else if (settings.value.aiProvider === 'lm-studio') {
      essentialKeys.push('lmStudioBaseUrl')
    }

    if (settings.value.aiProvider !== 'openai') {
      essentialKeys.push('VITE_OPENAI_API_KEY')
    }

    if (settings.value.sttProvider === 'groq') {
      essentialKeys.push('VITE_GROQ_API_KEY')
    }

    if (
      settings.value.sttProvider === 'google' ||
      settings.value.ttsProvider === 'google'
    ) {
      essentialKeys.push('VITE_GOOGLE_API_KEY')
    }

    if (settings.value.sttProvider === 'local') {
      essentialKeys.push('localSttModel')
    }

    return essentialKeys.every(key => {
      const value = settings.value[key]
      if (typeof value === 'string') return !!value.trim()
      if (typeof value === 'number') return true
      if (Array.isArray(value)) return true
      return false
    })
  })

  const areCoreApiKeysSufficientForTesting = computed(() => {
    if (!isProduction.value) return true

    const needsOpenAI =
      settings.value.aiProvider === 'openai' ||
      settings.value.aiProvider === 'openrouter' ||
      settings.value.sttProvider === 'openai'

    if (needsOpenAI && !settings.value.VITE_OPENAI_API_KEY?.trim()) {
      return false
    }

    if (settings.value.aiProvider === 'openrouter') {
      return !!settings.value.VITE_OPENROUTER_API_KEY?.trim()
    }

    if (settings.value.aiProvider === 'ollama') {
      return !!settings.value.ollamaBaseUrl?.trim()
    }

    if (settings.value.aiProvider === 'lm-studio') {
      return !!settings.value.lmStudioBaseUrl?.trim()
    }

    return true
  })

  const config = computed<Readonly<AliceSettings>>(() => {
    const baseConfig = isProduction.value
      ? settings.value
      : {
          ...defaultSettings,
          ...settings.value,
          ...Object.fromEntries(
            Object.entries(import.meta.env)
              .filter(
                ([key]) =>
                  key.startsWith('VITE_') ||
                  key.startsWith('assistant') ||
                  key === 'MAX_HISTORY_MESSAGES_FOR_API' ||
                  key === 'SUMMARIZATION_MESSAGE_COUNT' ||
                  key === 'SUMMARIZATION_MODEL' ||
                  key === 'SUMMARIZATION_SYSTEM_PROMPT' ||
                  key === 'sttProvider' ||
                  key === 'aiProvider' ||
                  key === 'onboardingCompleted'
              )
              .map(([key, value]) => {
                if (
                  key === 'MAX_HISTORY_MESSAGES_FOR_API' ||
                  key === 'SUMMARIZATION_MESSAGE_COUNT' ||
                  key === 'assistantTemperature' ||
                  key === 'assistantTopP'
                ) {
                  return [key, parseFloat(String(value))]
                }
                if (key === 'assistantTools' && typeof value === 'string') {
                  return [
                    key,
                    value
                      .split(',')
                      .map(t => t.trim())
                      .filter(Boolean),
                  ]
                }
                return [key, String(value)]
              })
          ),
        }
    return baseConfig
  })

  async function loadSettings() {
    if (initialLoadAttempted.value) {
      return
    }

    initialLoadAttempted.value = true
    isLoading.value = true
    error.value = null
    successMessage.value = null
    coreOpenAISettingsValid.value = false
    try {
      if (isProduction.value) {
        const loaded = await window.settingsAPI.loadSettings()
        if (loaded) {
          const result = validateAndFixSettings(
            loaded as Partial<AliceSettings>
          )
          settings.value = result.settings
          await ensureOnboardingStateConsistency()

          let needsSave = false
          if (result.migrated) {
            needsSave = true
            console.log('💾 Automatically saving migrated settings to file')
          }

          if (
            !settings.value.onboardingCompleted &&
            settings.value.VITE_OPENAI_API_KEY?.trim()
          ) {
            settings.value.onboardingCompleted = true
            needsSave = true
          }

          if (needsSave) {
            await saveSettingsToFile()
          }
        } else {
          const result = validateAndFixSettings({})
          settings.value = result.settings
        }
      } else {
        let devCombinedSettings: AliceSettings = { ...defaultSettings }
        if (window.settingsAPI) {
          const loadedDevSettings = await window.settingsAPI.loadSettings()
          if (loadedDevSettings) {
            devCombinedSettings = {
              ...devCombinedSettings,
              ...(loadedDevSettings as Partial<AliceSettings>),
            }

            if (
              !devCombinedSettings.onboardingCompleted &&
              (loadedDevSettings as any).VITE_OPENAI_API_KEY?.trim()
            ) {
              devCombinedSettings.onboardingCompleted = true
            }
          }
        }
        for (const key of Object.keys(defaultSettings) as Array<
          keyof AliceSettings
        >) {
          if (key === 'onboardingCompleted') {
            continue
          }

          if (import.meta.env[key]) {
            const envValue = import.meta.env[key]
            if (
              key === 'assistantTemperature' ||
              key === 'assistantTopP' ||
              key === 'MAX_HISTORY_MESSAGES_FOR_API' ||
              key === 'SUMMARIZATION_MESSAGE_COUNT'
            ) {
              ;(devCombinedSettings as any)[key] = parseFloat(
                envValue as string
              )
            } else if (
              key === 'assistantTools' &&
              typeof envValue === 'string'
            ) {
              ;(devCombinedSettings as any)[key] = envValue
                .split(',')
                .map(t => t.trim())
                .filter(Boolean)
            } else {
              ;(devCombinedSettings as any)[key] = envValue
            }
          }
        }
        try {
          const result = validateAndFixSettings(devCombinedSettings)
          settings.value = result.settings

          if (result.migrated && window.settingsAPI) {
            console.log('💾 Automatically saving migrated dev settings to file')
            await saveSettingsToFile()
          }

          await ensureOnboardingStateConsistency()
        } catch (error) {
          console.error(
            '[SettingsStore] Settings validation failed, using unvalidated settings:',
            error
          )
          settings.value = devCombinedSettings as AliceSettings
        }
      }

      if (config.value.VITE_OPENAI_API_KEY) {
        try {
          const conversationStore = useConversationStore()
          await conversationStore.fetchModels()
          coreOpenAISettingsValid.value = true
        } catch (e: any) {
          console.warn(
            `[SettingsStore] Core OpenAI API key validation failed on load: ${e.message}`
          )
          coreOpenAISettingsValid.value = false
        }
      }
    } catch (e: any) {
      error.value = `Failed to load settings: ${e.message}`
      settings.value = { ...defaultSettings }
      coreOpenAISettingsValid.value = false
    } finally {
      isLoading.value = false
    }
  }

  async function ensureOnboardingStateConsistency() {
    if (settings.value.onboardingCompleted) {
      return
    }

    if (!hasMinimumConfigForOnboarding(settings.value)) {
      return
    }

    settings.value.onboardingCompleted = true
    try {
      await saveSettingsToFile()
    } catch (error) {
      console.warn(
        '[SettingsStore] Failed to persist onboarding completion state:',
        error
      )
    }
  }

  function updateSetting(
    key: keyof AliceSettings,
    value: string | boolean | number | string[]
  ) {
    if (
      key === 'assistantTemperature' ||
      key === 'assistantTopP' ||
      key === 'MAX_HISTORY_MESSAGES_FOR_API' ||
      key === 'SUMMARIZATION_MESSAGE_COUNT' ||
      key === 'websocketPort'
    ) {
      ;(settings.value as any)[key] = Number(value)
    } else if (key === 'assistantTools' && Array.isArray(value)) {
      settings.value[key] = value as string[]
    } else {
      ;(settings.value as any)[key] = String(value)
    }
    if (key === 'sttProvider') {
      settings.value[key] = value as 'openai' | 'groq' | 'google' | 'local'
    }
    if (key === 'aiProvider') {
      settings.value[key] = value as
        | 'openai'
        | 'openrouter'
        | 'ollama'
        | 'lm-studio'
    }
    if (key === 'assistantReasoningEffort') {
      settings.value[key] = value as 'minimal' | 'low' | 'medium' | 'high'
    }
    if (key === 'assistantVerbosity') {
      settings.value[key] = value as 'low' | 'medium' | 'high'
    }
    if (key === 'localSttModel') {
      settings.value[key] = value as string
    }
    if (key === 'localSttLanguage') {
      settings.value[key] = value as string
    }
    if (key === 'localSttEnabled') {
      settings.value[key] = value as boolean
    }
    if (key === 'ttsProvider') {
      settings.value[key] = value as 'openai' | 'google' | 'local'
    }
    if (key === 'localTtsVoice') {
      settings.value[key] = value as string
    }
    if (key === 'googleTtsVoice') {
      settings.value[key] = value as string
    }
    if (key === 'embeddingProvider') {
      settings.value[key] = value as 'openai' | 'local'
    }

    successMessage.value = null
    error.value = null
    if (
      key === 'VITE_OPENAI_API_KEY' ||
      key === 'VITE_OPENROUTER_API_KEY' ||
      key === 'ollamaBaseUrl' ||
      key === 'lmStudioBaseUrl' ||
      key === 'aiProvider'
    ) {
      coreOpenAISettingsValid.value = false
    }
  }

  async function saveSettingsToFile(): Promise<boolean> {
    if (!isProduction.value && !window.settingsAPI?.saveSettings) {
      successMessage.value =
        'Settings updated (Dev Mode - Not saved to file unless IPC available)'
      return true
    }
    isSaving.value = true
    error.value = null
    try {
      const plainSettings: AliceSettings = {
        VITE_OPENAI_API_KEY: settings.value.VITE_OPENAI_API_KEY,
        VITE_OPENROUTER_API_KEY: settings.value.VITE_OPENROUTER_API_KEY,
        VITE_GROQ_API_KEY: settings.value.VITE_GROQ_API_KEY,
        VITE_GOOGLE_API_KEY: settings.value.VITE_GOOGLE_API_KEY,
        sttProvider: settings.value.sttProvider,
        aiProvider: settings.value.aiProvider,

        localSttModel: settings.value.localSttModel,
        localSttLanguage: settings.value.localSttLanguage,
        localSttEnabled: settings.value.localSttEnabled,
        localSttWakeWord: settings.value.localSttWakeWord,

        ollamaBaseUrl: settings.value.ollamaBaseUrl,
        lmStudioBaseUrl: settings.value.lmStudioBaseUrl,
        assistantModel: settings.value.assistantModel,
        assistantSystemPrompt: settings.value.assistantSystemPrompt,
        assistantTemperature: settings.value.assistantTemperature,
        assistantTopP: settings.value.assistantTopP,
        assistantReasoningEffort: settings.value.assistantReasoningEffort,
        assistantVerbosity: settings.value.assistantVerbosity,
        assistantTools: Array.from(settings.value.assistantTools || []),
        assistantAvatar: settings.value.assistantAvatar,
        mcpServersConfig: settings.value.mcpServersConfig,
        MAX_HISTORY_MESSAGES_FOR_API:
          settings.value.MAX_HISTORY_MESSAGES_FOR_API,
        SUMMARIZATION_MESSAGE_COUNT: settings.value.SUMMARIZATION_MESSAGE_COUNT,
        SUMMARIZATION_MODEL: settings.value.SUMMARIZATION_MODEL,
        SUMMARIZATION_SYSTEM_PROMPT: settings.value.SUMMARIZATION_SYSTEM_PROMPT,
        ttsProvider: settings.value.ttsProvider,
        ttsVoice: settings.value.ttsVoice,
        googleTtsVoice: settings.value.googleTtsVoice,
        localTtsVoice: settings.value.localTtsVoice,
        embeddingProvider: settings.value.embeddingProvider,
        microphoneToggleHotkey: settings.value.microphoneToggleHotkey,
        mutePlaybackHotkey: settings.value.mutePlaybackHotkey,
        takeScreenshotHotkey: settings.value.takeScreenshotHotkey,
        VITE_JACKETT_API_KEY: settings.value.VITE_JACKETT_API_KEY,
        VITE_JACKETT_URL: settings.value.VITE_JACKETT_URL,
        VITE_QB_URL: settings.value.VITE_QB_URL,
        VITE_QB_USERNAME: settings.value.VITE_QB_USERNAME,
        VITE_QB_PASSWORD: settings.value.VITE_QB_PASSWORD,
        VITE_TAVILY_API_KEY: settings.value.VITE_TAVILY_API_KEY,
        VITE_SEARXNG_URL: settings.value.VITE_SEARXNG_URL,
        VITE_SEARXNG_API_KEY: settings.value.VITE_SEARXNG_API_KEY,
        websocketPort: settings.value.websocketPort,
        approvedCommands: Array.from(settings.value.approvedCommands || []),
        onboardingCompleted: settings.value.onboardingCompleted,
      }

      const saveResult = await window.settingsAPI.saveSettings(plainSettings)

      if (saveResult.success) {
        isSaving.value = false
        return true
      } else {
        error.value = `Failed to save settings to file: ${saveResult.error || 'Unknown error'}`
        console.error(
          '[SettingsStore saveSettingsToFile] IPC save failed:',
          saveResult.error
        )
        isSaving.value = false
        return false
      }
    } catch (e: any) {
      error.value = `Error during settings save: ${e.message}`
      console.error(
        '[SettingsStore saveSettingsToFile] Exception during save:',
        e
      )
      isSaving.value = false
      return false
    }
  }

  async function saveAndTestSettings() {
    isSaving.value = true
    error.value = null
    successMessage.value = null
    const generalStore = useGeneralStore()
    const conversationStore = useConversationStore()

    const currentConfigForTest = config.value

    if (currentConfigForTest.aiProvider === 'openai') {
      if (!currentConfigForTest.VITE_OPENAI_API_KEY?.trim()) {
        error.value = `Essential setting '${settingKeyToLabelMap.VITE_OPENAI_API_KEY}' is missing.`
        generalStore.statusMessage = 'OpenAI API Key is required.'
        isSaving.value = false
        return
      }
    } else if (currentConfigForTest.aiProvider === 'openrouter') {
      if (!currentConfigForTest.VITE_OPENROUTER_API_KEY?.trim()) {
        error.value = `Essential setting '${settingKeyToLabelMap.VITE_OPENROUTER_API_KEY}' is missing.`
        generalStore.statusMessage = 'OpenRouter API Key is required.'
        isSaving.value = false
        return
      }
      if (!currentConfigForTest.VITE_OPENAI_API_KEY?.trim()) {
        error.value = `Essential setting '${settingKeyToLabelMap.VITE_OPENAI_API_KEY}' is missing. Required for TTS/STT/embeddings.`
        generalStore.statusMessage =
          'OpenAI API Key is required for TTS/STT/embeddings.'
        isSaving.value = false
        return
      }
    } else if (currentConfigForTest.aiProvider === 'ollama') {
      if (!currentConfigForTest.ollamaBaseUrl?.trim()) {
        error.value = `Essential setting '${settingKeyToLabelMap.ollamaBaseUrl}' is missing.`
        generalStore.statusMessage = 'Ollama Base URL is required.'
        isSaving.value = false
        return
      }
      if (!currentConfigForTest.VITE_OPENAI_API_KEY?.trim()) {
        error.value = `Essential setting '${settingKeyToLabelMap.VITE_OPENAI_API_KEY}' is missing. Required for TTS/STT/embeddings.`
        generalStore.statusMessage =
          'OpenAI API Key is required for TTS/STT/embeddings.'
        isSaving.value = false
        return
      }
    } else if (currentConfigForTest.aiProvider === 'lm-studio') {
      if (!currentConfigForTest.lmStudioBaseUrl?.trim()) {
        error.value = `Essential setting '${settingKeyToLabelMap.lmStudioBaseUrl}' is missing.`
        generalStore.statusMessage = 'LM Studio Base URL is required.'
        isSaving.value = false
        return
      }
      if (!currentConfigForTest.VITE_OPENAI_API_KEY?.trim()) {
        error.value = `Essential setting '${settingKeyToLabelMap.VITE_OPENAI_API_KEY}' is missing. Required for TTS/STT/embeddings.`
        generalStore.statusMessage =
          'OpenAI API Key is required for TTS/STT/embeddings.'
        isSaving.value = false
        return
      }
    }

    if (
      currentConfigForTest.sttProvider === 'groq' &&
      !currentConfigForTest.VITE_GROQ_API_KEY?.trim()
    ) {
      error.value = `Groq STT is selected, but '${settingKeyToLabelMap.VITE_GROQ_API_KEY}' is missing.`
      generalStore.statusMessage = 'Groq API Key is required for Groq STT.'
      isSaving.value = false
      return
    }

    if (
      (currentConfigForTest.sttProvider === 'google' ||
        currentConfigForTest.ttsProvider === 'google') &&
      !currentConfigForTest.VITE_GOOGLE_API_KEY?.trim()
    ) {
      error.value = `Google is selected, but '${settingKeyToLabelMap.VITE_GOOGLE_API_KEY}' is missing.`
      generalStore.statusMessage =
        'Google API Key is required for Google services.'
      isSaving.value = false
      return
    }

    const settingsPersistedInitially = await saveSettingsToFile()
    if (!settingsPersistedInitially) {
      generalStore.statusMessage = 'Error saving settings to file.'
      return
    }

    reinitializeClients()

    let openAIServiceTestSuccess = false
    try {
      await conversationStore.fetchModels()
      openAIServiceTestSuccess = true
      coreOpenAISettingsValid.value = true
    } catch (e: any) {
      const providerNameMap = {
        openai: 'OpenAI',
        openrouter: 'OpenRouter',
        ollama: 'Ollama',
        'lm-studio': 'LM Studio',
      }
      const providerName =
        providerNameMap[currentConfigForTest.aiProvider] ||
        currentConfigForTest.aiProvider
      error.value = `${providerName} API connection test failed: ${e.message}. Check your ${providerName} configuration.`
      coreOpenAISettingsValid.value = false
      openAIServiceTestSuccess = false
    }

    if (openAIServiceTestSuccess) {
      if (!currentConfigForTest.assistantModel?.trim()) {
        const providerNameMap = {
          openai: 'OpenAI',
          openrouter: 'OpenRouter',
          ollama: 'Ollama',
          'lm-studio': 'LM Studio',
        }
        const providerName =
          providerNameMap[currentConfigForTest.aiProvider] ||
          currentConfigForTest.aiProvider
        error.value = `${providerName} connection is valid. Please select an '${settingKeyToLabelMap.assistantModel}'.`
        generalStore.statusMessage = 'Assistant model not selected.'
        successMessage.value = `${providerName} connection is valid. Models loaded. Please complete model selections.`
        isSaving.value = false
        return
      }
      if (!currentConfigForTest.SUMMARIZATION_MODEL?.trim()) {
        const providerNameMap = {
          openai: 'OpenAI',
          openrouter: 'OpenRouter',
          ollama: 'Ollama',
          'lm-studio': 'LM Studio',
        }
        const providerName =
          providerNameMap[currentConfigForTest.aiProvider] ||
          currentConfigForTest.aiProvider
        error.value = `${providerName} connection is valid. Please select a '${settingKeyToLabelMap.SUMMARIZATION_MODEL}'.`
        generalStore.statusMessage = 'Summarization model not selected.'
        successMessage.value = `${providerName} connection is valid. Models loaded. Please complete model selections.`
        isSaving.value = false
        return
      }

      successMessage.value = 'Settings are valid and saved!'
      if (!isProduction.value) {
        successMessage.value +=
          ' (Dev mode - .env might override for operation if not using UI for all settings)'
      }
      generalStore.statusMessage = 'Re-initializing Alice with new settings...'

      if (conversationStore.isInitialized) {
        conversationStore.isInitialized = false
      }
      const initSuccess = await conversationStore.initialize()
      if (initSuccess) {
        successMessage.value += ' Alice is ready.'
        generalStore.setAudioState('IDLE')
      } else {
        const initErrorMsg = generalStore.statusMessage.includes('Error:')
          ? generalStore.statusMessage
          : 'Failed to re-initialize Alice with new settings.'
        error.value = (error.value ? error.value + '; ' : '') + initErrorMsg
        successMessage.value = `Settings valid, but ${initErrorMsg}`
      }
    } else {
      generalStore.statusMessage =
        'Settings validation failed. Check API Key(s).'
    }
    isSaving.value = false
    setTimeout(() => {
      successMessage.value = null
    }, 5000)
  }

  async function completeOnboarding(onboardingData: {
    VITE_OPENAI_API_KEY: string
    VITE_OPENROUTER_API_KEY: string
    sttProvider: 'openai' | 'groq' | 'google' | 'local'
    ttsProvider?: 'openai' | 'google' | 'local'
    embeddingProvider?: 'openai' | 'local'
    aiProvider: 'openai' | 'openrouter' | 'ollama' | 'lm-studio'
    assistantModel?: string
    summarizationModel?: string
    VITE_GROQ_API_KEY: string
    VITE_GOOGLE_API_KEY: string
    ollamaBaseUrl?: string
    lmStudioBaseUrl?: string
    useLocalModels?: boolean
    localSttLanguage?: string
  }) {
    settings.value.VITE_OPENAI_API_KEY = onboardingData.VITE_OPENAI_API_KEY
    settings.value.VITE_OPENROUTER_API_KEY =
      onboardingData.VITE_OPENROUTER_API_KEY
    settings.value.sttProvider = onboardingData.sttProvider
    settings.value.aiProvider = onboardingData.aiProvider
    settings.value.VITE_GROQ_API_KEY = onboardingData.VITE_GROQ_API_KEY
    settings.value.VITE_GOOGLE_API_KEY = onboardingData.VITE_GOOGLE_API_KEY

    // Set models if provided
    if (onboardingData.assistantModel) {
      settings.value.assistantModel = onboardingData.assistantModel
    }
    if (onboardingData.summarizationModel) {
      settings.value.SUMMARIZATION_MODEL = onboardingData.summarizationModel
    }

    if (onboardingData.localSttLanguage) {
      settings.value.localSttLanguage = onboardingData.localSttLanguage
    }

    // Set TTS and embedding providers based on local models preference
    if (onboardingData.useLocalModels) {
      settings.value.ttsProvider = 'local'
      settings.value.embeddingProvider = 'local'
    } else {
      // Respect the user's choice from the wizard if available, otherwise default to openai
      settings.value.ttsProvider = onboardingData.ttsProvider || 'openai'
      settings.value.embeddingProvider =
        onboardingData.embeddingProvider || 'openai'
    }

    if (onboardingData.ollamaBaseUrl) {
      settings.value.ollamaBaseUrl = onboardingData.ollamaBaseUrl
    }
    if (onboardingData.lmStudioBaseUrl) {
      settings.value.lmStudioBaseUrl = onboardingData.lmStudioBaseUrl
    }

    settings.value.onboardingCompleted = true

    const success = await saveSettingsToFile()
    if (success) {
      reinitializeClients()
      const conversationStore = useConversationStore()
      await conversationStore.initialize()
      isSaving.value = false
    }
    return success
  }

  function addApprovedCommand(command: string) {
    const commandName = command.split(' ')[0]
    if (!settings.value.approvedCommands.includes(commandName)) {
      settings.value.approvedCommands.push(commandName)
      saveSettingsToFile()
    }
  }

  function addSessionApprovedCommand(command: string) {
    const commandName = command.split(' ')[0]
    if (!sessionApprovedCommands.value.includes(commandName)) {
      sessionApprovedCommands.value.push(commandName)
    }
  }

  function isCommandApproved(command: string): boolean {
    const commandName = command.split(' ')[0]
    return (
      settings.value.approvedCommands.includes(commandName) ||
      sessionApprovedCommands.value.includes(commandName)
    )
  }

  async function removeApprovedCommand(command: string) {
    const commandName = command.split(' ')[0]
    const index = settings.value.approvedCommands.indexOf(commandName)
    if (index > -1) {
      settings.value.approvedCommands.splice(index, 1)
      await saveSettingsToFile()
    }
  }

  return {
    settings,
    isLoading,
    isSaving,
    error,
    successMessage,
    initialLoadAttempted,
    coreOpenAISettingsValid,
    sessionApprovedCommands,
    isProduction,
    areEssentialSettingsProvided,
    areCoreApiKeysSufficientForTesting,
    config,
    loadSettings,
    updateSetting,
    saveSettingsToFile,
    saveAndTestSettings,
    completeOnboarding,
    addApprovedCommand,
    addSessionApprovedCommand,
    isCommandApproved,
    removeApprovedCommand,
  }
})
