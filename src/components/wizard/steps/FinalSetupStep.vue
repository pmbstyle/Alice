<template>
  <div>
    <div class="mb-4">
      <h2 class="text-2xl font-semibold mb-2">Good to go!</h2>
      <p class="text-base-content/70">
        Review the first-run defaults. Detailed voices, local STT models, and
        memory options stay editable in Settings.
      </p>
    </div>

    <!-- Configuration Summary -->
    <div class="bg-base-300/50 p-4 rounded-lg mb-4">
      <h3 class="font-medium text-lg mb-3">Configuration Summary</h3>

      <div class="space-y-2">
        <!-- AI Provider -->
        <div
          class="flex justify-between items-center p-2.5 bg-base-100 rounded"
        >
          <span class="flex items-center">
            <svg
              class="w-4 h-4 mr-3 text-primary"
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
            <span class="font-medium">AI Provider</span>
          </span>
          <span class="font-medium">{{
            providerLabel(formData.aiProvider)
          }}</span>
        </div>

        <!-- AI Models -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div class="flex justify-between gap-3">
            <span class="text-base-content/60">Assistant:</span>
            <span class="text-right">{{ formData.assistantModel }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-base-content/60">Summarization:</span>
            <span class="text-right">{{ formData.summarizationModel }}</span>
          </div>
        </div>

        <!-- Voice Models -->
        <div
          class="flex justify-between items-center p-2.5 bg-base-100 rounded"
        >
          <span class="flex items-center">
            <svg
              class="w-4 h-4 mr-3 text-primary"
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
            <span class="font-medium">Voice Models</span>
          </span>
          <span class="font-medium">
            {{
              formData.useLocalModels ? 'Local (Built-in)' : 'Cloud Services'
            }}
          </span>
        </div>

        <!-- Detailed breakdown if using cloud -->
        <div
          v-if="!formData.useLocalModels"
          class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm"
        >
          <div class="flex justify-between gap-3">
            <span class="text-base-content/60">STT:</span>
            <span>{{ providerLabel(formData.sttProvider) }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-base-content/60">TTS:</span>
            <span>{{ providerLabel(formData.ttsProvider) }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-base-content/60">Embeddings:</span>
            <span>{{ providerLabel(formData.embeddingProvider) }}</span>
          </div>
        </div>

        <!-- Local models breakdown -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <div class="flex justify-between gap-3">
            <span class="text-base-content/60">STT:</span>
            <span class="text-right">Local Whisper</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-base-content/60">TTS:</span>
            <span class="text-right">Local Piper</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-base-content/60">Embeddings:</span>
            <span class="text-right">Local MiniLM</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Ready to go -->
    <div class="alert alert-success text-sm">
      <svg
        class="stroke-current shrink-0 w-5 h-5"
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
      <div>
        <div class="font-medium">Ready to finish setup</div>
        <div>
          Provider choices stay editable in Settings.
          <span v-if="formData.useLocalModels">
            Local models download automatically on first use.
          </span>
        </div>
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

const providerLabel = (provider: string) => {
  const labels: Record<string, string> = {
    google: 'Google',
    groq: 'Groq',
    'lm-studio': 'LM Studio',
    local: 'Local',
    minimax: 'MiniMax',
    ollama: 'Ollama',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    zai: 'Z.ai',
  }

  return labels[provider] || provider
}
</script>
