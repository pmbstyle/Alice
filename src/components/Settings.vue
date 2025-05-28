<template>
  <div class="settings-panel p-4 h-full overflow-y-auto text-white">
    <h2 class="text-2xl font-semibold mb-6 text-center">
      Application Settings
    </h2>

    <div
      v-if="settingsStore.isLoading && !settingsStore.initialLoadAttempted"
      class="text-center p-4"
    >
      <span class="loading loading-lg loading-spinner text-primary my-4"></span>
      <p>Loading settings...</p>
    </div>

    <form @submit.prevent="handleSaveAndTestSettings" v-else class="space-y-8">
      <fieldset
        class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">Core API Keys</legend>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
          <div>
            <label for="openai-key" class="block mb-1 text-sm"
              >OpenAI API Key *</label
            >
            <input
              id="openai-key"
              type="password"
              v-model="currentSettings.VITE_OPENAI_API_KEY"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
              placeholder="sk-..."
            />
          </div>
          <div>
            <label for="groq-key" class="block mb-1 text-sm"
              >Groq API Key (STT) *</label
            >
            <input
              id="groq-key"
              type="password"
              v-model="currentSettings.VITE_GROQ_API_KEY"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
              placeholder="gsk_..."
            />
          </div>
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-green-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">Alice Assistant Configuration</legend>
        <div class="space-y-4 p-2">
          <div>
            <label for="assistant-model" class="block mb-1 text-sm"
              >Model *</label
            >
            <select
              id="assistant-model"
              v-model="currentSettings.assistantModel"
              class="select select-bordered w-full focus:select-primary"
              required
            >
              <option disabled value="">Select a model</option>
              <option
                v-if="
                  conversationStore.availableModels.length === 0 &&
                  settingsStore.coreOpenAISettingsValid
                "
                value=""
              >
                Loading models... (or ensure OpenAI key is valid)
              </option>
              <option
                v-for="model in availableModelsForSelect"
                :key="model.id"
                :value="model.id"
              >
                {{ model.id }}
              </option>
            </select>
            <p
              v-if="
                !settingsStore.coreOpenAISettingsValid &&
                currentSettings.VITE_OPENAI_API_KEY
              "
              class="text-xs text-warning mt-1"
            >
              OpenAI API key needs to be validated (Save & Test) to load models.
            </p>
          </div>

          <div>
            <label for="assistant-system-prompt" class="block mb-1 text-sm"
              >System Prompt</label
            >
            <textarea
              id="assistant-system-prompt"
              v-model="currentSettings.assistantSystemPrompt"
              rows="8"
              class="textarea textarea-bordered w-full focus:textarea-primary h-48"
              placeholder="You are a helpful AI assistant..."
            ></textarea>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="assistant-temperature" class="block mb-1 text-sm">
                Temperature ({{
                  currentSettings.assistantTemperature.toFixed(1)
                }})
              </label>
              <input
                id="assistant-temperature"
                type="range"
                min="0"
                max="2"
                step="0.1"
                v-model.number="currentSettings.assistantTemperature"
                class="range range-primary"
              />
            </div>
            <div>
              <label for="assistant-top-p" class="block mb-1 text-sm">
                Top P ({{ currentSettings.assistantTopP.toFixed(1) }})
              </label>
              <input
                id="assistant-top-p"
                type="range"
                min="0"
                max="1"
                step="0.1"
                v-model.number="currentSettings.assistantTopP"
                class="range range-success"
              />
            </div>
          </div>

          <div>
            <label class="block mb-2 text-sm font-medium">Enabled Tools</label>
            <div
              class="space-y-2 p-3 border border-neutral-content/20 rounded-md max-h-60 overflow-y-auto bg-gray-800/50"
            >
              <div
                v-if="availableToolsForSelect.length === 0"
                class="text-xs text-gray-400"
              >
                No tools defined.
              </div>
              <div
                v-for="tool in availableToolsForSelect"
                :key="tool.name"
                class="form-control"
              >
                <label
                  class="label cursor-pointer py-1 justify-start gap-3"
                  :class="{
                    'opacity-50 cursor-not-allowed': !isToolConfigured(
                      tool.name
                    ),
                  }"
                >
                  <input
                    type="checkbox"
                    :value="tool.name"
                    v-model="currentSettings.assistantTools"
                    class="checkbox checkbox-accent checkbox-sm"
                    :disabled="!isToolConfigured(tool.name)"
                  />
                  <span
                    class="label-text"
                    :title="
                      tool.description +
                      (!isToolConfigured(tool.name)
                        ? ' (API key for this tool not configured in Optional Tool APIs section)'
                        : '')
                    "
                  >
                    {{ tool.displayName }}
                    <span
                      v-if="!isToolConfigured(tool.name)"
                      class="text-xs text-warning normal-case"
                    >
                      (Needs config below)
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-yellow-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">Global Hotkeys</legend>
        <div class="p-2 space-y-4">
          <div>
            <label for="mic-toggle-hotkey" class="block mb-1 text-sm"
              >Microphone Toggle Hotkey</label
            >
            <div class="flex items-center justify-between">
              <kbd class="kbd kbd-xl">{{formatAccelerator(currentSettings.microphoneToggleHotkey)}}</kbd>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  @click="startRecordingHotkey('microphoneToggleHotkey')"
                  class="btn btn-secondary btn-active btn-sm"
                  :disabled="isRecordingHotkeyFor === 'microphoneToggleHotkey'"
                >
                  {{
                    isRecordingHotkeyFor === 'microphoneToggleHotkey'
                      ? 'Recording...'
                      : 'Record'
                  }}
                </button>
                <button
                  type="button"
                  @click="clearHotkey('microphoneToggleHotkey')"
                  class="btn btn-warning btn-outline btn-sm"
                  :disabled="!currentSettings.microphoneToggleHotkey"
                >
                  Clear
                </button>
              </div>
            </div>
            <p
              v-if="isRecordingHotkeyFor === 'microphoneToggleHotkey'"
              class="text-xs text-yellow-400 mt-1"
            >
              Press the desired key combination. Press Esc to cancel.
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-purple-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">Google Services Integration</legend>
        <div class="p-2 space-y-4">
          <div
            v-if="
              !googleAuthStatus.isAuthenticated &&
              !googleAuthStatus.authInProgress
            "
          >
            <button
              type="button"
              @click="connectGoogleServices"
              class="btn btn-info btn-active"
              :disabled="googleAuthStatus.isLoading"
            >
              {{
                googleAuthStatus.isLoading
                  ? 'Connecting...'
                  : 'Connect to Google Services'
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
            <div role="alert" class="alert alert-success mb-4">
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
              <span>Successfully connected to Google Services.</span>
            </div>
            <button
              type="button"
              @click="disconnectGoogleServices"
              class="btn btn-warning btn-outline"
            >
              Disconnect from Google Services
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
            class="text-xs text-white mt-1"
          >
            {{ googleAuthStatus.message }}
          </p>
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-cyan-500/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          Remote MCP Servers
          <a href="#" target="_blank" class="ml-2">
            <span class="badge badge-sm badge-soft whitespace-nowrap">
              MCP Info
              <img :src="newTabIcon" class="size-3 inline-block ml-1" />
            </span>
          </a>
        </legend>
        <div class="p-2 space-y-4">
          <div>
            <label for="mcp-servers-config" class="block mb-1 text-sm">
              MCP Servers JSON Configuration (Array)
            </label>
            <textarea
              id="mcp-servers-config"
              v-model="currentSettings.mcpServersConfig"
              rows="10"
              class="textarea textarea-bordered w-full focus:textarea-primary h-60 bg-gray-800"
              placeholder='[
                {
                  "type": "mcp",
                  "server_label": "deepwiki_example",
                  "server_url": "https://mcp.deepwiki.com/mcp",
                  "require_approval": "never",
                  "allowed_tools": ["ask_question"],
                  "headers": {
                    "X-Custom-Header": "example_value"
                  }
                }
              ]'
            ></textarea>
            <p class="text-xs text-gray-400 mt-1">
              Enter a JSON array of MCP server configurations. Each object
              should follow the OpenAI MCP tool format. Refer to MCP
              documentation for details on fields like server_label, server_url,
              require_approval, allowed_tools, and headers.
            </p>
          </div>
        </div>
      </fieldset>

      <fieldset
        class="fieldset bg-gray-900/90 border-gray-600/50 rounded-box w-full border p-4"
      >
        <legend class="fieldset-legend">
          Optional Tool APIs
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
              : 'Save & Test Settings'
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
        <span>Alice v{{ appVersion }}. Built with</span>
        <img :src="heartIcon" class="size-3 inline-block ml-1" />
        <span
          >by
          <a
            href="https://github.com/pmbstyle/Alice"
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
import { ref, watch, onMounted, onUnmounted, reactive, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore, type AliceSettings } from '../stores/settingsStore'
import { useConversationStore } from '../stores/openAIStore'
import { newTabIcon, heartIcon } from '../utils/assetsImport'
import { PREDEFINED_OPENAI_TOOLS } from '../utils/assistantTools'

const appVersion = ref(import.meta.env.VITE_APP_VERSION || '')
const settingsStore = useSettingsStore()
const conversationStore = useConversationStore()

const currentSettings = ref<AliceSettings>({ ...settingsStore.config })

const isRecordingHotkeyFor = ref<keyof AliceSettings | null>(null)
const activeRecordingKeys = ref<Set<string>>(new Set())

const { availableModels } = storeToRefs(conversationStore)

const googleAuthStatus = reactive({
  isAuthenticated: false,
  authInProgress: false,
  isLoading: false,
  error: null as string | null,
  message: null as string | null,
})

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

const availableModelsForSelect = computed(() => {
  return availableModels.value.filter(
    model => model.id.startsWith('gpt-')
    // model.id.startsWith('o1-') || //thinking handling is not available yet
    // model.id.startsWith('o3-') ||
    // model.id.startsWith('o4-')
  )
})

const toolDependencies: Record<string, string[]> = {
  search_torrents: ['VITE_JACKETT_API_KEY', 'VITE_JACKETT_URL'],
  add_torrent_to_qb: ['VITE_QB_URL', 'VITE_QB_USERNAME', 'VITE_QB_PASSWORD'],
  get_calendar_events: ['GOOGLE_AUTH'],
  create_calendar_event: ['GOOGLE_AUTH'],
  update_calendar_event: ['GOOGLE_AUTH'],
  delete_calendar_event: ['GOOGLE_AUTH'],
  get_unread_emails: ['GOOGLE_AUTH'],
  search_emails: ['GOOGLE_AUTH'],
  get_email_content: ['GOOGLE_AUTH'],
}
function betterToolName(name: string): string {
  const nameMap: Record<string, string> = {
    get_current_datetime: 'Current Date & Time',
    open_path: 'Open Apps/URLs',
    manage_clipboard: 'Clipboard Read/Write',
    search_torrents: 'Torrent Search',
    add_torrent_to_qb: 'Add Torrent to QB',
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
  }
  return (
    nameMap[name] ||
    name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  )
}

function isToolConfigured(toolName: string): boolean {
  const currentLocalSettings = currentSettings.value
  const deps = toolDependencies[toolName]
  if (!deps) return true

  return deps.every(depKey => {
    if (depKey === 'GOOGLE_AUTH') {
      return googleAuthStatus.isAuthenticated
    }
    return !!currentLocalSettings[depKey]?.trim()
  })
}

async function checkGoogleAuthStatus() {
  googleAuthStatus.isLoading = true
  googleAuthStatus.error = null
  try {
    const result = await window.ipcRenderer.invoke(
      'google-calendar:check-auth-status'
    )
    if (result.success)
      googleAuthStatus.isAuthenticated = result.isAuthenticated
  } catch (e: any) {
    googleAuthStatus.error = 'Error checking auth status: ' + e.message
  } finally {
    googleAuthStatus.isLoading = false
  }
}

async function connectGoogleServices() {
  googleAuthStatus.isLoading = true
  googleAuthStatus.authInProgress = true
  googleAuthStatus.error = null
  googleAuthStatus.message = null
  try {
    const result = await window.ipcRenderer.invoke(
      'google-calendar:get-auth-url'
    )
    if (result.success) googleAuthStatus.message = result.message
    else {
      googleAuthStatus.error =
        result.error || 'Failed to start Google authentication.'
      googleAuthStatus.authInProgress = false
    }
  } catch (e: any) {
    googleAuthStatus.error = 'Error initiating auth: ' + e.message
    googleAuthStatus.authInProgress = false
  } finally {
    googleAuthStatus.isLoading = false
  }
}

async function disconnectGoogleServices() {
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
        result.error || 'Failed to disconnect from Google.'
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
  googleAuthStatus.isAuthenticated = true
  googleAuthStatus.authInProgress = false
  googleAuthStatus.message = message
  googleAuthStatus.error = null
}

function handleGoogleAuthError(event: any, errorMsg: string) {
  googleAuthStatus.isAuthenticated = false
  googleAuthStatus.authInProgress = false
  googleAuthStatus.error = `Authentication failed: ${errorMsg}`
  googleAuthStatus.message = null
}

const modifierKeys = [
  'Control',
  'Alt',
  'Shift',
  'Meta',
  'Command',
  'Cmd',
  'Option',
  'Super',
]
const keyToAcceleratorMap: Record<string, string> = {
  Control: 'Control',
  Alt: 'Alt',
  Shift: 'Shift',
  Meta: 'Super',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Enter: 'Return',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Tab: 'Tab',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Home: 'Home',
  End: 'End',
  Insert: 'Insert',
  Space: 'Space',
  '+': 'Plus',
}

function electronAcceleratorForKey(key: string): string {
  if (key.length === 1 && key.match(/[a-z0-9]/i)) {
    return key.toUpperCase()
  }
  return keyToAcceleratorMap[key] || key
}

function formatAccelerator(accelerator: string | undefined): string {
  if (!accelerator) return ''
  return accelerator.replace(/\+/g, ' + ')
}

const handleHotkeyKeyDown = (event: KeyboardEvent) => {
  if (!isRecordingHotkeyFor.value) return

  event.preventDefault()
  event.stopPropagation()

  const key = event.key
  if (key === 'Escape') {
    stopRecordingHotkey()
    return
  }

  if (
    modifierKeys.includes(key) ||
    modifierKeys.map(m => m.toLowerCase()).includes(key.toLowerCase())
  ) {
    activeRecordingKeys.value.add(
      electronAcceleratorForKey(
        key === 'Meta' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
          ? 'Command'
          : key === 'Meta'
            ? 'Super'
            : key
      )
    )
  } else {
    const mainKey = electronAcceleratorForKey(key)
    activeRecordingKeys.value.add(mainKey)
    const acceleratorParts = Array.from(activeRecordingKeys.value)

    const order = ['Control', 'Alt', 'Shift', 'Super', 'Command']
    acceleratorParts.sort((a, b) => {
      const aIsModifier = order.includes(a)
      const bIsModifier = order.includes(b)
      if (aIsModifier && !bIsModifier) return -1
      if (!aIsModifier && bIsModifier) return 1
      if (aIsModifier && bIsModifier) return order.indexOf(a) - order.indexOf(b)
      return a.localeCompare(b)
    })

    const newHotkey = acceleratorParts.join('+')
    if (isRecordingHotkeyFor.value) {
      currentSettings.value[isRecordingHotkeyFor.value] = newHotkey
    }
    stopRecordingHotkey()
  }

  if (isRecordingHotkeyFor.value) {
    const tempAccelerator = Array.from(activeRecordingKeys.value).join('+')

    const inputElement = document.getElementById(
      'mic-toggle-hotkey'
    ) as HTMLInputElement
    if (inputElement) {
      inputElement.value = formatAccelerator(tempAccelerator)
    }
  }
}

const startRecordingHotkey = (settingKey: keyof AliceSettings) => {
  isRecordingHotkeyFor.value = settingKey
  activeRecordingKeys.value.clear()
  window.addEventListener('keydown', handleHotkeyKeyDown, true)
}

const stopRecordingHotkey = () => {
  window.removeEventListener('keydown', handleHotkeyKeyDown, true)
  isRecordingHotkeyFor.value = null
  activeRecordingKeys.value.clear()
}

const clearHotkey = (settingKey: keyof AliceSettings) => {
  if (isRecordingHotkeyFor.value === settingKey) {
    stopRecordingHotkey()
  }
  currentSettings.value[settingKey] = ''
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
  if (isRecordingHotkeyFor.value) {
    stopRecordingHotkey()
  }
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

  await settingsStore.saveAndTestSettings()
}
</script>
