import { defineStore } from 'pinia'
import { useConversationStore } from './openAIStore'
import { useGeneralStore } from './generalStore'
import defaultSystemPromptFromMD from '../../docs/systemPrompt.md?raw'

export interface AliceSettings {
  VITE_OPENAI_API_KEY: string
  VITE_GROQ_API_KEY: string

  assistantModel: string
  assistantSystemPrompt: string
  assistantTemperature: number
  assistantTopP: number
  assistantTools: string[]

  VITE_JACKETT_API_KEY: string
  VITE_JACKETT_URL: string
  VITE_QB_URL: string
  VITE_QB_USERNAME: string
  VITE_QB_PASSWORD: string
}

const defaultSettings: AliceSettings = {
  VITE_OPENAI_API_KEY: '',
  VITE_GROQ_API_KEY: '',

  assistantModel: 'gpt-4.1-mini',
  assistantSystemPrompt: defaultSystemPromptFromMD,
  assistantTemperature: 0.7,
  assistantTopP: 1.0,
  assistantTools: ['get_current_datetime', 'perform_web_search'],

  VITE_JACKETT_API_KEY: '',
  VITE_JACKETT_URL: '',
  VITE_QB_URL: '',
  VITE_QB_USERNAME: '',
  VITE_QB_PASSWORD: '',
}

const settingKeyToLabelMap: Record<keyof AliceSettings, string> = {
  VITE_OPENAI_API_KEY: 'OpenAI API Key',
  VITE_GROQ_API_KEY: 'Groq API Key (STT)',

  assistantModel: 'Assistant Model',
  assistantSystemPrompt: 'Assistant System Prompt',
  assistantTemperature: 'Assistant Temperature',
  assistantTopP: 'Assistant Top P',
  assistantTools: 'Enabled Assistant Tools',

  VITE_JACKETT_API_KEY: 'Jackett API Key (Torrents)',
  VITE_JACKETT_URL: 'Jackett URL (Torrents)',
  VITE_QB_URL: 'qBittorrent URL',
  VITE_QB_USERNAME: 'qBittorrent Username',
  VITE_QB_PASSWORD: 'qBittorrent Password',
}

