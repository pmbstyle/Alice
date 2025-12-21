<template>
  <div class="settings-panel p-4 h-full overflow-y-auto text-white">
    <div
      v-if="settingsStore.isLoading && !settingsStore.initialLoadAttempted"
      class="text-center p-4"
    >
      <span class="loading loading-lg loading-spinner text-primary my-4"></span>
      <p>Loading settings...</p>
    </div>

    <form @submit.prevent="handleSaveAndTestSettings" v-else class="space-y-6">
      <div class="tabs justify-between mb-6 tabs-box flex-wrap">
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': activeTab === 'core' }"
          @click="activeTab = 'core'"
        >
          🔑 Core
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': activeTab === 'assistant' }"
          @click="activeTab = 'assistant'"
        >
          🤖 AI
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': activeTab === 'memories' }"
          @click="activeTab = 'memories'"
        >
          🧠 Memories
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': activeTab === 'hotkeys' }"
          @click="activeTab = 'hotkeys'"
        >
          ⌨️ Keys
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': activeTab === 'integrations' }"
          @click="activeTab = 'integrations'"
        >
          🔌 Apps
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': activeTab === 'security' }"
          @click="activeTab = 'security'"
        >
          🔒 Permissions
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': activeTab === 'customization' }"
          @click="activeTab = 'customization'"
        >
          ✨ Customization
        </button>
      </div>

      <div>
        <CoreSettingsTab
          v-if="activeTab === 'core'"
          :current-settings="currentSettings"
          @update:setting="(key, value) => (currentSettings[key] = value)"
        />

        <AssistantSettingsTab
          v-if="activeTab === 'assistant'"
          :current-settings="currentSettings"
          :available-models="availableModelsForSelect"
          :available-tools="availableToolsForSelect"
          :is-refreshing-models="isRefreshingModels"
          :is-tool-configured="isToolConfigured"
          @refresh-models="refreshModels"
          @reset-system-prompt="resetSystemPrompt"
        />

        <HotkeysTab
          v-if="activeTab === 'hotkeys'"
          :current-settings="currentSettings"
          :is-recording-hotkey-for="isRecordingHotkeyFor"
          @start-recording-hotkey="startRecordingHotkey"
          @clear-hotkey="clearHotkey"
        />

        <IntegrationsTab
          v-if="activeTab === 'integrations'"
          :current-settings="currentSettings"
          :google-auth-status="googleAuthStatus"
          @connect-google-services="connectGoogleServices"
          @disconnect-google-services="disconnectGoogleServices"
        />

        <SecurityTab
          v-if="activeTab === 'security'"
          :approved-commands="settingsStore.settings.approvedCommands"
          :session-approved-commands="settingsStore.sessionApprovedCommands"
          @remove-command="removeCommand"
        />

        <MemoryManager
          v-if="activeTab === 'memories'"
        />

        <UserCustomizationTab
          v-if="activeTab === 'customization'"
          :current-settings="currentSettings"
          @update:setting="(key, value) => (currentSettings[key] = value)"
        />
      </div>

      <div class="mt-8 flex flex-col sm:flex-row justify-center gap-4">
        <button
          type="submit"
          :disabled="settingsStore.isSaving"
          class="btn btn-primary btn-active w-full sm:w-auto"
        >
          <span
            v-if="settingsStore.isSaving"
            class="loading loading-spinner loading-sm"
          ></span>
          {{
            settingsStore.isSaving
              ? 'Saving & Testing...'
              : 'Save & Reload'
          }}
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
        <span
          >Alice
          <a
            :href="
              'https://github.com/pmbstyle/Alice/releases/tag/v' + appVersion
            "
            target="_blank"
            class="link link-hover"
            >v{{ appVersion }}</a
          >. Built with</span
        >
        <img :src="heartIcon" class="size-3 inline-block ml-1" />
        <span
          >by
          <a
            href="https://github.com/pmbstyle"
            target="_blank"
            class="link link-hover"
            >pmbstyle</a
          >
        </span>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore, type AliceSettings } from '../stores/settingsStore'
