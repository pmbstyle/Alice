<template>
  <div class="settings-panel p-4 h-full overflow-y-auto text-white">
    <h2 class="text-2xl font-semibold mb-6 text-center">
      {{
        showAssistantManager
          ? 'Assistant Configuration'
          : 'Application Settings'
      }}
    </h2>

    <div
      v-if="settingsStore.isLoading && !settingsStore.initialLoadAttempted"
      class="text-center"
    >
      Loading settings...
    </div>

    <AssistantManager
      v-if="showAssistantManager"
      @backToMainSettings="showAssistantManager = false"
    />

    <form @submit.prevent="handleSaveAndTestSettings" v-else class="space-y-8">
      <fieldset
        class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          OpenAI (Core API)
          <a href="https://platform.openai.com" target="_blank" class="ml-2">
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              Get Keys
              <img :src="newTabIcon" class="size-3 inline-block ml-1" />
            </span>
          </a>
        </legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="openai-key" class="block mb-1 text-sm">API Key *</label>
            <input
              id="openai-key"
              type="password"
              v-model="currentSettings.VITE_OPENAI_API_KEY"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
            />
          </div>
          <div>
            <label for="openai-org" class="block mb-1 text-sm"
              >Organization ID (Optional)</label
            >
            <input
              id="openai-org"
              type="text"
              v-model="currentSettings.VITE_OPENAI_ORGANIZATION"
              class="input focus:outline-none w-full"
            />
          </div>
          <div class="md:col-span-2">
            <label for="openai-project" class="block mb-1 text-sm"
              >Project ID (Optional)</label
            >
            <input
              id="openai-project"
              type="text"
              v-model="currentSettings.VITE_OPENAI_PROJECT"
              class="input focus:outline-none w-full"
            />
          </div>
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          Groq (Speech-to-Text)
          <a href="https://console.groq.com/" target="_blank" class="ml-2">
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              Get Key <img :src="newTabIcon" class="size-3 inline-block ml-1" />
            </span>
          </a>
        </legend>
        <div class="p-2">
          <label for="groq-key" class="block mb-1 text-sm">API Key *</label>
          <input
            id="groq-key"
            type="password"
            v-model="currentSettings.VITE_GROQ_API_KEY"
            class="input focus:outline-none w-full"
            autocomplete="new-password"
          />
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          Pinecone (Vector Memory)
          <a href="https://www.pinecone.io/" target="_blank" class="ml-2">
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              Get Keys
              <img :src="newTabIcon" class="size-3 inline-block ml-1" />
            </span>
          </a>
        </legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="pinecone-key" class="block mb-1 text-sm"
              >API Key *</label
            >
            <input
              id="pinecone-key"
              type="password"
              v-model="currentSettings.VITE_PINECONE_API_KEY"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
            />
          </div>
          <div>
            <label for="pinecone-url" class="block mb-1 text-sm"
              >Base URL (e.g., https://api.pinecone.io) *</label
            >
            <input
              id="pinecone-url"
              type="text"
              v-model="currentSettings.VITE_PINECONE_BASE_URL"
              placeholder="https://api.pinecone.io"
              class="input focus:outline-none w-full"
            />
          </div>
          <div>
            <label for="pinecone-env" class="block mb-1 text-sm"
              >Environment (e.g., us-east-1) *</label
            >
            <input
              id="pinecone-env"
              type="text"
              v-model="currentSettings.VITE_PINECONE_ENV"
              placeholder="us-east-1"
              class="input focus:outline-none w-full"
            />
          </div>
          <div>
            <label for="pinecone-index" class="block mb-1 text-sm"
              >Index Name *</label
            >
            <input
              id="pinecone-index"
              type="text"
              v-model="currentSettings.VITE_PINECONE_INDEX"
              class="input focus:outline-none w-full"
            />
          </div>
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          Supabase (Long-term Memory)
          <a href="https://supabase.com/" target="_blank" class="ml-2">
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              Get Keys
              <img :src="newTabIcon" class="size-3 inline-block ml-1" />
            </span>
          </a>
        </legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="supabase-url" class="block mb-1 text-sm"
              >Project URL *</label
            >
            <input
              id="supabase-url"
              type="text"
              v-model="currentSettings.VITE_SUPABASE_URL"
              class="input focus:outline-none w-full"
            />
          </div>
          <div>
            <label for="supabase-key" class="block mb-1 text-sm"
              >Public Anon Key *</label
            >
            <input
              id="supabase-key"
              type="password"
              v-model="currentSettings.VITE_SUPABASE_KEY"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
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
            class="ml-2"
          >
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              Info <img :src="newTabIcon" class="size-3 inline-block ml-1" />
            </span>
          </a>
        </legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="tavily-key" class="block mb-1 text-sm"
              >Tavily API Key (Web Search)</label
            >
            <input
              id="tavily-key"
              type="password"
              v-model="currentSettings.VITE_TAVILY_API_KEY"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
            />
          </div>
          <div>
            <label for="openweather-key" class="block mb-1 text-sm"
              >OpenWeatherMap API Key</label
            >
            <input
              id="openweather-key"
              type="password"
              v-model="currentSettings.VITE_OPENWEATHERMAP_API_KEY"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
            />
          </div>
          <div>
            <label for="jackett-url" class="block mb-1 text-sm"
              >Jackett URL (Torrent Search)</label
            >
            <input
              id="jackett-url"
              type="text"
              v-model="currentSettings.VITE_JACKETT_URL"
              class="input focus:outline-none w-full"
            />
          </div>
          <div>
            <label for="jackett-key" class="block mb-1 text-sm"
              >Jackett API Key</label
            >
            <input
              id="jackett-key"
              type="password"
              v-model="currentSettings.VITE_JACKETT_API_KEY"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
            />
          </div>
          <div>
            <label for="qb-url" class="block mb-1 text-sm"
              >qBittorrent URL</label
            >
            <input
              id="qb-url"
              type="text"
              v-model="currentSettings.VITE_QB_URL"
              class="input focus:outline-none w-full"
            />
          </div>
          <div>
            <label for="qb-user" class="block mb-1 text-sm"
              >qBittorrent Username</label
            >
            <input
              id="qb-user"
              type="text"
              v-model="currentSettings.VITE_QB_USERNAME"
              class="input focus:outline-none w-full"
            />
          </div>
          <div>
            <label for="qb-pass" class="block mb-1 text-sm"
              >qBittorrent Password</label
            >
            <input
              id="qb-pass"
              type="password"
              v-model="currentSettings.VITE_QB_PASSWORD"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
            />
          </div>
        </div>
      </fieldset>

      <div class="mt-8 flex justify-center gap-4">
        <button
          type="submit"
          :disabled="settingsStore.isSaving"
          class="btn btn-primary btn-active w-full md:w-auto"
        >
          <span
            v-if="settingsStore.isSaving"
            class="loading loading-spinner"
          ></span>
          {{
            settingsStore.isSaving
              ? 'Saving & Testing...'
              : 'Save & Test Core Settings'
          }}
        </button>

        <button
          v-if="settingsStore.coreOpenAISettingsValid"
          type="button"
          @click="showAssistantManager = true"
          class="btn btn-accent btn-active w-full md:w-auto ml-0 md:ml-2"
        >
          Manage Assistants →
        </button>
      </div>

      <div
        role="alert"
        class="alert alert-error mt-4"
        v-if="settingsStore.error"
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
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{{ settingsStore.error }}</span>
      </div>

      <div
        role="alert"
        class="alert alert-success mt-4"
        v-if="settingsStore.successMessage && !settingsStore.error"
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
      <p class="text-xs text-gray-400 mt-4 text-center">
        * Essential for core functionality. Other API keys are optional based on
        desired tools.
      </p>
      <div
        class="text-xs text-gray-400 mt-4 flex justify-center items-center gap-1"
      >
        <span>Alice v{{ appVersion }}. Built with</span>
        <img :src="heartIcon" class="size-3 inline-block ml-1" />
        <span
          >by
          <a
            href="https://github.com/pmbstyle/Alice"
            target="_blank"
            class="link link-hover"
            >pmbstyle</a
          ></span
        >
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useSettingsStore, type AliceSettings } from '../stores/settingsStore'
import { newTabIcon, heartIcon } from '../utils/assetsImport'
import { useGeneralStore } from '../stores/generalStore'
import AssistantManager from './AssistantManager.vue'
const appVersion = ref(import.meta.env.VITE_APP_VERSION || '')
const settingsStore = useSettingsStore()
const generalStore = useGeneralStore()

