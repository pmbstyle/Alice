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
  VITE_GROQ_API_KEY: string
  sttProvider: 'openai' | 'groq'

  assistantModel: string
  assistantSystemPrompt: string
  assistantTemperature: number
  assistantTopP: number
  assistantTools: string[]
  mcpServersConfig?: string
  MAX_HISTORY_MESSAGES_FOR_API: number
  SUMMARIZATION_MESSAGE_COUNT: number
  SUMMARIZATION_MODEL: string
  SUMMARIZATION_SYSTEM_PROMPT: string
  ttsVoice: 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer'

  microphoneToggleHotkey: string
  mutePlaybackHotkey: string
  takeScreenshotHotkey: string

  VITE_JACKETT_API_KEY: string
  VITE_JACKETT_URL: string
  VITE_QB_URL: string
  VITE_QB_USERNAME: string
  VITE_QB_PASSWORD: string

  approvedCommands: string[]
  onboardingCompleted: boolean
}

const defaultSettings: AliceSettings = {
  VITE_OPENAI_API_KEY: '',
  VITE_GROQ_API_KEY: '',
  sttProvider: 'openai',

  assistantModel: 'gpt-4.1-mini',
  assistantSystemPrompt: defaultSystemPromptFromMD,
  assistantTemperature: 0.7,
  assistantTopP: 1.0,
  assistantTools: ['get_current_datetime', 'perform_web_search'],
  mcpServersConfig: '[]',
  MAX_HISTORY_MESSAGES_FOR_API: 10,
  SUMMARIZATION_MESSAGE_COUNT: 20,
  SUMMARIZATION_MODEL: 'gpt-4.1-nano',
  SUMMARIZATION_SYSTEM_PROMPT: DEFAULT_SUMMARIZATION_SYSTEM_PROMPT,
  ttsVoice: 'nova',

  microphoneToggleHotkey: 'Alt+M',
  mutePlaybackHotkey: 'Alt+S',
  takeScreenshotHotkey: 'Alt+C',

  VITE_JACKETT_API_KEY: '',
  VITE_JACKETT_URL: '',
  VITE_QB_URL: '',
  VITE_QB_USERNAME: '',
  VITE_QB_PASSWORD: '',

  approvedCommands: ['ls', 'dir'],
  onboardingCompleted: false,
}

const settingKeyToLabelMap: Record<keyof AliceSettings, string> = {
  VITE_OPENAI_API_KEY: 'OpenAI API Key',
  VITE_GROQ_API_KEY: 'Groq API Key (STT)',
  sttProvider: 'Speech-to-Text Provider',

  assistantModel: 'Assistant Model',
  assistantSystemPrompt: 'Assistant System Prompt',
  assistantTemperature: 'Assistant Temperature',
  assistantTopP: 'Assistant Top P',
  assistantTools: 'Enabled Assistant Tools',
  MAX_HISTORY_MESSAGES_FOR_API: 'Max History Messages for API',
  SUMMARIZATION_MESSAGE_COUNT: 'Summarization Message Count',
  SUMMARIZATION_MODEL: 'Summarization Model',
  SUMMARIZATION_SYSTEM_PROMPT: 'Summarization System Prompt',
  ttsVoice: 'Text-to-Speech Voice',
  microphoneToggleHotkey: 'Microphone Toggle Hotkey',
  mutePlaybackHotkey: 'Mute Playback Hotkey',
  takeScreenshotHotkey: 'Take Screenshot Hotkey',

  VITE_JACKETT_API_KEY: 'Jackett API Key (Torrents)',
  VITE_JACKETT_URL: 'Jackett URL (Torrents)',
  VITE_QB_URL: 'qBittorrent URL',
  VITE_QB_USERNAME: 'qBittorrent Username',
  VITE_QB_PASSWORD: 'qBittorrent Password',
  mcpServersConfig: 'MCP Servers JSON Configuration',
  approvedCommands: 'Approved Commands',
  onboardingCompleted: 'Onboarding Completed',
}