import { useConversationStore } from '../stores/conversationStore'
import { heartIcon } from '../utils/assetsImport'
import { PREDEFINED_OPENAI_TOOLS } from '../utils/assistantTools'
import { DEFAULT_ASSISTANT_SYSTEM_PROMPT } from '../stores/settingsStore'
import { useHotkeyRecording } from '../composables/useHotkeyRecording'
import { useGoogleAuth } from '../composables/useGoogleAuth'
import CoreSettingsTab from './settings/CoreSettingsTab.vue'
import AssistantSettingsTab from './settings/AssistantSettingsTab.vue'
import HotkeysTab from './settings/HotkeysTab.vue'
import IntegrationsTab from './settings/IntegrationsTab.vue'
import SecurityTab from './settings/SecurityTab.vue'
import UserCustomizationTab from './settings/UserCustomizationTab.vue'
import MemoryManager from './MemoryManager.vue'

const appVersion = ref(import.meta.env.VITE_APP_VERSION || '')
const settingsStore = useSettingsStore()
const conversationStore = useConversationStore()

const currentSettings = ref<AliceSettings>({ ...settingsStore.config })
const activeTab = ref<
  | 'core'
  | 'assistant'
  | 'hotkeys'
  | 'integrations'
  | 'security'
  | 'memories'
  | 'customization'
>('core')

const isRefreshingModels = ref(false)

const { availableModels } = storeToRefs(conversationStore)

const {
  isRecordingHotkeyFor,
  startRecordingHotkey: startRecordingHotkeyComposable,
  clearHotkey: clearHotkeyComposable,
} = useHotkeyRecording()

const { googleAuthStatus, connectGoogleServices, disconnectGoogleServices } =
  useGoogleAuth()

const availableToolsForSelect = computed(() => {
  return PREDEFINED_OPENAI_TOOLS.map(tool => {
    const functionDef = (tool as any).function || tool
    return {
      name: functionDef.name,
      description: functionDef.description || 'No description available.',
      displayName: betterToolName(functionDef.name),
    }
  }).filter(tool => tool.name)
})

const isBrowserContextToolActive = computed(() => {
  return currentSettings.value.assistantTools.includes('browser_context')
})

const availableModelsForSelect = computed(() => {
  return availableModels.value
})

const toolDependencies: Record<string, string[]> = {
  search_torrents: ['VITE_JACKETT_API_KEY', 'VITE_JACKETT_URL'],
  add_torrent_to_qb: ['VITE_QB_URL', 'VITE_QB_USERNAME', 'VITE_QB_PASSWORD'],
  perform_web_search: ['VITE_TAVILY_API_KEY'],
  get_calendar_events: ['GOOGLE_AUTH'],
  create_calendar_event: ['GOOGLE_AUTH'],
  update_calendar_event: ['GOOGLE_AUTH'],
  delete_calendar_event: ['GOOGLE_AUTH'],
  get_unread_emails: ['GOOGLE_AUTH'],
  search_emails: ['GOOGLE_AUTH'],
  get_email_content: ['GOOGLE_AUTH'],
}
const refreshModels = async () => {
  if (isRefreshingModels.value) return

  isRefreshingModels.value = true
  try {
    await conversationStore.fetchModels()
  } catch (error) {
    console.error('Failed to refresh models:', error)
  } finally {
    isRefreshingModels.value = false
  }
}

function betterToolName(name: string): string {
  const nameMap: Record<string, string> = {
    get_current_datetime: 'Current Date & Time',
    open_path: 'Open Apps/URLs',
    manage_clipboard: 'Clipboard Read/Write',
    save_memory: 'Save Memory',
    delete_memory: 'Delete Memory',
    recall_memories: 'Recall Memories',
    get_calendar_events: 'Get Calendar Events',
    create_calendar_event: 'Create Calendar Event',
    update_calendar_event: 'Update Calendar Event',
    delete_calendar_event: 'Delete Calendar Event',
    get_unread_emails: 'Get Unread Emails',
    search_emails: 'Search Emails',
    get_email_content: 'Get Email Content',
    search_torrents: 'Torrent Search',
    add_torrent_to_qb: 'Add Torrent to QB',
    perform_web_search: 'Web Search (Tavily)',
    searxng_web_search: 'Web Search (SearXNG)',
  }
  return (
    nameMap[name] ||
    name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  )
}

