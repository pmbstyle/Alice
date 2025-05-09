<template>
  <div class="settings-panel p-4 h-full overflow-y-auto text-white">
    <h2 class="text-2xl font-semibold mb-4 text-center">Settings</h2>

    <div v-if="settingsStore.isLoading" class="text-center">
      Loading settings...
    </div>

    <form
      @submit.prevent="settingsStore.saveAndTestSettings()"
      v-else
      class="space-y-8"
    >
      <fieldset
        class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          OpenAI (Assistant API)
          <a href="https://platform.openai.com" target="_blank">
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              Get <img :src="newTabIcon" class="size-3" />
            </span>
          </a>
        </legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="openai-key" class="block mb-1">API Key *</label>
            <input
              id="openai-key"
              type="password"
              v-model="currentSettings.VITE_OPENAI_API_KEY"
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="openai-org" class="block mb-1">Organization ID *</label>
            <input
              id="openai-org"
              type="text"
              v-model="currentSettings.VITE_OPENAI_ORGANIZATION"
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="openai-project" class="block mb-1">Project ID *</label>
            <input
              id="openai-project"
              type="text"
              v-model="currentSettings.VITE_OPENAI_PROJECT"
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="openai-assistant" class="block mb-1"
              >Assistant ID *</label
            >
            <input
              id="openai-assistant"
              type="text"
              v-model="currentSettings.VITE_OPENAI_ASSISTANT_ID"
              class="input focus:outline-none"
            />
          </div>
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          Groq (Speech-to-Text)
          <a href="https://console.groq.com/" target="_blank">
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              Get <img :src="newTabIcon" class="size-3" />
            </span>
          </a>
        </legend>
        <div class="p-2">
          <label for="groq-key" class="block mb-1">API Key *</label>
          <input
            id="groq-key"
            type="password"
            v-model="currentSettings.VITE_GROQ_API_KEY"
            class="input focus:outline-none"
          />
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          Pinecone (Vector Memory)
          <a href="https://www.pinecone.io/" target="_blank">
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              Get <img :src="newTabIcon" class="size-3" />
            </span>
          </a>
        </legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="pinecone-key" class="block mb-1">API Key *</label>
            <input
              id="pinecone-key"
              type="password"
              v-model="currentSettings.VITE_PINECONE_API_KEY"
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="pinecone-url" class="block mb-1"
              >Base URL (Control Plane) *</label
            >
            <input
              id="pinecone-url"
              type="text"
              v-model="currentSettings.VITE_PINECONE_BASE_URL"
              placeholder="e.g., https://api.pinecone.io"
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="pinecone-env" class="block mb-1"
              >Environment (Index Host Suffix) *</label
            >
            <input
              id="pinecone-env"
              type="text"
              v-model="currentSettings.VITE_PINECONE_ENV"
              placeholder="e.g., us-east-1"
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="pinecone-index" class="block mb-1">Index Name *</label>
            <input
              id="pinecone-index"
              type="text"
              v-model="currentSettings.VITE_PINECONE_INDEX"
              class="input focus:outline-none"
            />
          </div>
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          Supabase (Long-term Memory)
          <a href="https://supabase.com/" target="_blank">
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              Get <img :src="newTabIcon" class="size-3" />
            </span>
          </a>
        </legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="supabase-url" class="block mb-1">Project URL *</label>
            <input
              id="supabase-url"
              type="text"
              v-model="currentSettings.VITE_SUPABASE_URL"
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="supabase-key" class="block mb-1">Public Key*</label>
            <input
              id="supabase-key"
              type="password"
              v-model="currentSettings.VITE_SUPABASE_KEY"
              class="input focus:outline-none"
            />
          </div>
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          Tool APIs (Optional)
          <a
            href="https://github.com/pmbstyle/Alice/blob/main/docs/toolsInstructions.md"
            target="_blank"
          >
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              Info <img :src="newTabIcon" class="size-3" />
            </span>
          </a>
        </legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="tavily-key" class="block mb-1"
              >Tavily API Key (Web Search)</label
            >
            <input
              id="tavily-key"
              type="password"
              v-model="currentSettings.VITE_TAVILY_API_KEY"
              class="input focus:outline-none"
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
              class="input focus:outline-none"
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
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="jackett-key" class="block mb-1">Jackett API Key</label>
            <input
              id="jackett-key"
              type="password"
              v-model="currentSettings.VITE_JACKETT_API_KEY"
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="qb-url" class="block mb-1">qBittorrent URL</label>
            <input
              id="qb-url"
              type="text"
              v-model="currentSettings.VITE_QB_URL"
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="qb-user" class="block mb-1">qBittorrent Username</label>
            <input
              id="qb-user"
              type="text"
              v-model="currentSettings.VITE_QB_USERNAME"
              class="input focus:outline-none"
            />
          </div>
          <div>
            <label for="qb-pass" class="block mb-1">qBittorrent Password</label>
            <input
              id="qb-pass"
              type="password"
              v-model="currentSettings.VITE_QB_PASSWORD"
              class="input focus:outline-none"
            />
          </div>
        </div>
      </fieldset>

      <div class="text-center mt-8">
        <button
          type="submit"
          :disabled="settingsStore.isSaving"
          class="btn btn-primary btn-active"
        >
          {{
            settingsStore.isSaving
              ? 'Saving & Testing...'
              : 'Save & Test Settings'
          }}
        </button>
      </div>

      <div role="alert" class="alert alert-error" v-if="settingsStore.error">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 shrink-0 stroke-current"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{{ settingsStore.error }}</span>
      </div>

      <div
        role="alert"
        class="alert alert-success"
        v-if="settingsStore.successMessage"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 shrink-0 stroke-current"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{{ settingsStore.successMessage }}</span>
      </div>
    </form>
    <p class="text-xs text-gray-400 mt-4 text-center">
      * Essential for core functionality.
    </p>
    <p class="text-xs text-gray-400 mt-4 text-center">
      Alice v{{ appVersion }}. Built with ❤️ by
      <a
        href="https://github.com/pmbstyle/Alice"
        target="_blank"
        class="link link-hover"
        >pmbstyle</a
      >
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, defineEmits } from 'vue'
import { useSettingsStore, AliceSettings } from '../stores/settingsStore'
import { newTabIcon } from '../utils/assetsImport'

const appVersion = ref(import.meta.env.VITE_APP_VERSION || '')

const emit = defineEmits(['view-change'])

const settingsStore = useSettingsStore()

const currentSettings = ref<AliceSettings>({ ...settingsStore.settings })

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