const ESSENTIAL_CORE_API_KEYS: (keyof AliceSettings)[] = ['VITE_OPENAI_API_KEY']

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AliceSettings>({ ...defaultSettings })
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)
  const successMessage = ref<string | null>(null)
  const initialLoadAttempted = ref(false)
  const coreOpenAISettingsValid = ref(false)
  const sessionApprovedCommands = ref<string[]>([])

  const isProduction = computed(() => import.meta.env.PROD)

  const areEssentialSettingsProvided = computed(() => {
    if (!isProduction.value) return true
    const essentialKeys: (keyof AliceSettings)[] = [
      'VITE_OPENAI_API_KEY',
      'assistantModel',
      'SUMMARIZATION_MODEL',
    ]
    if (settings.value.sttProvider === 'groq') {
      essentialKeys.push('VITE_GROQ_API_KEY')
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
    return !!settings.value.VITE_OPENAI_API_KEY?.trim()
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
    if (initialLoadAttempted.value && isProduction.value) {
      return
    }

    isLoading.value = true
    error.value = null
    successMessage.value = null
    coreOpenAISettingsValid.value = false
    try {
      if (isProduction.value) {
        console.log(
          '[SettingsStore] Production: Loading settings from main process...'
        )
        const loaded = await window.settingsAPI.loadSettings()
        if (loaded) {
          settings.value = {
            ...defaultSettings,
            ...(loaded as Partial<AliceSettings>),
          }
          if (
            !settings.value.onboardingCompleted &&
            settings.value.VITE_OPENAI_API_KEY?.trim()
          ) {
            console.log(
              '[SettingsStore] Existing user with API key found, auto-completing onboarding'
            )
            settings.value.onboardingCompleted = true
            await saveSettingsToFile()
          }
        } else {
          settings.value = { ...defaultSettings }
        }
      } else {
        console.log(
          '[SettingsStore] Development: Populating with defaults, persisted dev settings, then .env.'
        )
        let devCombinedSettings: AliceSettings = { ...defaultSettings }
        if (window.settingsAPI) {
          const loadedDevSettings = await window.settingsAPI.loadSettings()
          if (loadedDevSettings) {
            devCombinedSettings = {
              ...devCombinedSettings,
              ...(loadedDevSettings as Partial<AliceSettings>),
            }
          }
        }
        for (const key of Object.keys(defaultSettings) as Array<
          keyof AliceSettings
        >) {
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
        settings.value = devCombinedSettings

        if (
          !settings.value.onboardingCompleted &&
          settings.value.VITE_OPENAI_API_KEY?.trim()
        ) {
          console.log(
            '[SettingsStore] Dev: Existing user with API key found, auto-completing onboarding'
          )
          settings.value.onboardingCompleted = true
          if (window.settingsAPI?.saveSettings) {
            await saveSettingsToFile()
          }
        }
      }

      if (config.value.VITE_OPENAI_API_KEY) {
        try {
          const conversationStore = useConversationStore()
          await conversationStore.fetchModels()
          coreOpenAISettingsValid.value = true
          console.log(
            '[SettingsStore] Core OpenAI API key validated on load via fetchModels.'
          )
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
      initialLoadAttempted.value = true
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
      key === 'SUMMARIZATION_MESSAGE_COUNT'
    ) {
      ;(settings.value as any)[key] = Number(value)
    } else if (key === 'assistantTools' && Array.isArray(value)) {
      settings.value[key] = value as string[]
    } else {
      ;(settings.value as any)[key] = String(value)
    }
    if (key === 'sttProvider') {
      settings.value[key] = value as 'openai' | 'groq'
    }

    successMessage.value = null
    error.value = null
    if (key === 'VITE_OPENAI_API_KEY') {
      coreOpenAISettingsValid.value = false
    }
  }

  async function saveSettingsToFile(): Promise<boolean> {
    if (!isProduction.value && !window.settingsAPI?.saveSettings) {
      console.log(
        '[SettingsStore] Dev mode (or no IPC): Skipping saveSettingsToFile.'
      )
      successMessage.value =
        'Settings updated (Dev Mode - Not saved to file unless IPC available)'
      return true
    }
    isSaving.value = true
    error.value = null
    try {
      const plainSettings: AliceSettings = {
        VITE_OPENAI_API_KEY: settings.value.VITE_OPENAI_API_KEY,
        VITE_GROQ_API_KEY: settings.value.VITE_GROQ_API_KEY,
        sttProvider: settings.value.sttProvider,
        assistantModel: settings.value.assistantModel,
        assistantSystemPrompt: settings.value.assistantSystemPrompt,
        assistantTemperature: settings.value.assistantTemperature,
        assistantTopP: settings.value.assistantTopP,
        assistantTools: Array.from(settings.value.assistantTools || []),
        mcpServersConfig: settings.value.mcpServersConfig,
        MAX_HISTORY_MESSAGES_FOR_API: settings.value.MAX_HISTORY_MESSAGES_FOR_API,
        SUMMARIZATION_MESSAGE_COUNT: settings.value.SUMMARIZATION_MESSAGE_COUNT,
        SUMMARIZATION_MODEL: settings.value.SUMMARIZATION_MODEL,
        SUMMARIZATION_SYSTEM_PROMPT: settings.value.SUMMARIZATION_SYSTEM_PROMPT,
        ttsVoice: settings.value.ttsVoice,
        microphoneToggleHotkey: settings.value.microphoneToggleHotkey,
        mutePlaybackHotkey: settings.value.mutePlaybackHotkey,
        takeScreenshotHotkey: settings.value.takeScreenshotHotkey,
        VITE_JACKETT_API_KEY: settings.value.VITE_JACKETT_API_KEY,
        VITE_JACKETT_URL: settings.value.VITE_JACKETT_URL,
        VITE_QB_URL: settings.value.VITE_QB_URL,
        VITE_QB_USERNAME: settings.value.VITE_QB_USERNAME,
        VITE_QB_PASSWORD: settings.value.VITE_QB_PASSWORD,
        approvedCommands: Array.from(settings.value.approvedCommands || []),
        onboardingCompleted: settings.value.onboardingCompleted,
      }

      const saveResult = await window.settingsAPI.saveSettings(plainSettings)

      if (saveResult.success) {
        console.log('[SettingsStore] Settings saved to file successfully.')
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

    if (!currentConfigForTest.VITE_OPENAI_API_KEY?.trim()) {
      error.value = `Essential setting '${settingKeyToLabelMap.VITE_OPENAI_API_KEY}' is missing.`
      generalStore.statusMessage = 'OpenAI API Key is required.'
      isSaving.value = false
      return
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
      console.log(
        '[SettingsStore] OpenAI API connection test successful (fetchModels).'
      )
    } catch (e: any) {
      error.value = `OpenAI API connection test failed: ${e.message}. Check your OpenAI API Key.`
      coreOpenAISettingsValid.value = false
      openAIServiceTestSuccess = false
    }

    if (openAIServiceTestSuccess) {
      if (!currentConfigForTest.assistantModel?.trim()) {
        error.value = `OpenAI API Key is valid. Please select an '${settingKeyToLabelMap.assistantModel}'.`
        generalStore.statusMessage = 'Assistant model not selected.'
        successMessage.value =
          'OpenAI API Key is valid. Models loaded. Please complete model selections.'
        isSaving.value = false
        return
      }
      if (!currentConfigForTest.SUMMARIZATION_MODEL?.trim()) {
        error.value = `OpenAI API Key is valid. Please select a '${settingKeyToLabelMap.SUMMARIZATION_MODEL}'.`
        generalStore.statusMessage = 'Summarization model not selected.'
        successMessage.value =
          'OpenAI API Key is valid. Models loaded. Please complete model selections.'
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
  }

  async function completeOnboarding(onboardingData: {
    VITE_OPENAI_API_KEY: string
    sttProvider: 'openai' | 'groq'
    VITE_GROQ_API_KEY: string
  }) {
    console.log('[SettingsStore] Completing onboarding...')

    settings.value.VITE_OPENAI_API_KEY = onboardingData.VITE_OPENAI_API_KEY
    settings.value.sttProvider = onboardingData.sttProvider
    settings.value.VITE_GROQ_API_KEY = onboardingData.VITE_GROQ_API_KEY

    settings.value.onboardingCompleted = true

    const success = await saveSettingsToFile()
    if (success) {
      console.log(
        '[SettingsStore] Onboarding settings saved. Re-initializing clients.'
      )
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
