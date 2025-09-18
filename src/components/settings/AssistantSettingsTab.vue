<template>
  <div class="space-y-6">
    <h3 class="text-xl font-semibold mb-4 text-green-400">
      Assistant Configuration
    </h3>

    <fieldset
      class="fieldset bg-gray-900/90 border-green-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Model & Behavior</legend>
      <div class="space-y-4 p-2">
        <div>
          <label
            for="assistant-model"
            class="block mb-1 text-sm flex items-center"
            >Assistant Model *
            <div
              class="tooltip tooltip-right"
              data-tip="The core model used for generating responses. A more powerful model will provide better results but will be more expensive."
            >
              <img :src="infoIcon" class="size-4 ml-1" /></div
          ></label>
          <select
            id="assistant-model"
            v-model="currentSettings.assistantModel"
            class="select select-bordered w-full focus:select-primary"
          >
            <option disabled value="">Select a model</option>
            <option
              v-if="
                availableModels.length === 0 &&
                settingsStore.coreOpenAISettingsValid
              "
              value=""
            >
              Loading models...
            </option>
            <option
              v-for="model in availableModels"
              :key="model.id"
              :value="model.id"
            >
              {{ model.id }}
            </option>
          </select>
          <button
            type="button"
            @click="$emit('refresh-models')"
            :disabled="isRefreshingModels"
            class="btn btn-sm btn-outline btn-primary mt-2"
          >
            <span
              v-if="isRefreshingModels"
              class="loading loading-spinner loading-xs mr-2"
            ></span>
            {{ isRefreshingModels ? 'Loading...' : 'Refresh Models' }}
          </button>
          <p
            v-if="
              !settingsStore.coreOpenAISettingsValid &&
              ((currentSettings.aiProvider === 'openai' &&
                currentSettings.VITE_OPENAI_API_KEY) ||
                (currentSettings.aiProvider === 'openrouter' &&
                  currentSettings.VITE_OPENROUTER_API_KEY) ||
                (currentSettings.aiProvider === 'ollama' &&
                  currentSettings.ollamaBaseUrl) ||
                (currentSettings.aiProvider === 'lm-studio' &&
                  currentSettings.lmStudioBaseUrl)) &&
              availableModels.length === 0
            "
            class="text-xs text-warning mt-1"
          >
            {{ getProviderDisplayName(currentSettings.aiProvider) }}
            API key/configuration needs to be validated (Save & Test) to load
            models.
          </p>
        </div>

        <div>
          <div class="flex justify-between items-center mb-1">
            <label for="assistant-system-prompt" class="block text-sm"
              >Assistant System Prompt</label
            >
            <button
              type="button"
              @click="$emit('reset-system-prompt')"
              class="btn btn-xs btn-ghost"
            >
              Reset
            </button>
          </div>
          <textarea
            id="assistant-system-prompt"
            v-model="currentSettings.assistantSystemPrompt"
            rows="8"
            class="textarea textarea-bordered w-full focus:textarea-primary h-48"
            placeholder="You are a helpful AI assistant..."
          ></textarea>
        </div>

        <div
          v-if="currentSettings.assistantModel.startsWith('gpt-5')"
          class="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label
              for="reasoning-effort"
              class="block mb-1 text-sm flex items-center"
              >Reasoning Effort
              <div
                class="tooltip tooltip-right"
                data-tip="Controls how many reasoning tokens the model generates before producing a response. Higher effort provides more thorough reasoning but increases cost and latency."
              >
                <img :src="infoIcon" class="size-4 ml-1" /></div
            ></label>
            <select
              id="reasoning-effort"
              v-model="currentSettings.assistantReasoningEffort"
              class="select select-bordered w-full focus:select-primary"
            >
              <option value="minimal">Minimal (Fastest)</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High (Most thorough)</option>
            </select>
          </div>
          <div>
            <label
              for="response-verbosity"
              class="block mb-1 text-sm flex items-center"
              >Response Verbosity
              <div
                class="tooltip tooltip-left"
                data-tip="Controls how detailed the model's responses are. Higher verbosity provides more thorough explanations but increases token usage."
              >
                <img :src="infoIcon" class="size-4 ml-1" /></div
            ></label>
            <select
              id="response-verbosity"
              v-model="currentSettings.assistantVerbosity"
              class="select select-bordered w-full focus:select-primary"
            >
              <option value="low">Low (Concise)</option>
              <option value="medium">Medium</option>
              <option value="high">High (Detailed)</option>
            </select>
          </div>
        </div>

        <div
          v-if="
            !currentSettings.assistantModel.startsWith('gpt-5') &&
            !currentSettings.assistantModel.startsWith('o')
          "
          class="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label
              for="assistant-temperature"
              class="block mb-1 text-sm flex items-center"
            >
              Assistant Temperature ({{
                currentSettings.assistantTemperature.toFixed(1)
              }})
              <div
                class="tooltip tooltip-right"
                data-tip="Controls the randomness of the AI's responses. Higher values (e.g., 0.8) make the output more creative, while lower values (e.g., 0.2) make it more deterministic."
              >
                <img :src="infoIcon" class="size-4 ml-1" /></div
            ></label>
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
            <label
              for="assistant-top-p"
              class="block mb-1 text-sm flex items-center"
            >
              Assistant Top P ({{ currentSettings.assistantTopP.toFixed(1) }})
              <div
                class="tooltip tooltip-left"
                data-tip="An alternative to temperature sampling, where the model considers the results of the tokens with top-p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered."
              >
                <img :src="infoIcon" class="size-4 ml-1" /></div
            ></label>
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
      </div>
    </fieldset>

    <fieldset
      class="fieldset bg-gray-900/90 border-green-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Context & Memory</legend>
      <div class="space-y-4 p-2">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              for="max-history-messages"
              class="block mb-1 text-sm flex items-center"
              >Max History Messages (API)
              <div
                class="tooltip tooltip-right"
                data-tip="The number of recent messages to send to the AI. A higher number provides more context but increases cost."
              >
                <img :src="infoIcon" class="size-4 ml-1" /></div
            ></label>
            <input
              id="max-history-messages"
              type="number"
              min="1"
              max="50"
              step="1"
              v-model.number="currentSettings.MAX_HISTORY_MESSAGES_FOR_API"
              class="input input-bordered w-full focus:input-primary"
            />
          </div>
          <div>
            <label
              for="summarization-messages"
              class="block mb-1 text-sm flex items-center"
              >Summarization Message Count
              <div
                class="tooltip tooltip-left"
                data-tip="The number of messages to summarize for providing context to the AI. This helps the AI remember the conversation over a longer period."
              >
                <img :src="infoIcon" class="size-4 ml-1" /></div
            ></label>
            <input
              id="summarization-messages"
              type="number"
              min="5"
              max="100"
              step="1"
              v-model.number="currentSettings.SUMMARIZATION_MESSAGE_COUNT"
              class="input input-bordered w-full focus:input-primary"
            />
          </div>
        </div>
        <div>
          <label
            for="summarization-model"
            class="block mb-1 text-sm flex items-center"
            >Summarization Model *
            <div
              class="tooltip tooltip-right"
              data-tip="The AI model used to summarize the conversation. A smaller, faster model is recommended."
            >
              <img :src="infoIcon" class="size-4 ml-1" /></div
          ></label>
          <select
            id="summarization-model"
            v-model="currentSettings.SUMMARIZATION_MODEL"
            class="select select-bordered w-full focus:select-primary"
          >
            <option disabled value="">Select a summarization model</option>
            <option
              v-if="
                availableModels.length === 0 &&
                settingsStore.coreOpenAISettingsValid
              "
              value=""
            >
              Loading models...
            </option>
            <option
              v-for="model in availableModels"
              :key="`summ-${model.id}`"
              :value="model.id"
            >
              {{ model.id }}
            </option>
          </select>
          <p
            v-if="
              !settingsStore.coreOpenAISettingsValid &&
              ((currentSettings.aiProvider === 'openai' &&
                currentSettings.VITE_OPENAI_API_KEY) ||
                (currentSettings.aiProvider === 'openrouter' &&
                  currentSettings.VITE_OPENROUTER_API_KEY)) &&
              availableModels.length === 0
            "
            class="text-xs text-warning mt-1"
          >
            {{
              currentSettings.aiProvider === 'openai' ? 'OpenAI' : 'OpenRouter'
            }}
            API key needs to be validated (Save & Test) to load models.
          </p>
          <p class="text-xs text-gray-400 mt-1">
            Model used for generating conversation summaries (e.g.,
            gpt-4.1-nano).
          </p>
        </div>

        <div>
          <label for="summarization-system-prompt" class="block mb-1 text-sm"
            >Summarization System Prompt</label
          >
          <textarea
            id="summarization-system-prompt"
            v-model="currentSettings.SUMMARIZATION_SYSTEM_PROMPT"
            rows="6"
            class="textarea textarea-bordered w-full focus:textarea-primary h-40"
            placeholder="You are an expert conversation summarizer..."
          ></textarea>
          <p class="text-xs text-gray-400 mt-1">
            System prompt to guide the summarization model.
          </p>
        </div>
      </div>
    </fieldset>

    <fieldset
      class="fieldset bg-gray-900/90 border-green-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Enabled Tools</legend>
      <div class="space-y-4 p-2">
        <div>
          <div
            class="space-y-2 p-3 border border-neutral-content/20 rounded-md bg-gray-800/50"
          >
            <div
              v-if="availableTools.length === 0"
              class="text-xs text-gray-400"
            >
              No tools defined.
            </div>
            <div
              v-for="tool in availableTools"
              :key="tool.name"
              class="form-control"
            >
              <label
                class="label cursor-pointer py-1 justify-start gap-3"
                :class="{
                  'opacity-50 cursor-not-allowed': !isToolConfigured(tool.name),
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
                  class="label-text tooltip tooltip-right"
                  :data-tip="
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
      v-if="isBrowserContextToolActive"
      class="fieldset bg-gray-900/90 border-green-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">WebSocket Configuration</legend>
      <div class="space-y-4 p-2">
        <div>
          <label
            for="websocket-port"
            class="block mb-1 text-sm flex items-center"
          >
            WebSocket Port
            <div
              class="tooltip tooltip-right"
              data-tip="The port number for the WebSocket server used by the browser_context tool. Ensure this port is available and not blocked by firewall."
            >
              <img :src="infoIcon" class="size-4 ml-1" />
            </div>
          </label>
          <input
            id="websocket-port"
            type="number"
            min="1"
            max="65535"
            step="1"
            v-model.number="currentSettings.websocketPort"
            class="input input-bordered w-full focus:input-primary"
          />
          <p class="text-xs text-gray-400 mt-1">
            Port number for WebSocket server (1-65535). Default: 5421
          </p>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AliceSettings } from '../../stores/settingsStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { infoIcon } from '../../utils/assetsImport'

interface Tool {
  name: string
  description: string
  displayName: string
}

const props = defineProps<{
  currentSettings: AliceSettings
  availableModels: Array<{ id: string }>
  availableTools: Tool[]
  isRefreshingModels: boolean
  isToolConfigured: (toolName: string) => boolean
}>()

defineEmits<{
  'refresh-models': []
  'reset-system-prompt': []
}>()

const settingsStore = useSettingsStore()

const isBrowserContextToolActive = computed(() => {
  return props.currentSettings.assistantTools.includes('browser_context')
})

const getProviderDisplayName = (provider: string): string => {
  const providerNames: Record<string, string> = {
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
    'lm-studio': 'LM Studio',
  }
  return providerNames[provider] || provider
}
</script>