const currentSettings = ref<AliceSettings>({ ...settingsStore.settings })
const showAssistantManager = ref(false)

onMounted(async () => {
  if (!settingsStore.initialLoadAttempted) {
    await settingsStore.loadSettings()
  }
  currentSettings.value = { ...settingsStore.config }
  if (
    settingsStore.coreOpenAISettingsValid &&
    !settingsStore.config.VITE_OPENAI_ASSISTANT_ID
  ) {
    if (settingsStore.isProduction) {
      // showAssistantManager.value = true; // Decided against auto-showing, let user click.
    }
  }
})

watch(
  () => settingsStore.config,
  newConfig => {
    currentSettings.value = { ...newConfig }
  },
  { deep: true, immediate: true }
)

watch(
  currentSettings,
  newValues => {
    for (const key in newValues) {
      if (
        settingsStore.settings[key as keyof AliceSettings] !==
        newValues[key as keyof AliceSettings]
      ) {
        settingsStore.updateSetting(
          key as keyof AliceSettings,
          newValues[key as keyof AliceSettings]
        )
      }
    }
  },
  { deep: true }
)

const handleSaveAndTestSettings = async () => {
  await settingsStore.saveAndTestSettings()
}

watch(
  () => generalStore.sideBarView,
  newView => {
    if (newView !== 'settings' && showAssistantManager.value) {
      showAssistantManager.value = false
    }
  }
)
</script>
