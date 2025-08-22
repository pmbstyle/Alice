<template>
  <div class="text-center">
    <div class="mb-8">
      <!-- Alice logo or icon could go here -->
      <div
        class="w-20 h-20 mx-auto mb-6 bg-primary/20 rounded-full flex items-center justify-center"
      >
        <svg
          class="w-10 h-10 text-primary"
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

      <p class="text-base-content/60">
        Let's get you set up in just a few steps. This will only take a couple
        of minutes.
      </p>
    </div>

    <div class="space-y-4 text-left bg-base-300/50 p-4 rounded-lg">
      <h3 class="font-semibold text-base-content/90">What we'll configure:</h3>
      <ul class="space-y-2 text-sm text-base-content/70">
        <li class="flex items-center">
          <svg
            class="w-4 h-4 mr-3 text-primary"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
          AI Provider (OpenAI, OpenRouter, or Local)
        </li>
        <li class="flex items-center">
          <svg
            class="w-4 h-4 mr-3 text-primary"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
          Voice Models (Speech-to-Text & Text-to-Speech)
        </li>
        <li class="flex items-center">
          <svg
            class="w-4 h-4 mr-3 text-primary"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
          Memory & Embedding Models
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  next: []
}>()
</script>
