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
            <option value="transformers">Local</option>
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
      <legend class="fieldset-legend">
        Speech-to-Text Configuration
        <span 
          class="w-2 h-2 rounded-full inline-block"
          :class="getServiceStatusClass('stt')"
          :title="getServiceStatusText('stt')"
        ></span>
      </legend>
      <div class="space-y-4 p-2">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div v-if="currentSettings.transformersWakeWordEnabled">
            <label for="wake-word" class="block mb-1 text-sm"
              >Wake Word *</label
            >
            <input
              id="wake-word"
              type="text"
              v-model="currentSettings.transformersWakeWord"
              class="input input-bordered w-full focus:input-primary"
              placeholder="Alice"
              @input="e => $emit('update:setting', 'transformersWakeWord', e.target.value)"
            />
            <p class="text-xs text-gray-400 mt-1">
              Say this word to activate voice recognition. Keep it simple and distinct.
            </p>
          </div>
        </div>
        
        <div class="form-control">
          <label class="cursor-pointer label justify-start gap-3">
            <input
              type="checkbox"
              v-model="currentSettings.transformersWakeWordEnabled"
              class="checkbox checkbox-primary"
              @change="e => $emit('update:setting', 'transformersWakeWordEnabled', e.target.checked)"
            />
            <div class="flex flex-col">
              <span class="label-text font-medium">Enable Wake Word Detection</span>
              <span class="label-text-alt text-gray-400">
                Always listen for a specific wake word before starting transcription (like "Hey Siri" or "Alexa")
              </span>
            </div>
          </label>
        </div>
      </div>
    </fieldset>

    <!-- TTS Settings Section -->
    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">
        Text-to-Speech Configuration
        <span 
          class="w-2 h-2 rounded-full inline-block"
          :class="getServiceStatusClass('tts')"
          :title="getServiceStatusText('tts')"
        ></span>
      </legend>
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
            <option value="local">Local (Piper)</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">
            Choose between cloud-based OpenAI TTS or local Piper TTS.
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
          <div class="flex gap-2 items-center">
            <select
              id="local-tts-voice"
              v-model="currentSettings.localTtsVoice"
              class="select select-bordered flex-1 focus:select-primary"
              @change="onVoiceChange"
            >
              <option v-if="availableVoices.length === 0" disabled value="">
                {{ isRefreshingVoices ? 'Loading voices...' : 'No voices available' }}
              </option>
              <option 
                v-for="voice in availableVoices" 
                :key="voice.name" 
                :value="voice.name"
              >
                {{ voice.description || voice.name }}
              </option>
            </select>
            <button
              type="button"
              @click="refreshVoices"
              :disabled="isRefreshingVoices"
              class="btn btn-square btn-sm"
              title="Refresh voices"
            >
              <span v-if="isRefreshingVoices" class="loading loading-spinner loading-xs"></span>
              <span v-else>🔄</span>
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-1">
            {{ availableVoices.length }} voice{{ availableVoices.length !== 1 ? 's' : '' }} available. Voice models are downloaded automatically.
          </p>
        </div>
      </div>
    </fieldset>

    <!-- Embedding Configuration Section -->
    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">
        Embedding Configuration
        <span 
          class="w-2 h-2 rounded-full inline-block"
          :class="getServiceStatusClass('embeddings')"
          :title="getServiceStatusText('embeddings')"
        ></span>
      </legend>
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


  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { AliceSettings } from '../../stores/settingsStore'
import { backendApi, type Voice } from '../../services/backendApi'

// Type for service status
interface ServiceStatus {
  status: 'ready' | 'downloading' | 'error' | 'offline'
}

const props = defineProps<{
  currentSettings: AliceSettings
}>()

const emit = defineEmits<{
  'update:setting': [
    key: keyof AliceSettings,
    value: string | boolean | number | string[],
  ]
}>()


const serviceStatus = ref<{
  stt: ServiceStatus
  tts: ServiceStatus
  embeddings: ServiceStatus
}>({
  stt: { status: 'offline' },
  tts: { status: 'offline' },
  embeddings: { status: 'offline' }
})

const availableVoices = ref<Voice[]>([])
const isRefreshingVoices = ref(false)

let statusInterval: NodeJS.Timeout | null = null

const updateServiceStatus = async () => {
  try {
    await backendApi.initialize()
    
    // Check each service status
    const [sttReady, ttsReady, embeddingsReady] = await Promise.all([
      backendApi.isSTTReady().catch(() => false),
      backendApi.isTTSReady().catch(() => false),
      backendApi.isEmbeddingsReady().catch(() => false)
    ])
    
    serviceStatus.value = {
      stt: { status: sttReady ? 'ready' : 'error' },
      tts: { status: ttsReady ? 'ready' : 'error' },
      embeddings: { status: embeddingsReady ? 'ready' : 'error' }
    }
  } catch (error) {
    console.warn('Failed to get service status:', error)
    serviceStatus.value = {
      stt: { status: 'offline' },
      tts: { status: 'offline' },
      embeddings: { status: 'offline' }
    }
  }
}

const getServiceStatusClass = (service: 'stt' | 'tts' | 'embeddings') => {
  const status = serviceStatus.value[service].status
  switch (status) {
    case 'ready':
      return 'bg-green-500'
    case 'downloading':
      return 'bg-yellow-500'
    case 'error':
      return 'bg-red-500'
    case 'offline':
    default:
      return 'bg-gray-500'
  }
}

const getServiceStatusText = (service: 'stt' | 'tts' | 'embeddings') => {
  const status = serviceStatus.value[service].status
  const serviceNames = {
    stt: 'Speech-to-Text',
    tts: 'Text-to-Speech', 
    embeddings: 'Embeddings'
  }
  
  switch (status) {
    case 'ready':
      return `${serviceNames[service]} service is ready`
    case 'downloading':
      return `${serviceNames[service]} model is downloading`
    case 'error':
      return `${serviceNames[service]} service has errors`
    case 'offline':
    default:
      return `${serviceNames[service]} service is offline`
  }
}

const refreshVoices = async () => {
  if (isRefreshingVoices.value) return
  
  isRefreshingVoices.value = true
  try {
    await backendApi.initialize()
    const voices = await backendApi.getAvailableVoices()
    availableVoices.value = voices
    console.log('Available voices loaded:', voices)
  } catch (error) {
    console.warn('Failed to load voices:', error)
    availableVoices.value = []
  } finally {
    isRefreshingVoices.value = false
  }
}

const onVoiceChange = async () => {
  try {
    await backendApi.initialize()
    await backendApi.setDefaultVoice(props.currentSettings.localTtsVoice)
    console.log('Default voice updated:', props.currentSettings.localTtsVoice)
  } catch (error) {
    console.warn('Failed to update default voice:', error)
  }
}

onMounted(async () => {
  updateServiceStatus()
  statusInterval = setInterval(updateServiceStatus, 10000) // Check every 10 seconds
  
  // Load voices if local TTS is selected
  if (props.currentSettings.ttsProvider === 'local') {
    await refreshVoices()
  }
})

// Watch for TTS provider changes to load voices
watch(() => props.currentSettings.ttsProvider, async (newProvider) => {
  if (newProvider === 'local') {
    await refreshVoices()
  }
})

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }
})
</script>
