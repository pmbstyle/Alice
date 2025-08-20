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
            @change="
              e => $emit('update:setting', 'sttProvider', e.target.value)
            "
          >
            <option value="openai">OpenAI (gpt-4o-transcribe)</option>
            <option value="groq">Groq (whisper-large-v3)</option>
            <option value="transformers">Local (Transformers.js)</option>
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

    <!-- TTS Settings Section -->
    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Text-to-Speech Configuration</legend>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
        <div>
          <label for="tts-provider" class="block mb-1 text-sm"
            >TTS Provider *</label
          >
          <select
            id="tts-provider"
            v-model="currentSettings.ttsProvider"
            class="select select-bordered w-full focus:select-primary"
          >
            <option value="openai">OpenAI (Cloud)</option>
            <option value="local">Local (Kokoro)</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">
            Choose between cloud-based OpenAI TTS or local Kokoro TTS.
          </p>
        </div>
        <div v-if="currentSettings.ttsProvider === 'openai'">
          <label for="tts-voice" class="block mb-1 text-sm"
            >OpenAI TTS Voice *</label
          >
          <select
            id="tts-voice"
            v-model="currentSettings.ttsVoice"
            class="select select-bordered w-full focus:select-primary"
          >
            <option value="alloy">Alloy</option>
            <option value="echo">Echo</option>
            <option value="fable">Fable</option>
            <option value="nova">Nova</option>
            <option value="onyx">Onyx</option>
            <option value="shimmer">Shimmer</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">
            The OpenAI voice to use for text-to-speech synthesis.
          </p>
        </div>
        <div v-if="currentSettings.ttsProvider === 'local'">
          <label for="local-tts-voice" class="block mb-1 text-sm"
            >Local TTS Voice *</label
          >
          <select
            id="local-tts-voice"
            v-model="currentSettings.localTtsVoice"
            class="select select-bordered w-full focus:select-primary"
          >
            <option value="af_heart">af_heart</option>
            <option value="af_alloy">af_alloy</option>
            <option value="af_aoede">af_aoede</option>
            <option value="af_bella">af_bella</option>
            <option value="af_jessica">af_jessica</option>
            <option value="af_kore">af_kore</option>
            <option value="af_nicole">af_nicole</option>
            <option value="af_nova">af_nova</option>
            <option value="af_river">af_river</option>
            <option value="af_sarah">af_sarah</option>
            <option value="af_sky">af_sky</option>
            <option value="bf_alice">bf_alice</option>
            <option value="bf_emma">bf_emma</option>
            <option value="bf_isabella">bf_isabella</option>
            <option value="bf_lily">bf_lily</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">
            The Kokoro voice to use for local text-to-speech synthesis.
          </p>
        </div>
      </div>
    </fieldset>

    <!-- Transformers STT Model Download Section -->
    <fieldset
      v-if="currentSettings.sttProvider === 'transformers'"
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Local STT Model Configuration</legend>
      <div class="p-2">
        <TransformersModelDownload
          :current-settings="currentSettings"
          @update:setting="(key, value) => $emit('update:setting', key, value)"
        />
      </div>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import type { AliceSettings } from '../../stores/settingsStore'
import TransformersModelDownload from '../TransformersModelDownload.vue'

defineProps<{
  currentSettings: AliceSettings
}>()

defineEmits<{
  'update:setting': [
    key: keyof AliceSettings,
    value: string | boolean | number | string[],
  ]
}>()
</script>
