<template>
  <div class="space-y-6">
    <h3 class="text-xl font-semibold mb-4 text-blue-400">
      Core API Configuration
    </h3>
    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">API Keys & Providers</legend>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
        <div>
          <label for="ai-provider" class="block mb-1 text-sm"
            >AI Provider *</label
          >
          <select
            id="ai-provider"
            v-model="currentSettings.aiProvider"
            class="select select-bordered w-full focus:select-primary"
          >
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="ollama">Ollama (Local)</option>
            <option value="lm-studio">LM Studio (Local)</option>
          </select>
        </div>
        <div>
          <label for="stt-provider" class="block mb-1 text-sm"
            >Speech-to-Text Provider *</label
          >
          <select
            id="stt-provider"
            v-model="currentSettings.sttProvider"
            class="select select-bordered w-full focus:select-primary"
          >
            <option value="openai">OpenAI (gpt-4o-transcribe)</option>
            <option value="groq">Groq (whisper-large-v3)</option>
          </select>
        </div>
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
          <p class="text-xs text-gray-400 mt-1">
            Required for TTS/STT/embeddings regardless of AI provider.
          </p>
        </div>
        <div v-if="currentSettings.aiProvider === 'openrouter'">
          <label for="openrouter-key" class="block mb-1 text-sm"
            >OpenRouter API Key *</label
          >
          <input
            id="openrouter-key"
            type="password"
            v-model="currentSettings.VITE_OPENROUTER_API_KEY"
            class="input focus:outline-none w-full"
            autocomplete="new-password"
            placeholder="sk-or-v1-..."
          />
          <p class="text-xs text-gray-400 mt-1">
            Required for chat models when using OpenRouter.
          </p>
        </div>
        <div v-if="currentSettings.aiProvider === 'ollama'">
          <label for="ollama-url" class="block mb-1 text-sm"
            >Ollama Base URL *</label
          >
          <input
            id="ollama-url"
            type="text"
            v-model="currentSettings.ollamaBaseUrl"
            class="input focus:outline-none w-full"
            placeholder="http://localhost:11434"
          />
          <p class="text-xs text-gray-400 mt-1">
            URL where your Ollama server is running.
          </p>
        </div>
        <div v-if="currentSettings.aiProvider === 'lm-studio'">
          <label for="lmstudio-url" class="block mb-1 text-sm"
            >LM Studio Base URL *</label
          >
          <input
            id="lmstudio-url"
            type="text"
            v-model="currentSettings.lmStudioBaseUrl"
            class="input focus:outline-none w-full"
            placeholder="http://localhost:1234"
          />
          <p class="text-xs text-gray-400 mt-1">
            URL where your LM Studio server is running.
          </p>
        </div>
        <div v-if="currentSettings.sttProvider === 'groq'">
          <label for="groq-key" class="block mb-1 text-sm"
            >Groq API Key (for STT) *</label
          >
          <input
            id="groq-key"
            type="password"
            v-model="currentSettings.VITE_GROQ_API_KEY"
            class="input focus:outline-none w-full"
            autocomplete="new-password"
            placeholder="gsk_..."
          />
          <p class="text-xs text-gray-400 mt-1">
            Required only if Groq STT is selected above.
          </p>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import type { AliceSettings } from '../../stores/settingsStore'

defineProps<{
  currentSettings: AliceSettings
}>()
</script>