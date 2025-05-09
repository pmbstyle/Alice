import { defineStore } from 'pinia'
import OpenAI from 'openai'
import Groq from 'groq-sdk'
import { Pinecone } from '@pinecone-database/pinecone'
import { createClient } from '@supabase/supabase-js'
import { useConversationStore } from './openAIStore'
import { useGeneralStore } from './generalStore'

export interface AliceSettings {
  VITE_OPENAI_API_KEY: string
  VITE_OPENAI_ORGANIZATION: string
  VITE_OPENAI_PROJECT: string
  VITE_OPENAI_ASSISTANT_ID: string
  VITE_GROQ_API_KEY: string
  VITE_PINECONE_API_KEY: string
  VITE_PINECONE_BASE_URL: string
  VITE_PINECONE_ENV: string
  VITE_PINECONE_INDEX: string
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_KEY: string
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
  VITE_PINECONE_API_KEY: '',
  VITE_PINECONE_BASE_URL: '',
  VITE_PINECONE_ENV: '',
  VITE_PINECONE_INDEX: '',
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_KEY: '',
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
  VITE_OPENAI_ASSISTANT_ID: 'OpenAI Assistant ID',
  VITE_GROQ_API_KEY: 'Groq API Key',
  VITE_PINECONE_API_KEY: 'Pinecone API Key',
  VITE_PINECONE_BASE_URL: 'Pinecone Base URL (Control Plane)',
  VITE_PINECONE_ENV: 'Pinecone Environment (Index Host Suffix)',
  VITE_PINECONE_INDEX: 'Pinecone Index Name',
  VITE_SUPABASE_URL: 'Supabase Project URL',
  VITE_SUPABASE_KEY: 'Supabase Anon Public Key',
  VITE_TAVILY_API_KEY: 'Tavily API Key',
  VITE_OPENWEATHERMAP_API_KEY: 'OpenWeatherMap API Key',
  VITE_JACKETT_API_KEY: 'Jackett API Key',
  VITE_JACKETT_URL: 'Jackett URL',
  VITE_QB_URL: 'qBittorrent URL',
  VITE_QB_USERNAME: 'qBittorrent Username',
  VITE_QB_PASSWORD: 'qBittorrent Password',
}

