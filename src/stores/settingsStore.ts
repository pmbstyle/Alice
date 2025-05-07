// src/stores/settingsStore.ts
import { defineStore } from 'pinia';
import OpenAI from 'openai'; // For API testing
import Groq from 'groq-sdk'; // For API testing
import { Pinecone } from '@pinecone-database/pinecone'; // For API testing
import { createClient } from '@supabase/supabase-js'; // For API testing

export interface AliceSettings {
  VITE_OPENAI_API_KEY: string;
  VITE_OPENAI_ORGANIZATION: string;
  VITE_OPENAI_PROJECT: string;
  VITE_OPENAI_ASSISTANT_ID: string;
  VITE_GROQ_API_KEY: string;
  VITE_PINECONE_API_KEY: string;
  VITE_PINECONE_BASE_URL: string;
  VITE_PINECONE_ENV: string;
  VITE_PINECONE_INDEX: string;
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_KEY: string;
  VITE_TAVILY_API_KEY: string;
  VITE_OPENWEATHERMAP_API_KEY: string;
  VITE_JACKETT_API_KEY: string;
  VITE_JACKETT_URL: string;
  VITE_QB_URL: string;
  VITE_QB_USERNAME: string;
  VITE_QB_PASSWORD: string;
}

const defaultSettings: AliceSettings = {
  VITE_OPENAI_API_KEY: '', VITE_OPENAI_ORGANIZATION: '', VITE_OPENAI_PROJECT: '',
  VITE_OPENAI_ASSISTANT_ID: '', VITE_GROQ_API_KEY: '', VITE_PINECONE_API_KEY: '',
  VITE_PINECONE_BASE_URL: '', VITE_PINECONE_ENV: '', VITE_PINECONE_INDEX: '',
  VITE_SUPABASE_URL: '', VITE_SUPABASE_KEY: '', VITE_TAVILY_API_KEY: '',
  VITE_OPENWEATHERMAP_API_KEY: '', VITE_JACKETT_API_KEY: '', VITE_JACKETT_URL: '',
  VITE_QB_URL: '', VITE_QB_USERNAME: '', VITE_QB_PASSWORD: '',
};

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
    isProduction: (): boolean => !import.meta.env.DEV,
    areEssentialSettingsProvided(state): boolean {
      if (!this.isProduction) return true; // In dev, assume .env is sufficient
      const essentialKeys: (keyof AliceSettings)[] = [
        'VITE_OPENAI_API_KEY', 'VITE_OPENAI_ASSISTANT_ID', 'VITE_GROQ_API_KEY',
        'VITE_PINECONE_API_KEY', 'VITE_PINECONE_BASE_URL', 'VITE_PINECONE_INDEX',
        'VITE_SUPABASE_URL', 'VITE_SUPABASE_KEY',
      ];
      return essentialKeys.every(key => !!state.settings[key]?.trim());
    },
    // Getter to provide reactive config to the rest of the app
    config(state): Readonly<AliceSettings> {
      // In development, merge .env values over any potentially loaded (but not user-saved) settings
      // In production, use the loaded/saved settings.
      if (!this.isProduction) {
        const devSettings: Partial<AliceSettings> = {};
        for (const key in defaultSettings) {
          if (import.meta.env[key]) {
            devSettings[key as keyof AliceSettings] = import.meta.env[key];
          }
        }
        return { ...state.settings, ...devSettings }; // Prioritize .env in dev
      }
      return state.settings;
    },
  },
  actions: {
    async loadSettings() {
      if (this.initialLoadAttempted && this.isProduction) return;

      this.isLoading = true;
      this.error = null;
      this.successMessage = null;
      try {
        if (this.isProduction) {
          console.log('Production: Loading settings from main process...');
          const loaded = await window.settingsAPI.loadSettings();
          if (loaded) {
            this.settings = { ...defaultSettings, ...loaded }; // Merge with defaults
          } else {
            this.settings = { ...defaultSettings }; // Fallback to defaults
          }
        } else {
          console.log('Development: Using .env variables (via getter).');
          // Settings will be sourced from import.meta.env via the `config` getter
          // but we can prime the `settings` state for the UI if needed.
          const devSettingsFromEnv: Partial<AliceSettings> = {};
           for (const key of Object.keys(defaultSettings) as Array<keyof AliceSettings>) {
            if (import.meta.env[key]) {
              devSettingsFromEnv[key] = import.meta.env[key] as string;
            }
          }
          this.settings = {...defaultSettings, ...devSettingsFromEnv};
        }
      } catch (e: any) {
        this.error = `Failed to load settings: ${e.message}`;
        this.settings = { ...defaultSettings };
      } finally {
        this.isLoading = false;
        this.initialLoadAttempted = true;
      }
    },

    updateSetting(key: keyof AliceSettings, value: string) {
      this.settings[key] = value;
      this.successMessage = null; // Clear messages on edit
      this.error = null;
    },

    async saveAndTestSettings() {
      this.isSaving = true;
      this.error = null;
      this.successMessage = null;

      if (!this.areEssentialSettingsProvided && this.isProduction) {
        this.error = "Please fill in all essential API keys and identifiers.";
        this.isSaving = false;
        return;
      }

      const testResults = [];
      // OpenAI Test
      try {
        const openai = new OpenAI({ apiKey: this.settings.VITE_OPENAI_API_KEY, dangerouslyAllowBrowser: true });
        await openai.models.list(); // A simple, cheap call
        testResults.push({ service: 'OpenAI', success: true });
      } catch (e: any) {
        testResults.push({ service: 'OpenAI', success: false, error: e.message });
      }

      // Groq Test
      try {
        const groq = new Groq({ apiKey: this.settings.VITE_GROQ_API_KEY, dangerouslyAllowBrowser: true });
        // Groq doesn't have a simple ping. We'll assume key format is a basic check.
        // A small transcription could be a real test but adds complexity.
        if (!this.settings.VITE_GROQ_API_KEY?.startsWith('gsk_')) throw new Error("Invalid Groq API Key format.");
        testResults.push({ service: 'Groq', success: true });
      } catch (e: any) {
        testResults.push({ service: 'Groq', success: false, error: e.message });
      }
      
      // Pinecone Test
      try {
        const pinecone = new Pinecone({ apiKey: this.settings.VITE_PINECONE_API_KEY });
        const index = pinecone.Index(this.settings.VITE_PINECONE_INDEX);
        await index.describeIndexStats();
        testResults.push({ service: 'Pinecone', success: true });
      } catch (e: any) {
        testResults.push({ service: 'Pinecone', success: false, error: e.message });
      }

      // Supabase Test
      try {
        const supabase = createClient(this.settings.VITE_SUPABASE_URL, this.settings.VITE_SUPABASE_KEY);
        // Try a simple, non-modifying query. Listing tables from a schema only accessible with service_role might fail.
        // A more reliable test might be to query a specific, known public table or function if available.
        // For now, client creation is a basic check. A .from('some_table').select('id', { count: 'exact', head: true }) is cheap.
        const { error } = await supabase.from('memories').select('id', { count: 'exact', head: true });
        if (error && error.code !== '42P01') { // 42P01 means table doesn't exist, which is fine if db is new.
            // Allow specific errors that indicate connectivity but maybe not table readiness.
            // This needs refinement based on expected Supabase states.
            // For now, if it's not a "relation not found" error, consider it a connectivity issue.
            if (error.message.includes("fetch failed") || error.message.includes("JWT") || error.message.includes("key")) {
                 throw error;
            } else {
                console.warn("Supabase test warning (table 'memories' might not exist yet):", error.message);
            }
        }
        testResults.push({ service: 'Supabase', success: true });
      } catch (e: any) {
        testResults.push({ service: 'Supabase', success: false, error: e.message });
      }


      const failedTests = testResults.filter(r => !r.success);

      if (failedTests.length > 0) {
        this.error = "API connection tests failed: " + failedTests.map(f => `${f.service} (${f.error})`).join('; ');
      } else {
        if (this.isProduction) {
          const saveResult = await window.settingsAPI.saveSettings(this.settings);
          if (saveResult.success) {
            this.successMessage = "Settings saved and validated successfully!";
          } else {
            this.error = `Failed to save settings to file: ${saveResult.error}`;
          }
        } else {
           this.successMessage = "Settings validated successfully (Dev mode - not saved to file).";
        }
      }
      this.isSaving = false;
    },
  },
});