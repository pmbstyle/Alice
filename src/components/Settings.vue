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
        class="fieldset bg-gray-900/90 border-purple-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">Google Calendar Integration</legend>
        <div class="p-2 space-y-4">
          <div
            v-if="
              !googleAuthStatus.isAuthenticated &&
              !googleAuthStatus.authInProgress
            "
          >
            <p class="text-sm mb-2">
              Connect Alice to your Google Calendar to manage events.
            </p>
            <button
              type="button"
              @click="connectGoogleCalendar"
              class="btn btn-info btn-active"
              :disabled="googleAuthStatus.isLoading"
            >
              {{
                googleAuthStatus.isLoading
                  ? 'Connecting...'
                  : 'Connect Google Calendar'
              }}
            </button>
          </div>
          <div
            v-if="
              googleAuthStatus.authInProgress &&
              !googleAuthStatus.isAuthenticated
            "
          >
            <p class="text-sm mb-2">
              Awaiting authorization in your browser. Please follow the
              instructions there.
            </p>
            <span class="loading loading-dots loading-md"></span>
          </div>
          <div v-if="googleAuthStatus.isAuthenticated">
            <p class="text-sm mb-2 text-success-content">
              Successfully connected to Google Calendar.
            </p>
            <button
              type="button"
              @click="disconnectGoogleCalendar"
              class="btn btn-warning btn-outline"
            >
              Disconnect Google Calendar
            </button>
          </div>
          <p
            v-if="googleAuthStatus.error"
            class="text-xs text-error-content mt-1"
          >
            {{ googleAuthStatus.error }}
          </p>
          <p
            v-if="
              googleAuthStatus.message &&
              !googleAuthStatus.isAuthenticated &&
              !googleAuthStatus.error
            "
            class="text-xs text-info-content mt-1"
          >
            {{ googleAuthStatus.message }}
          </p>
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
import { ref, watch, onMounted, onUnmounted, reactive } from 'vue'
import { useSettingsStore, type AliceSettings } from '../stores/settingsStore'
import { newTabIcon, heartIcon } from '../utils/assetsImport'
import { useGeneralStore } from '../stores/generalStore'
import AssistantManager from './AssistantManager.vue'
const appVersion = ref(import.meta.env.VITE_APP_VERSION || '')
const settingsStore = useSettingsStore()
const generalStore = useGeneralStore()

const currentSettings = ref<AliceSettings>({ ...settingsStore.settings })
const showAssistantManager = ref(false)

const googleAuthCode = ref('')
const googleAuthStatus = reactive({
  isAuthenticated: false,
  authInProgress: false,
  isLoading: false,
  error: null as string | null,
  message: null as string | null,
})

async function checkGoogleAuthStatus() {
  googleAuthStatus.isLoading = true
  googleAuthStatus.error = null
  try {
    const result = await window.ipcRenderer.invoke(
      'google-calendar:check-auth-status'
    )
    if (result.success) {
      googleAuthStatus.isAuthenticated = result.isAuthenticated
    }
  } catch (e: any) {
    googleAuthStatus.error = 'Error checking auth status: ' + e.message
  } finally {
    googleAuthStatus.isLoading = false
  }
}

async function connectGoogleCalendar() {
  googleAuthStatus.isLoading = true
  googleAuthStatus.authInProgress = true
  googleAuthStatus.error = null
  googleAuthStatus.message = null
  try {
    const result = await window.ipcRenderer.invoke(
      'google-calendar:get-auth-url'
    )
    if (result.success) {
      googleAuthStatus.message = result.message
    } else {
      googleAuthStatus.error =
        result.error || 'Failed to start Google Calendar authentication.'
      googleAuthStatus.authInProgress = false
    }
  } catch (e: any) {
    googleAuthStatus.error = 'Error initiating auth: ' + e.message
    googleAuthStatus.authInProgress = false
  } finally {
    googleAuthStatus.isLoading = false
  }
}

async function disconnectGoogleCalendar() {
  googleAuthStatus.isLoading = true
  googleAuthStatus.error = null
  googleAuthStatus.message = 'Disconnecting...'
  try {
    const result = await window.ipcRenderer.invoke('google-calendar:disconnect')
    if (result.success) {
      googleAuthStatus.isAuthenticated = false
      googleAuthStatus.authInProgress = false
      googleAuthStatus.message = result.message
    } else {
      googleAuthStatus.error =
        result.error || 'Failed to disconnect from Google Calendar.'
      googleAuthStatus.message = null
    }
  } catch (e: any) {
    googleAuthStatus.error = 'Error disconnecting: ' + e.message
    googleAuthStatus.message = null
  } finally {
    googleAuthStatus.isLoading = false
  }
}

function handleGoogleAuthSuccess(event: any, message: string) {
  console.log('Loopback Auth Success (Renderer):', message)
  googleAuthStatus.isAuthenticated = true
  googleAuthStatus.authInProgress = false
  googleAuthStatus.message = message
  googleAuthStatus.error = null
}

function handleGoogleAuthError(event: any, errorMsg: string) {
  console.error('Loopback Auth Error (Renderer):', errorMsg)
  googleAuthStatus.isAuthenticated = false
  googleAuthStatus.authInProgress = false
  googleAuthStatus.error = `Authentication failed: ${errorMsg}`
  googleAuthStatus.message = null
}

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
  await checkGoogleAuthStatus()
  if (window.ipcRenderer) {
    window.ipcRenderer.on(
      'google-auth-loopback-success',
      handleGoogleAuthSuccess
    )
    window.ipcRenderer.on('google-auth-loopback-error', handleGoogleAuthError)
  }
})

onUnmounted(() => {
  if (window.ipcRenderer) {
    window.ipcRenderer.off(
      'google-auth-loopback-success',
      handleGoogleAuthSuccess
    )
    window.ipcRenderer.off('google-auth-loopback-error', handleGoogleAuthError)
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
