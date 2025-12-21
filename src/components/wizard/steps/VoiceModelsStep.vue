<template>
  <div>
    <div class="mb-6">
      <h2 class="text-2xl font-semibold mb-3">
        Choose Voice & Embedding Models
      </h2>
      <p class="text-base-content/70">
        Choose between cloud services or built-in local models for privacy and
        offline use.
      </p>
    </div>

    <!-- Local vs Cloud Toggle -->
    <div class="bg-base-300/50 p-4 rounded-lg mb-6">
      <div class="form-control">
        <label class="label w-full cursor-pointer">
          <div class="flex-1 pr-4">
            <span class="label-text font-medium text-lg">Use Local Models</span>
            <div class="text-sm text-base-content/60 mt-1">
              Run voice features locally for privacy and offline use.
            </div>
          </div>
          <input
            type="checkbox"
            class="toggle toggle-primary toggle-lg flex-shrink-0"
            :checked="formData.useLocalModels"
            @change="
              $emit('toggle-local', ($event.target as HTMLInputElement).checked)
            "
          />
        </label>
      </div>
    </div>

    <div v-if="formData.useLocalModels">
      <!-- Local Models Information -->
      <div class="space-y-4">
        <div class="alert alert-success text-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="stroke-current shrink-0 w-5 h-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p class="font-medium">Great choice! Local models provide:</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
              <li>Complete privacy - nothing leaves your device</li>
              <li>Offline functionality</li>
              <li>No API costs</li>
              <li>Fast local processing</li>
            </ul>
          </div>
        </div>

        <div class="bg-base-200 p-4 rounded-lg space-y-3">
          <h3 class="font-medium text-base-content/90">
            Local Models Configuration:
          </h3>

          <div class="grid grid-cols-1 gap-3 text-sm">
            <div
              class="flex justify-between items-center p-2 bg-base-100 rounded"
            >
              <span class="flex items-center">
                <svg
                  class="w-4 h-4 mr-2 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a5 5 0 1110 0v6a3 3 0 01-3 3z"
                  />
                </svg>
                Speech-to-Text
              </span>
              <span class="text-base-content/60"
                >Local Whisper (Go Backend)</span
              >
            </div>

            <div
              class="flex justify-between items-center p-2 bg-base-100 rounded"
            >
              <span class="flex items-center">
                <svg
                  class="w-4 h-4 mr-2 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
                Text-to-Speech
              </span>
              <div class="text-right">
                <div class="text-base-content/90 font-medium">
                  Local Piper TTS (Go Backend)
                </div>
                <div class="text-xs text-base-content/60">
                  30+ voices, 20+ languages
                </div>
              </div>
            </div>

            <div
              class="flex justify-between items-center p-2 bg-base-100 rounded"
            >
              <span class="flex items-center">
                <svg
                  class="w-4 h-4 mr-2 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                  />
                </svg>
                Embeddings
              </span>
              <span class="text-base-content/60"
                >Local MiniLM (Go Backend)</span
              >
            </div>
          </div>
        </div>

        <!-- Voice Languages Showcase -->
        <div class="bg-base-200 p-4 rounded-lg space-y-3">
          <h3 class="font-medium text-base-content/90 flex items-center gap-2">
            <span>🌍</span> Available Voice Languages
          </h3>
          <div
            class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs"
          >
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇺🇸</span> English (US)
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇬🇧</span> English (UK)
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇪🇸</span> Spanish
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇫🇷</span> French
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇩🇪</span> German
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇮🇹</span> Italian
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇧🇷</span> Portuguese
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇷🇺</span> Russian
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇨🇳</span> Chinese
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇯🇵</span> Japanese
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇳🇱</span> Dutch
            </div>
            <div class="flex items-center gap-1 p-2 bg-base-100 rounded">
              <span>🇳🇴</span> Nordic
            </div>
          </div>
          <p class="text-xs text-base-content/60 mt-2">
            <strong>+8 more languages</strong> including Hindi, Arabic, Polish,
            Ukrainian, Finnish and more!
          </p>
        </div>

        <div class="alert alert-info text-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="stroke-current shrink-0 w-5 h-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <span
            >Voice models will be downloaded automatically when first used. You
            can preview and select different voices in Settings.</span
          >
        </div>
      </div>
    </div>

    <div v-else>
      <!-- Cloud Models Configuration -->
      <div class="space-y-4">
        <!-- OpenAI Key requirement for non-OpenAI providers -->
        <div
          v-if="
            (formData.aiProvider === 'ollama' ||
              formData.aiProvider === 'lm-studio' ||
              formData.aiProvider === 'openrouter') &&
            !formData.VITE_OPENAI_API_KEY?.trim()
          "
          class="alert alert-warning text-sm"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="stroke-current shrink-0 w-5 h-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z"
            ></path>
          </svg>
          <span
            >Since you chose cloud voice services, you'll need an OpenAI API key
            for TTS, STT, and embeddings.</span
          >
        </div>

        <div v-else class="alert alert-info text-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            class="stroke-current shrink-0 w-5 h-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <span
            >Using cloud services for voice features. These typically provide
            faster processing and higher quality.</span
          >
        </div>

        <!-- OpenAI API Key for non-OpenAI providers -->
        <div
          v-if="
            formData.aiProvider === 'ollama' ||
            formData.aiProvider === 'lm-studio' ||
            formData.aiProvider === 'openrouter'
          "
          class="form-control"
        >
          <label class="label">
            <span class="label-text">OpenAI API Key (for Voice Features)</span>
          </label>
          <div class="text-sm text-base-content/70 mb-2">
            Required for voice features and embeddings. Get one from the
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              class="link link-primary"
              >OpenAI Platform</a
            >.
          </div>
          <input
            type="password"
            v-model="formData.VITE_OPENAI_API_KEY"
            placeholder="sk-..."
            class="input input-bordered w-full focus:input-primary"
          />
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text font-medium">Speech-to-Text Provider</span>
          </label>
          <select
            v-model="formData.sttProvider"
            class="select select-bordered w-full focus:select-primary focus:outline-none"
          >
            <option value="openai">OpenAI (Good quality, integrated)</option>
            <option value="groq">Groq (Faster, requires separate key)</option>
            <option value="google">Google (Cloud)</option>
          </select>
        </div>

        <div v-if="formData.sttProvider === 'groq'" class="form-control">
          <label class="label">
            <span class="label-text">Groq API Key</span>
          </label>
          <div class="text-sm text-base-content/70 mb-2">
            Get your key from the
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              class="link link-primary"
              >Groq Console</a
            >
          </div>
          <input
            type="password"
            v-model="formData.VITE_GROQ_API_KEY"
            placeholder="gsk_..."
            class="input input-bordered w-full focus:input-primary"
          />
        </div>

        <div v-if="formData.sttProvider === 'google'" class="form-control">
          <label class="label">
            <span class="label-text">Google API Key</span>
          </label>
          <div class="text-sm text-base-content/70 mb-2">
            Required for Google Cloud Speech-to-Text.
          </div>
          <input
            type="password"
            v-model="formData.VITE_GOOGLE_API_KEY"
            placeholder="AIza..."
            class="input input-bordered w-full focus:input-primary"
          />
        </div>

        <div class="bg-base-200 p-4 rounded-lg space-y-2">
          <h3 class="font-medium text-base-content/90">
            Current Configuration:
          </h3>
          <div class="text-sm space-y-1">
            <div class="flex justify-between">
              <span class="text-base-content/60">Speech-to-Text:</span>
              <span class="capitalize">{{ formData.sttProvider }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content/60">Text-to-Speech:</span>
              <span>OpenAI</span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content/60">Embeddings:</span>
              <span>OpenAI</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  formData: any
}>()

defineEmits<{
  'toggle-local': [useLocal: boolean]
}>()
</script>
