<template>
  <div class="h-full flex items-center justify-center py-4">
    <div class="w-full max-w-xl text-center">
      <div
        class="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center"
      >
        <div class="absolute inset-0 rounded-full bg-primary/10"></div>
        <div class="absolute inset-3 rounded-full bg-primary/20"></div>
        <svg
          class="relative w-12 h-12 text-primary"
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
      </div>

      <h2 class="text-2xl font-semibold mb-3">Set up Alice essentials</h2>
      <p class="text-base-content/65 max-w-md mx-auto">
        Choose the model provider, voice path, and memory mode now. You can
        fine-tune the details later in Settings.
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 text-left">
        <div class="bg-base-300/45 border border-gray-800 rounded-lg p-4">
          <svg
            class="w-5 h-5 mb-3 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <div class="font-medium text-base-content/90">Provider</div>
          <div class="text-sm text-base-content/60 mt-1">
            OpenAI, OpenRouter, or local runtime.
          </div>
        </div>

        <div class="bg-base-300/45 border border-gray-800 rounded-lg p-4">
          <svg
            class="w-5 h-5 mb-3 text-primary"
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
          <div class="font-medium text-base-content/90">Voice</div>
          <div class="text-sm text-base-content/60 mt-1">
            Speech-to-text and text-to-speech.
          </div>
        </div>

        <div class="bg-base-300/45 border border-gray-800 rounded-lg p-4">
          <svg
            class="w-5 h-5 mb-3 text-primary"
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
          <div class="font-medium text-base-content/90">Memory</div>
          <div class="text-sm text-base-content/60 mt-1">
            Embeddings for local recall.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  next: []
}>()
</script>