const ESSENTIAL_CORE_API_KEYS: (keyof AliceSettings)[] = [
  'VITE_OPENAI_API_KEY',
  'VITE_GROQ_API_KEY',
]

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: { ...defaultSettings } as AliceSettings,
    isLoading: false,
    isSaving: false,
    error: null as string | null,
    successMessage: null as string | null,
    initialLoadAttempted: false,
    coreOpenAISettingsValid: false,
  }),
  getters: {
    isProduction: (): boolean => import.meta.env.PROD,
    areEssentialSettingsProvided(state): boolean {
      if (!this.isProduction) return true
      const allEssentialKeys: (keyof AliceSettings)[] = [
        ...ESSENTIAL_CORE_API_KEYS,
        'assistantModel',
      ]
      return allEssentialKeys.every(key => {
        const value = state.settings[key]
        if (typeof value === 'string') return !!value.trim()
        if (typeof value === 'number') return true
        if (Array.isArray(value)) return true
        return false
      })
    },
    areCoreApiKeysSufficientForTesting(state): boolean {
      if (!this.isProduction) return true
      return !!state.settings.VITE_OPENAI_API_KEY?.trim()
    },
    config(state): Readonly<AliceSettings> {
      const baseConfig = this.isProduction
        ? state.settings
        : {
            ...defaultSettings,
            ...state.settings,
            ...Object.fromEntries(
              Object.entries(import.meta.env)
                .filter(
                  ([key]) =>
                    key.startsWith('VITE_') || key.startsWith('assistant')
                )
                .map(([key, value]) => [key, String(value)])
            ),
          }
      return baseConfig
    },
  },
  actions: {
    async loadSettings() {
      if (this.initialLoadAttempted && this.isProduction) {
        return
      }

      this.isLoading = true
      this.error = null
      this.successMessage = null
      this.coreOpenAISettingsValid = false
      try {
        if (this.isProduction) {
          console.log(
            '[SettingsStore] Production: Loading settings from main process...'
          )
          const loaded = await window.settingsAPI.loadSettings()
          if (loaded) {
            this.settings = {
              ...defaultSettings,
              ...(loaded as Partial<AliceSettings>),
            }
          } else {
            this.settings = { ...defaultSettings }
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
              if (key === 'assistantTemperature' || key === 'assistantTopP') {
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
          this.settings = devCombinedSettings
        }

        if (this.config.VITE_OPENAI_API_KEY) {
          try {
            const conversationStore = useConversationStore()
            await conversationStore.fetchModels()
            this.coreOpenAISettingsValid = true
            console.log(
              '[SettingsStore] Core OpenAI API key validated on load via fetchModels.'
            )
          } catch (e: any) {
            console.warn(
              `[SettingsStore] Core OpenAI API key validation failed on load: ${e.message}`
            )
            this.coreOpenAISettingsValid = false
          }
        }
      } catch (e: any) {
        this.error = `Failed to load settings: ${e.message}`
        this.settings = { ...defaultSettings }
        this.coreOpenAISettingsValid = false
      } finally {
        this.isLoading = false
        this.initialLoadAttempted = true
      }
    },

    updateSetting(
      key: keyof AliceSettings,
      value: string | boolean | number | string[]
    ) {
      if (key === 'assistantTemperature' || key === 'assistantTopP') {
        ;(this.settings as any)[key] = Number(value)
      } else if (key === 'assistantTools' && Array.isArray(value)) {
        this.settings[key] = value as string[]
      } else {
        ;(this.settings as any)[key] = String(value)
      }
      this.successMessage = null
      this.error = null
      if (key === 'VITE_OPENAI_API_KEY') {
        this.coreOpenAISettingsValid = false
      }
    },

    async saveSettingsToFile(): Promise<boolean> {
      if (!this.isProduction && !window.settingsAPI?.saveSettings) {
        console.log(
          '[SettingsStore] Dev mode (or no IPC): Skipping saveSettingsToFile.'
        )
        this.successMessage =
          'Settings updated (Dev Mode - Not saved to file unless IPC available)'
        return true
      }
      this.isSaving = true
      this.error = null
      try {
        const plainSettings: AliceSettings = {
          ...this.settings,
          assistantTools: Array.from(this.settings.assistantTools || []),
        }

        console.log('--- plainSettings for IPC ---')
        for (const key in plainSettings) {
          if (Object.prototype.hasOwnProperty.call(plainSettings, key)) {
            const value = (plainSettings as any)[key]
            console.log(
              `Key: ${key}, Type: ${typeof value}, IsArray: ${Array.isArray(value)}, Value:`,
              value
            )
          }
        }
        console.log(
          'Stringified plainSettings (for IPC):',
          JSON.stringify(plainSettings)
        )

        const saveResult = await window.settingsAPI.saveSettings(plainSettings)

        if (saveResult.success) {
          console.log('[SettingsStore] Settings saved to file successfully.')
          this.isSaving = false
          return true
        } else {
          this.error = `Failed to save settings to file: ${saveResult.error || 'Unknown error'}`
          console.error(
            '[SettingsStore saveSettingsToFile] IPC save failed:',
            saveResult.error
          )
          this.isSaving = false
          return false
        }
      } catch (e: any) {
        this.error = `Error during settings save: ${e.message}`
        console.error(
          '[SettingsStore saveSettingsToFile] Exception during save:',
          e
        )
        this.isSaving = false
        return false
      }
    },

    async saveAndTestSettings() {
      this.isSaving = true
      this.error = null
      this.successMessage = null
      this.coreOpenAISettingsValid = false
      const generalStore = useGeneralStore()
      const conversationStore = useConversationStore()

      const currentConfigForTest = this.config

      if (!currentConfigForTest.VITE_OPENAI_API_KEY?.trim()) {
        this.error = `Essential setting '${settingKeyToLabelMap.VITE_OPENAI_API_KEY}' is missing.`
        generalStore.statusMessage = 'Settings incomplete for API tests'
        this.isSaving = false
        return
      }
      if (!currentConfigForTest.assistantModel?.trim()) {
        this.error = `Essential setting '${settingKeyToLabelMap.assistantModel}' is missing.`
        generalStore.statusMessage = 'Assistant model not selected.'
        this.isSaving = false
        return
      }

      let openAIServiceTestSuccess = false
      try {
        await conversationStore.fetchModels()
        openAIServiceTestSuccess = true
        this.coreOpenAISettingsValid = true
        console.log(
          '[SettingsStore] OpenAI API connection test successful (fetchModels).'
        )
      } catch (e: any) {
        this.error = `OpenAI API connection test failed: ${e.message}. Check your OpenAI API Key.`
        this.coreOpenAISettingsValid = false
      }

      if (openAIServiceTestSuccess) {
        const settingsPersisted = await this.saveSettingsToFile()

        if (settingsPersisted) {
          this.successMessage = 'OpenAI settings are valid and saved!'
          if (!this.isProduction) {
            this.successMessage +=
              ' (Dev mode - .env might override for operation if not using UI for all settings)'
          }
          generalStore.statusMessage =
            'Re-initializing Alice with new settings...'

          if (conversationStore.isInitialized) {
            conversationStore.isInitialized = false
          }
          const initSuccess = await conversationStore.initialize()
          if (initSuccess) {
            this.successMessage += ' Alice is ready.'
            generalStore.setAudioState('IDLE')
          } else {
            const initErrorMsg = generalStore.statusMessage.includes('Error:')
              ? generalStore.statusMessage
              : 'Failed to re-initialize Alice with new settings.'
            this.error = (this.error ? this.error + '; ' : '') + initErrorMsg
            this.successMessage = `Settings valid, but ${initErrorMsg}`
          }
        } else {
          generalStore.statusMessage = 'Error saving settings to file.'
        }
      } else {
        generalStore.statusMessage = 'Settings validation failed.'
      }
      this.isSaving = false
    },
  },
})
