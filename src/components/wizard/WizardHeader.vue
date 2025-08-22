<template>
  <div
    class="flex items-center justify-between p-4 border-b border-base-300 bg-base-100 rounded-t-lg"
  >
    <!-- Drag handle -->
    <button
      class="dragable select-none p-1 hover:bg-base-200 rounded transition-colors"
    >
      <svg
        fill="currentColor"
        viewBox="0 0 32 32"
        class="w-6 h-6 text-base-content/60"
      >
        <rect x="10" y="6" width="4" height="4" />
        <rect x="18" y="6" width="4" height="4" />
        <rect x="10" y="14" width="4" height="4" />
        <rect x="18" y="14" width="4" height="4" />
        <rect x="10" y="22" width="4" height="4" />
        <rect x="18" y="22" width="4" height="4" />
      </svg>
    </button>

    <!-- Title -->
    <h1 class="text-xl font-semibold text-center flex-1">{{ title }}</h1>

    <!-- Close button -->
    <button
      @click="$emit('close')"
      class="p-2 hover:bg-base-200 rounded-full transition-colors"
      title="Close Setup"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="w-5 h-5 text-base-content/60"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()

defineEmits<{
  close: []
}>()
</script>
