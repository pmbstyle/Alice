import { defineStore } from 'pinia'
import { useConversationStore } from './openAIStore'
import { useGeneralStore } from './generalStore'
import { listAssistantsAPI } from '../api/openAI/assistant'

export interface AliceSettings {
  VITE_OPENAI_API_KEY: string
  VITE_OPENAI_ORGANIZATION: string
  VITE_OPENAI_PROJECT: string
  VITE_OPENAI_ASSISTANT_ID: string
  VITE_GROQ_API_KEY: string
  VITE_TAVILY_API_KEY: string
  VITE_OPENWEATHERMAP_API_KEY: string
  VITE_JACKETT_API_KEY: string
  VITE_JACKETT_URL: string
  VITE_QB_URL: string
  VITE_QB_USERNAME: string
  VITE_QB_PASSWORD: string
}

const defaultSettings: AliceSettings = {
  VITE_OPENAI_API_KEY: '',
  VITE_OPENAI_ORGANIZATION: '',
  VITE_OPENAI_PROJECT: '',
  VITE_OPENAI_ASSISTANT_ID: '',
  VITE_GROQ_API_KEY: '',
  VITE_TAVILY_API_KEY: '',
  VITE_OPENWEATHERMAP_API_KEY: '',
  VITE_JACKETT_API_KEY: '',
  VITE_JACKETT_URL: '',
  VITE_QB_URL: '',
  VITE_QB_USERNAME: '',
  VITE_QB_PASSWORD: '',
}

const settingKeyToLabelMap: Record<keyof AliceSettings, string> = {
  VITE_OPENAI_API_KEY: 'OpenAI API Key',
  VITE_OPENAI_ORGANIZATION: 'OpenAI Organization ID',
  VITE_OPENAI_PROJECT: 'OpenAI Project ID',
  VITE_OPENAI_ASSISTANT_ID: 'OpenAI Assistant ID (Selected)',
  VITE_GROQ_API_KEY: 'Groq API Key',
  VITE_TAVILY_API_KEY: 'Tavily API Key',
  VITE_OPENWEATHERMAP_API_KEY: 'OpenWeatherMap API Key',
  VITE_JACKETT_API_KEY: 'Jackett API Key',
  VITE_JACKETT_URL: 'Jackett URL',
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
        'VITE_OPENAI_ASSISTANT_ID',
      ]
      return allEssentialKeys.every(key => !!state.settings[key]?.trim())
    },
    areCoreApiKeysSufficientForListAssistants(state): boolean {
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
                .filter(([key]) => key.startsWith('VITE_'))
                .map(([key, value]) => [key, String(value)])
            ),
          }

      if (!this.isProduction && import.meta.env.VITE_OPENAI_ASSISTANT_ID) {
        return {
          ...baseConfig,
          VITE_OPENAI_ASSISTANT_ID: import.meta.env
            .VITE_OPENAI_ASSISTANT_ID as string,
        }
      }
      return baseConfig
    },
  },
  actions: {
    async loadSettings() {
      if (this.initialLoadAttempted && this.isProduction) return

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
            this.settings = { ...defaultSettings, ...loaded }
          } else {
            this.settings = { ...defaultSettings }
          }
        } else {
          console.log(
            '[SettingsStore] Development: Populating settings state from .env and defaults.'
          )
          const devSettingsFromEnv: Partial<AliceSettings> = {}
          for (const key of Object.keys(defaultSettings) as Array<
            keyof AliceSettings
          >) {
            if (import.meta.env[key]) {
              devSettingsFromEnv[key] = import.meta.env[key] as string
            }
          }
          this.settings = { ...defaultSettings, ...devSettingsFromEnv }
        }
        if (this.config.VITE_OPENAI_API_KEY) {
          try {
            await listAssistantsAPI({ limit: 1 })
            this.coreOpenAISettingsValid = true
            console.log(
              '[SettingsStore] Core OpenAI API key validated on load.'
            )
          } catch (e) {
            console.warn(
              '[SettingsStore] Core OpenAI API key validation failed on load.',
              e
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

    updateSetting(key: keyof AliceSettings, value: string | boolean | number) {
      ;(this.settings as any)[key] = String(value)
      this.successMessage = null
      this.error = null
      if (key === 'VITE_OPENAI_API_KEY') {
        this.coreOpenAISettingsValid = false
      }
    },

    async saveSettingsToFile() {
      if (!this.isProduction) {
        console.log('[SettingsStore] Dev mode: Skipping saveSettingsToFile.')
        return true
      }
      this.isSaving = true
      this.error = null
      try {
        const plainSettings = { ...this.settings }
        const saveResult = await window.settingsAPI.saveSettings(plainSettings)
        if (saveResult.success) {
          console.log('[SettingsStore] Settings saved to file successfully.')
          this.isSaving = false
          return true
        } else {
          this.error = `Failed to save settings to file: ${saveResult.error || 'Unknown error'}`
          this.isSaving = false
          return false
        }
      } catch (e: any) {
        this.error = `Error during settings save: ${e.message}`
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
        this.error = `Essential setting '${settingKeyToLabelMap.VITE_OPENAI_API_KEY}' is missing for testing.`
        generalStore.statusMessage = 'Settings incomplete for API tests'
        this.isSaving = false
        return
      }

      let openAIServiceTestSuccess = false
      try {
        await listAssistantsAPI({ limit: 1 })
        openAIServiceTestSuccess = true
        this.coreOpenAISettingsValid = true
        console.log(
          '[SettingsStore] OpenAI API connection test successful (listAssistants).'
        )
      } catch (e: any) {
        this.error = `OpenAI API connection test failed: ${e.message}. Check your OpenAI API Key, Organization ID, and Project ID.`
        this.coreOpenAISettingsValid = false
      }

      if (openAIServiceTestSuccess) {
        let settingsPersisted = false
        if (this.isProduction) {
          const plainSettings = { ...this.settings }
          const saveResult =
            await window.settingsAPI.saveSettings(plainSettings)
          if (saveResult.success) {
            settingsPersisted = true
          } else {
            this.error =
              (this.error ? this.error + '; ' : '') +
              `Failed to save settings to file: ${saveResult.error || 'Unknown error'}`
            generalStore.statusMessage = 'Error saving settings.'
          }
        } else {
          settingsPersisted = true
        }

        if (settingsPersisted) {
          this.successMessage = 'OpenAI settings are valid'
          if (!this.isProduction) {
            this.successMessage +=
              ' (Dev mode - .env overrides apply for operation)'
          }
          if (this.config.VITE_OPENAI_ASSISTANT_ID) {
            generalStore.statusMessage =
              'Re-initializing Alice with current settings...'
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
                : 'Failed to initialize'
              this.error = (this.error ? this.error + '; ' : '') + initErrorMsg
              this.successMessage += ` ${initErrorMsg}`
            }
          } else {
            this.successMessage +=
              ' Please proceed to select or create an assistant.'
            generalStore.statusMessage = 'Assistant not configured.'
          }
        }
      } else {
        generalStore.statusMessage = 'Settings validation failed'
      }
      this.isSaving = false
    },
  },
})