const ESSENTIAL_SETTINGS_KEYS: (keyof AliceSettings)[] = [
  'VITE_OPENAI_API_KEY',
  'VITE_OPENAI_ASSISTANT_ID',
  'VITE_GROQ_API_KEY',
  'VITE_PINECONE_API_KEY',
  'VITE_PINECONE_ENV',
  'VITE_PINECONE_INDEX',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_KEY',
]

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: { ...defaultSettings } as AliceSettings,
    isLoading: false,
    isSaving: false,
    error: null as string | null,
    successMessage: null as string | null,
    initialLoadAttempted: false,
  }),
  getters: {
    isProduction: (): boolean => import.meta.env.PROD,
    areEssentialSettingsProvided(state): boolean {
      if (!this.isProduction) return true
      return ESSENTIAL_SETTINGS_KEYS.every(key => !!state.settings[key]?.trim())
    },
    config(state): Readonly<AliceSettings> {
      if (!this.isProduction) {
        const devSettings: Partial<AliceSettings> = {}
        for (const key in defaultSettings) {
          if (import.meta.env[key]) {
            devSettings[key as keyof AliceSettings] = import.meta.env[
              key
            ] as string
          }
        }
        return { ...state.settings, ...devSettings }
      }
      return state.settings
    },
  },
  actions: {
    async loadSettings() {
      if (this.initialLoadAttempted && this.isProduction) return

      this.isLoading = true
      this.error = null
      this.successMessage = null
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
            '[SettingsStore] Development: Populating settings state from import.meta.env.'
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
      } catch (e: any) {
        this.error = `Failed to load settings: ${e.message}`
        this.settings = { ...defaultSettings }
      } finally {
        this.isLoading = false
        this.initialLoadAttempted = true
        console.log(
          '[SettingsStore] Settings load attempt complete. Current state.settings:',
          JSON.parse(JSON.stringify(this.settings))
        )
        console.log(
          '[SettingsStore] Current config via getter:',
          JSON.parse(JSON.stringify(this.config))
        )
      }
    },

    updateSetting(key: keyof AliceSettings, value: string) {
      this.settings[key] = value
      this.successMessage = null
      this.error = null
    },

    async saveAndTestSettings() {
      this.isSaving = true
      this.error = null
      this.successMessage = null
      const generalStore = useGeneralStore()
      const conversationStore = useConversationStore()

      const currentConfigForTest = this.config

      if (this.isProduction) {
        const missingProdKey = ESSENTIAL_SETTINGS_KEYS.find(
          key => !currentConfigForTest[key]?.trim()
        )
        if (missingProdKey) {
          const friendlyName =
            settingKeyToLabelMap[missingProdKey] || missingProdKey
          this.error = `Essential setting '${friendlyName}' is missing. Please fill all required fields marked with *`
          generalStore.statusMessage = 'Settings incomplete.'
          this.isSaving = false
          return
        }
      }

      const testResults = []
      try {
        if (
          !currentConfigForTest.VITE_OPENAI_API_KEY ||
          !currentConfigForTest.VITE_OPENAI_ASSISTANT_ID
        ) {
          throw new Error('OpenAI API Key or Assistant ID is missing.')
        }
        const openai = new OpenAI({
          apiKey: currentConfigForTest.VITE_OPENAI_API_KEY,
          dangerouslyAllowBrowser: true,
        })
        await openai.models.list()
        testResults.push({ service: 'OpenAI', success: true })
      } catch (e: any) {
        testResults.push({
          service: 'OpenAI',
          success: false,
          error: e.message,
        })
      }

      try {
        if (!currentConfigForTest.VITE_GROQ_API_KEY)
          throw new Error('Groq API Key is missing.')
        if (!currentConfigForTest.VITE_GROQ_API_KEY?.startsWith('gsk_'))
          throw new Error('Invalid Groq API Key format.')
        testResults.push({ service: 'Groq', success: true })
      } catch (e: any) {
        testResults.push({ service: 'Groq', success: false, error: e.message })
      }

      try {
        if (
          !currentConfigForTest.VITE_PINECONE_API_KEY ||
          !currentConfigForTest.VITE_PINECONE_INDEX ||
          !currentConfigForTest.VITE_PINECONE_ENV
        ) {
          throw new Error(
            'Pinecone API Key, Index Name, or Environment is missing.'
          )
        }
        const pinecone = new Pinecone({
          apiKey: currentConfigForTest.VITE_PINECONE_API_KEY,
        })

        await pinecone.listIndexes()
        testResults.push({ service: 'Pinecone', success: true })
      } catch (e: any) {
        testResults.push({
          service: 'Pinecone',
          success: false,
          error: e.message,
        })
      }

      try {
        if (
          !currentConfigForTest.VITE_SUPABASE_URL ||
          !currentConfigForTest.VITE_SUPABASE_KEY
        ) {
          throw new Error('Supabase URL or Key is missing.')
        }
        const supabase = createClient(
          currentConfigForTest.VITE_SUPABASE_URL,
          currentConfigForTest.VITE_SUPABASE_KEY
        )
        const { error } = await supabase
          .from('memories')
          .select('id', { count: 'exact', head: true })
        if (error && error.code !== '42P01') {
          if (
            error.message.includes('fetch failed') ||
            error.message.includes('JWT') ||
            error.message.includes('key') ||
            error.message.includes('hostname')
          ) {
            throw error
          } else {
            console.warn(
              "[SettingsStore] Supabase test warning (table 'memories' might not exist yet, or other non-critical schema issue):",
              error.message
            )
          }
        }
        testResults.push({ service: 'Supabase', success: true })
      } catch (e: any) {
        testResults.push({
          service: 'Supabase',
          success: false,
          error: e.message,
        })
      }

      const failedTests = testResults.filter(r => !r.success)

      if (failedTests.length > 0) {
        this.error =
          'API connection tests failed: ' +
          failedTests
            .map(f => `${f.service} (${f.error || 'Unknown error'})`)
            .join('; ')
        generalStore.statusMessage = 'Settings validation failed.'
      } else {
        let settingsPersisted = false
        if (this.isProduction) {
          const plainSettings = { ...this.settings }
          const saveResult =
            await window.settingsAPI.saveSettings(plainSettings)
          if (saveResult.success) {
            this.successMessage = 'Settings saved and validated successfully!'
            settingsPersisted = true
          } else {
            this.error = `Failed to save settings to file: ${saveResult.error || 'Unknown error'}`
            generalStore.statusMessage = 'Error saving settings.'
          }
        } else {
          this.successMessage =
            'Settings validated successfully (Dev mode - not saved to file).'
          settingsPersisted = true
        }

        if (settingsPersisted) {
          if (this.areEssentialSettingsProvided) {
            if (conversationStore.isInitialized) {
              console.log(
                '[SettingsStore] Conversation store was already initialized. Re-initializing.'
              )
              conversationStore.isInitialized = false
            }
            const initSuccess = await conversationStore.initialize()
            if (initSuccess) {
              console.log(
                '[SettingsStore] Conversation store initialized/re-initialized after settings save.'
              )
              generalStore.setAudioState('IDLE')
            } else {
              const initErrorMsg = generalStore.statusMessage.includes('Error:')
                ? generalStore.statusMessage
                : 'Failed to initialize Alice with new settings.'
              this.error = (this.error ? this.error + '; ' : '') + initErrorMsg
              if (this.successMessage)
                this.successMessage +=
                  ' However, AI services failed to initialize.'
              else
                this.successMessage =
                  'Settings potentially saved/validated, but AI services failed to initialize.'
            }
          } else {
            const firstMissingEssential = ESSENTIAL_SETTINGS_KEYS.find(
              key => !this.settings[key]?.trim()
            )
            const friendlyNameForFallback = firstMissingEssential
              ? settingKeyToLabelMap[firstMissingEssential] ||
                firstMissingEssential
              : 'An essential setting'

            this.error =
              (this.error ? this.error + '; ' : '') +
              `${friendlyNameForFallback} appears to be missing after validation and save attempt. Please check all required fields.`
            generalStore.statusMessage =
              'Settings incomplete for AI initialization.'
          }
        }
      }
      this.isSaving = false
    },
  },
})
