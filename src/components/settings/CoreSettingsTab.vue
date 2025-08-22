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
            <option value="transformers">Local (Python STT)</option>
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

    <!-- STT Configuration Section -->
    <fieldset
      v-if="currentSettings.sttProvider === 'transformers'"
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Speech-to-Text Configuration</legend>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
        <div>
          <label for="stt-language" class="block mb-1 text-sm"
            >Language *</label
          >
          <select
            id="stt-language"
            v-model="currentSettings.transformersLanguage"
            class="select select-bordered w-full focus:select-primary"
            @change="e => $emit('update:setting', 'transformersLanguage', e.target.value)"
          >
            <option value="auto">Auto-detect</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ru">Russian</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="ar">Arabic</option>
            <option value="hi">Hindi</option>
            <option value="tr">Turkish</option>
            <option value="pl">Polish</option>
            <option value="nl">Dutch</option>
            <option value="sv">Swedish</option>
            <option value="da">Danish</option>
            <option value="no">Norwegian</option>
            <option value="fi">Finnish</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">
            Auto-detect works for most languages. Select a specific language for better accuracy.
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
            >OpenAI TTS Voice</label
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
        </div>
        <div v-if="currentSettings.ttsProvider === 'local'">
          <label for="local-tts-voice" class="block mb-1 text-sm"
            >Local TTS Voice</label
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
        </div>
      </div>
    </fieldset>

    <!-- Embedding Configuration Section -->
    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Embedding Configuration</legend>
      <div class="grid grid-cols-1 gap-4 p-2">
        <div>
          <label for="embedding-provider" class="block mb-1 text-sm"
            >Embedding Provider *</label
          >
          <select
            id="embedding-provider"
            v-model="currentSettings.embeddingProvider"
            class="select select-bordered w-full focus:select-primary"
          >
            <option value="openai">OpenAI (Cloud)</option>
            <option value="local">Local (Qwen3)</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">
            Choose between cloud-based OpenAI embeddings or local Qwen3 embeddings. Your existing data is preserved when switching.
          </p>
        </div>
      </div>
    </fieldset>

    <!-- Local AI Models Management Section -->
    <fieldset
      v-if="showLocalModelsSection"
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Local AI Models Management</legend>
      <div class="space-y-4 p-2">
        <div class="alert alert-info">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>Local AI models are downloaded on-demand to reduce bundle size. Download models for the services you want to use locally.</span>
        </div>

        <div v-if="backendOffline" class="alert alert-warning">
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span>Python AI backend is offline. Models cannot be downloaded or used until the backend is running.</span>
        </div>

        <!-- STT Model Management -->
        <div class="flex items-center justify-between p-4 bg-base-200 rounded-lg">
          <div>
            <h4 class="font-medium">Speech-to-Text (Faster Whisper)</h4>
            <p class="text-sm text-gray-400">Local speech recognition using faster-whisper</p>
            <div class="flex items-center gap-2 mt-1">
              <span class="badge" :class="modelStatus.stt.installed ? 'badge-success' : 'badge-error'">
                {{ modelStatus.stt.installed ? 'Installed' : 'Not Installed' }}
              </span>
              <span v-if="modelStatus.stt.downloading" class="loading loading-spinner loading-sm"></span>
              <span v-if="modelStatus.stt.downloading" class="text-sm text-yellow-400">Downloading...</span>
            </div>
          </div>
          <button
            @click="downloadModel('stt')"
            :disabled="backendOffline || modelStatus.stt.installed || modelStatus.stt.downloading"
            class="btn btn-primary btn-sm"
          >
            <span v-if="modelStatus.stt.downloading" class="loading loading-spinner loading-sm"></span>
            <span v-else-if="modelStatus.stt.installed">✓ Installed</span>
            <span v-else>Download</span>
          </button>
        </div>

        <!-- TTS Model Management -->
        <div class="flex items-center justify-between p-4 bg-base-200 rounded-lg">
          <div>
            <h4 class="font-medium">Text-to-Speech (Kokoro)</h4>
            <p class="text-sm text-gray-400">Local speech synthesis using Kokoro TTS</p>
            <div class="flex items-center gap-2 mt-1">
              <span class="badge" :class="modelStatus.tts.installed ? 'badge-success' : 'badge-error'">
                {{ modelStatus.tts.installed ? 'Installed' : 'Not Installed' }}
              </span>
              <span v-if="modelStatus.tts.downloading" class="loading loading-spinner loading-sm"></span>
              <span v-if="modelStatus.tts.downloading" class="text-sm text-yellow-400">Downloading...</span>
            </div>
          </div>
          <button
            @click="downloadModel('tts')"
            :disabled="backendOffline || modelStatus.tts.installed || modelStatus.tts.downloading"
            class="btn btn-primary btn-sm"
          >
            <span v-if="modelStatus.tts.downloading" class="loading loading-spinner loading-sm"></span>
            <span v-else-if="modelStatus.tts.installed">✓ Installed</span>
            <span v-else>Download</span>
          </button>
        </div>

        <!-- Embeddings Model Management -->
        <div class="flex items-center justify-between p-4 bg-base-200 rounded-lg">
          <div>
            <h4 class="font-medium">Embeddings (Sentence Transformers)</h4>
            <p class="text-sm text-gray-400">Local text embeddings using Qwen3</p>
            <div class="flex items-center gap-2 mt-1">
              <span class="badge" :class="modelStatus.embeddings.installed ? 'badge-success' : 'badge-error'">
                {{ modelStatus.embeddings.installed ? 'Installed' : 'Not Installed' }}
              </span>
              <span v-if="modelStatus.embeddings.downloading" class="loading loading-spinner loading-sm"></span>
              <span v-if="modelStatus.embeddings.downloading" class="text-sm text-yellow-400">Downloading...</span>
            </div>
          </div>
          <button
            @click="downloadModel('embeddings')"
            :disabled="backendOffline || modelStatus.embeddings.installed || modelStatus.embeddings.downloading"
            class="btn btn-primary btn-sm"
          >
            <span v-if="modelStatus.embeddings.downloading" class="loading loading-spinner loading-sm"></span>
            <span v-else-if="modelStatus.embeddings.installed">✓ Installed</span>
            <span v-else>Download</span>
          </button>
        </div>

        <div class="text-xs text-gray-400 mt-4">
          <p>Note: Model downloads require an active internet connection and may take several minutes. The application will remain functional during downloads.</p>
        </div>
      </div>
    </fieldset>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { AliceSettings } from '../../stores/settingsStore'
