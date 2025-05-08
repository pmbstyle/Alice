<template>
  <div class="settings-panel p-4 h-full overflow-y-auto text-white">
    <h2 class="text-2xl font-semibold mb-4 text-center">Alice Settings</h2>
    <button
      @click="closeSettingsView"
      class="p-2 rounded-full hover:bg-gray-700/50 transition-colors focus:outline-none"
      title="Back to Chat"
    >
      <img :src="chatIcon" alt="Chat" class="w-5 h-5" />
    </button>

    <div v-if="settingsStore.isLoading" class="text-center">
      Loading settings...
    </div>

    <form
      @submit.prevent="settingsStore.saveAndTestSettings()"
      v-else
      class="space-y-8"
    >
      <fieldset class="border p-4 rounded-lg border-gray-600">
        <legend class="text-xl font-semibold px-2">OpenAI</legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="openai-key" class="block mb-1">API Key*</label>
            <input
              id="openai-key"
              type="password"
              v-model="currentSettings.VITE_OPENAI_API_KEY"
              class="input-field"
            />
          </div>
          <div>
            <label for="openai-org" class="block mb-1">Organization ID</label>
            <input
              id="openai-org"
              type="text"
              v-model="currentSettings.VITE_OPENAI_ORGANIZATION"
              class="input-field"
            />
          </div>
          <div>
            <label for="openai-project" class="block mb-1">Project ID</label>
            <input
              id="openai-project"
              type="text"
              v-model="currentSettings.VITE_OPENAI_PROJECT"
              class="input-field"
            />
          </div>
          <div>
            <label for="openai-assistant" class="block mb-1"
              >Assistant ID*</label
            >
            <input
              id="openai-assistant"
              type="text"
              v-model="currentSettings.VITE_OPENAI_ASSISTANT_ID"
              class="input-field"
            />
          </div>
        </div>
      </fieldset>

      <fieldset class="border p-4 rounded-lg border-gray-600">
        <legend class="text-xl font-semibold px-2">
          Groq (Speech-to-Text)
        </legend>
        <div class="p-2">
          <label for="groq-key" class="block mb-1">API Key*</label>
          <input
            id="groq-key"
            type="password"
            v-model="currentSettings.VITE_GROQ_API_KEY"
            class="input-field"
          />
        </div>
      </fieldset>

      <fieldset class="border p-4 rounded-lg border-gray-600">
        <legend class="text-xl font-semibold px-2">
          Pinecone (Vector Memory)
        </legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="pinecone-key" class="block mb-1">API Key*</label>
            <input
              id="pinecone-key"
              type="password"
              v-model="currentSettings.VITE_PINECONE_API_KEY"
              class="input-field"
            />
          </div>
          <div>
            <label for="pinecone-url" class="block mb-1"
              >Base URL (Control Plane)*</label
            >
            <input
              id="pinecone-url"
              type="text"
              v-model="currentSettings.VITE_PINECONE_BASE_URL"
              placeholder="e.g., https://api.pinecone.io"
              class="input-field"
            />
          </div>
          <div>
            <label for="pinecone-env" class="block mb-1"
              >Environment (Index Host Suffix)*</label
            >
            <input
              id="pinecone-env"
              type="text"
              v-model="currentSettings.VITE_PINECONE_ENV"
              placeholder="e.g., us-west1-gcp"
              class="input-field"
            />
          </div>
          <div>
            <label for="pinecone-index" class="block mb-1">Index Name*</label>
            <input
              id="pinecone-index"
              type="text"
              v-model="currentSettings.VITE_PINECONE_INDEX"
              class="input-field"
            />
          </div>
        </div>
      </fieldset>

      <fieldset class="border p-4 rounded-lg border-gray-600">
        <legend class="text-xl font-semibold px-2">
          Supabase (Long-term Memory)
        </legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="supabase-url" class="block mb-1">Project URL*</label>
            <input
              id="supabase-url"
              type="text"
              v-model="currentSettings.VITE_SUPABASE_URL"
              class="input-field"
            />
          </div>
          <div>
            <label for="supabase-key" class="block mb-1"
              >Anon Public Key*</label
            >
            <input
              id="supabase-key"
              type="password"
              v-model="currentSettings.VITE_SUPABASE_KEY"
              class="input-field"
            />
          </div>
        </div>
      </fieldset>

      <fieldset class="border p-4 rounded-lg border-gray-600">
        <legend class="text-xl font-semibold px-2">Tool APIs (Optional)</legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="tavily-key" class="block mb-1"
              >Tavily API Key (Web Search)</label
            >
            <input
              id="tavily-key"
              type="password"
              v-model="currentSettings.VITE_TAVILY_API_KEY"
              class="input-field"
            />
          </div>
          <div>
            <label for="openweather-key" class="block mb-1"
              >OpenWeatherMap API Key</label
            >
            <input
              id="openweather-key"
              type="password"
              v-model="currentSettings.VITE_OPENWEATHERMAP_API_KEY"
              class="input-field"
            />
          </div>
          <div>
            <label for="jackett-url" class="block mb-1"
              >Jackett URL (Torrent Search)</label
            >
            <input
              id="jackett-url"
              type="text"
              v-model="currentSettings.VITE_JACKETT_URL"
              class="input-field"
            />
          </div>
          <div>
            <label for="jackett-key" class="block mb-1">Jackett API Key</label>
            <input
              id="jackett-key"
              type="password"
              v-model="currentSettings.VITE_JACKETT_API_KEY"
              class="input-field"
            />
          </div>
          <div>
            <label for="qb-url" class="block mb-1">qBittorrent URL</label>
            <input
              id="qb-url"
              type="text"
              v-model="currentSettings.VITE_QB_URL"
              class="input-field"
            />
          </div>
          <div>
            <label for="qb-user" class="block mb-1">qBittorrent Username</label>
            <input
              id="qb-user"
              type="text"
              v-model="currentSettings.VITE_QB_USERNAME"
              class="input-field"
            />
          </div>
          <div>
            <label for="qb-pass" class="block mb-1">qBittorrent Password</label>
            <input
              id="qb-pass"
              type="password"
              v-model="currentSettings.VITE_QB_PASSWORD"
              class="input-field"
            />
          </div>
        </div>
      </fieldset>

      <div class="text-center mt-8">
        <button
          type="submit"
          :disabled="settingsStore.isSaving"
          class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition duration-150 ease-in-out disabled:opacity-50"
        >
          {{
            settingsStore.isSaving
              ? 'Saving & Testing...'
              : 'Save & Test Settings'
          }}
        </button>
      </div>

      <div
        v-if="settingsStore.error"
        class="mt-4 p-3 bg-red-700 border border-red-900 text-white rounded-md text-center"
      >
        Error: {{ settingsStore.error }}
      </div>
      <div
        v-if="settingsStore.successMessage"
        class="mt-4 p-3 bg-green-700 border-green-900 text-white rounded-md text-center"
      >
        {{ settingsStore.successMessage }}
      </div>
    </form>
    <p class="text-xs text-gray-400 mt-4 text-center">
      * Essential for core functionality.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, defineEmits } from 'vue'
import { useSettingsStore, AliceSettings } from '../stores/settingsStore'
import { chatIcon } from '../utils/assetsImport'

const emit = defineEmits(['view-change'])

const settingsStore = useSettingsStore()

const currentSettings = ref<AliceSettings>({ ...settingsStore.settings })

const closeSettingsView = () => {
  emit('view-change', 'chat')
}

onMounted(async () => {
  if (!settingsStore.initialLoadAttempted) {
    await settingsStore.loadSettings()
  }

  currentSettings.value = { ...settingsStore.config }
})

watch(
  () => settingsStore.config,
  newConfig => {
    currentSettings.value = { ...newConfig }
  },
  { deep: true }
)

watch(
  currentSettings,
  newValues => {
    for (const key in newValues) {
      settingsStore.updateSetting(
        key as keyof AliceSettings,
        newValues[key as keyof AliceSettings]
      )
    }
  },
  { deep: true }
)
</script>
