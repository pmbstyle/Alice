<template>
  <div>
    <div class="mb-6">
      <h2 class="text-2xl font-semibold mb-3">Good to go!</h2>
      <p class="text-base-content/70">
        Review your settings and complete the setup.
      </p>
    </div>

    <!-- Configuration Summary -->
    <div class="bg-base-300/50 p-4 rounded-lg mb-6">
      <h3 class="font-medium text-lg mb-4">Configuration Summary</h3>

      <div class="space-y-3">
        <!-- AI Provider -->
        <div class="flex justify-between items-center p-3 bg-base-100 rounded">
          <span class="flex items-center">
            <svg
              class="w-5 h-5 mr-3 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <div>
              <div class="font-medium">AI Provider</div>
              <div class="text-sm text-base-content/60">
                Main chat intelligence
              </div>
            </div>
          </span>
          <span class="font-medium capitalize">{{ formData.aiProvider }}</span>
        </div>

        <!-- AI Models -->
        <div class="ml-8 space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">Assistant Model:</span>
            <span>{{ formData.assistantModel }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">Summarization Model:</span>
            <span>{{ formData.summarizationModel }}</span>
          </div>
        </div>

        <!-- Voice Models -->
        <div class="flex justify-between items-center p-3 bg-base-100 rounded">
          <span class="flex items-center">
            <svg
              class="w-5 h-5 mr-3 text-primary"
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
            <div>
              <div class="font-medium">Voice Models</div>
              <div class="text-sm text-base-content/60">
                Speech & audio processing
              </div>
            </div>
          </span>
          <span class="font-medium">
            {{
              formData.useLocalModels ? 'Local (Built-in)' : 'Cloud Services'
            }}
          </span>
        </div>

        <!-- Detailed breakdown if using cloud -->
        <div v-if="!formData.useLocalModels" class="ml-8 space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">Speech-to-Text:</span>
            <span class="capitalize">{{ formData.sttProvider }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">Text-to-Speech:</span>
            <span>OpenAI</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">Embeddings:</span>
            <span>OpenAI</span>
          </div>
        </div>

        <!-- Local models breakdown -->
        <div v-else class="ml-8 space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">Speech-to-Text:</span>
            <span>Whisper (Transformers)</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">Text-to-Speech:</span>
            <span>Kokoro TTS</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-base-content/60">Embeddings:</span>
            <span>Sentence Transformers</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Ready to go -->
    <div class="text-center">
      <div class="mb-4">
        <div
          class="w-16 h-16 mx-auto mb-4 bg-success/20 rounded-full flex items-center justify-center"
        >
          <svg
            class="w-8 h-8 text-success"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h3 class="text-xl font-semibold mb-2">You're All Set!</h3>
        <p class="text-base-content/70">
          Click "Finish Setup" to complete the configuration and start using
          Alice.
        </p>
      </div>

      <div v-if="formData.useLocalModels" class="alert alert-info text-sm">
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
          >Local models will be downloaded automatically when first used. The
          first use may take a few minutes.</span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  formData: any
  isFinishing: boolean
}>()

defineEmits<{
  finish: []
}>()
</script>
