<template>
  <div class="space-y-6">
    <h3 class="text-xl font-semibold mb-4 text-purple-400">
      Integrations & APIs
    </h3>

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
            @click="$emit('connect-google-services')"
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
            googleAuthStatus.authInProgress && !googleAuthStatus.isAuthenticated
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
            @click="$emit('disconnect-google-services')"
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
      <legend class="fieldset-legend">Remote MCP Servers</legend>
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
            :placeholder="mcpPlaceholder"
          ></textarea>
          <p class="text-xs text-gray-400 mt-1">
            Enter a JSON array of MCP server configurations. Each object should
            follow the
            <a
              href="https://cookbook.openai.com/examples/mcp/mcp_tool_guide"
              target="_blank"
              class="link link-hover"
              >OpenAI MCP tool format</a
            >.
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
            Info
            <img :src="newTabIcon" class="size-3 inline-block ml-1" />
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
          <label for="qb-url" class="block mb-1 text-sm">qBittorrent URL</label>
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
        <div
          v-if="currentSettings.assistantTools.includes('perform_web_search')"
        >
          <label for="tavily-key" class="block mb-1 text-sm"
            >Tavily API Key (Web Search)</label
          >
          <input
            id="tavily-key"
            type="password"
            v-model="currentSettings.VITE_TAVILY_API_KEY"
            class="input focus:outline-none w-full"
            autocomplete="new-password"
            placeholder="tvly-..."
          />
          <p class="text-xs text-gray-400 mt-1">
            Required for web search functionality. Get your API key from
            <a
              href="https://tavily.com"
              target="_blank"
              class="link link-primary"
              >Tavily</a
            >.
          </p>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import type { AliceSettings } from '../../stores/settingsStore'
import { newTabIcon } from '../../utils/assetsImport'

interface GoogleAuthStatus {
  isAuthenticated: boolean
  authInProgress: boolean
  isLoading: boolean
  error: string | null
  message: string | null
}

defineProps<{
  currentSettings: AliceSettings
  googleAuthStatus: GoogleAuthStatus
}>()

defineEmits<{
  'connect-google-services': []
  'disconnect-google-services': []
}>()

const mcpPlaceholder = `[
  {
    "type": "mcp",
    "server_label": "deepwiki",
    "server_url": "https://mcp.deepwiki.com/mcp",
    "require_approval": "never"
  }
]`
</script>