import { pythonApi, type ModelDownloadStatus } from '../../services/pythonApi'

const props = defineProps<{
  currentSettings: AliceSettings
}>()

const emit = defineEmits<{
  'update:setting': [
    key: keyof AliceSettings,
    value: string | boolean | number | string[],
  ]
}>()


const modelStatus = ref<ModelDownloadStatus>({
  stt: { installed: false, downloading: false },
  tts: { installed: false, downloading: false },
  embeddings: { installed: false, downloading: false }
})

const backendOffline = ref(false)

const showLocalModelsSection = computed(() => {
  return props.currentSettings.sttProvider === 'transformers' ||
         props.currentSettings.ttsProvider === 'local' ||
         props.currentSettings.embeddingProvider === 'local'
})

let statusInterval: NodeJS.Timeout | null = null

const updateModelStatus = async () => {
  try {
    const status = await pythonApi.getModelDownloadStatus()
    modelStatus.value = status
    backendOffline.value = false
  } catch (error) {
    console.warn('Failed to get model download status:', error)
    backendOffline.value = true
    modelStatus.value = {
      stt: { installed: false, downloading: false },
      tts: { installed: false, downloading: false },
      embeddings: { installed: false, downloading: false }
    }
  }
}

const downloadModel = async (service: 'stt' | 'tts' | 'embeddings') => {
  try {
    console.log(`Starting download for ${service} model...`)

    modelStatus.value[service].downloading = true
    
    const result = await pythonApi.downloadModel(service)
    
    if (result.success) {
      console.log(`${service} model downloaded successfully`)
      await updateModelStatus()
    } else {
      console.error(`Failed to download ${service} model:`, result.error || result.message)
      alert(`Failed to download ${service} model: ${result.error || 'Unknown error'}`)
    }
  } catch (error) {
    console.error(`Error downloading ${service} model:`, error)
    alert(`Error downloading ${service} model. Please check your internet connection.`)
  } finally {
    modelStatus.value[service].downloading = false
    await updateModelStatus()
  }
}

onMounted(() => {
  updateModelStatus()
  statusInterval = setInterval(updateModelStatus, 5000)
})

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }
})
</script>