const resetSystemPrompt = () => {
  currentSettings.value.assistantSystemPrompt = DEFAULT_ASSISTANT_SYSTEM_PROMPT
}

const startRecordingHotkey = (settingKey: keyof AliceSettings) => {
  startRecordingHotkeyComposable(settingKey, currentSettings.value)
}

const clearHotkey = (settingKey: keyof AliceSettings) => {
  clearHotkeyComposable(settingKey, currentSettings.value)
}

function isToolConfigured(toolName: string): boolean {
  const currentLocalSettings = currentSettings.value
  const deps = toolDependencies[toolName]
  if (!deps) return true

  return deps.every(depKey => {
    if (depKey === 'GOOGLE_AUTH') {
      return googleAuthStatus.isAuthenticated
    }
    const value = currentLocalSettings[depKey as keyof AliceSettings]
    if (typeof value === 'string') {
      return !!value.trim()
    }
    return !!value
  })
}

onMounted(async () => {
  if (!settingsStore.initialLoadAttempted) {
    await settingsStore.loadSettings()
  }
  currentSettings.value = { ...settingsStore.config }

  if (
    settingsStore.coreOpenAISettingsValid &&
    conversationStore.availableModels.length === 0
  ) {
    await conversationStore.fetchModels()
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
        const value = newValues[key as keyof AliceSettings]
        if (value !== undefined) {
          settingsStore.updateSetting(key as keyof AliceSettings, value)
        }
      }
    }
  },
  { deep: true }
)

const handleSaveAndTestSettings = async () => {
  if (
    currentSettings.value.mcpServersConfig &&
    currentSettings.value.mcpServersConfig.trim() !== '' &&
    currentSettings.value.mcpServersConfig.trim() !== '[]'
  ) {
    try {
      const parsedMcpConfig = JSON.parse(currentSettings.value.mcpServersConfig)
      if (!Array.isArray(parsedMcpConfig)) {
        settingsStore.error =
          'MCP Servers Configuration must be a valid JSON array.'
        settingsStore.successMessage = null
        settingsStore.isSaving = false
        return
      }
    } catch (e) {
      settingsStore.error =
        'MCP Servers Configuration is not valid JSON. Please check for errors like trailing commas or unquoted keys.'
      settingsStore.successMessage = null
      settingsStore.isSaving = false
      return
    }
  }

  if (
    settingsStore.error &&
    settingsStore.error.startsWith('MCP Servers Configuration')
  ) {
    settingsStore.error = null
  }

  if (
    currentSettings.value.sttProvider === 'groq' &&
    !currentSettings.value.VITE_GROQ_API_KEY?.trim()
  ) {
    settingsStore.error = `Groq STT is selected, but the Groq API Key is missing.`
    settingsStore.successMessage = null
    settingsStore.isSaving = false
    return
  }

  if (
    (currentSettings.value.sttProvider === 'google' ||
      currentSettings.value.ttsProvider === 'google') &&
    !currentSettings.value.VITE_GOOGLE_API_KEY?.trim()
  ) {
    settingsStore.error = `Google is selected, but the Google API Key is missing.`
    settingsStore.successMessage = null
    settingsStore.isSaving = false
    return
  }

  await settingsStore.saveAndTestSettings()

  if (window.ipcRenderer && window.location.hash === '#settings') {
    try {
      const success = !settingsStore.error && settingsStore.successMessage

      await window.ipcRenderer.invoke('settings:notify-main-window', {
        type: 'settings-saved',
        success: success,
        validationComplete: true,
        settingsChanged: true
      })
    } catch (error) {
      console.error('Failed to notify main window of settings changes:', error)
    }
  }
}

const removeCommand = async (command: string) => {
  await settingsStore.removeApprovedCommand(command)
}
</script>
