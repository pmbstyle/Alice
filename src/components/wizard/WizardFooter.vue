<template>
  <div class="p-4 border-t border-base-300 bg-base-100 rounded-b-lg">
    <!-- Progress indicator -->
    <div class="mb-4">
      <div class="flex justify-between text-sm text-base-content/60 mb-2">
        <span>Step {{ step }} of {{ totalSteps }}</span>
        <span>{{ Math.round((step / totalSteps) * 100) }}% Complete</span>
      </div>
      <div class="w-full bg-base-300 rounded-full h-2">
        <div
          class="bg-primary h-2 rounded-full transition-all duration-300"
          :style="{ width: `${(step / totalSteps) * 100}%` }"
        ></div>
      </div>
    </div>

    <!-- Navigation buttons -->
    <div class="flex justify-between">
      <button v-if="step > 1" @click="$emit('back')" class="btn btn-ghost">
        <svg
          class="w-4 h-4 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back
      </button>
      <div v-else></div>
      <!-- Spacer -->

      <button
        v-if="step < totalSteps"
        @click="$emit('next')"
        class="btn btn-primary"
        :disabled="!canContinue"
      >
        Next
        <svg
          class="w-4 h-4 ml-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
      <button
        v-else
        @click="$emit('finish')"
        class="btn btn-success"
        :disabled="!canContinue || isFinishing"
      >
        <span
          v-if="isFinishing"
          class="loading loading-spinner loading-xs mr-2"
        ></span>
        <svg
          v-else
          class="w-4 h-4 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
        Finish Setup
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  step: number
  totalSteps: number
  canContinue: boolean
  isFinishing: boolean
}>()

defineEmits<{
  back: []
  next: []
  finish: []
}>()
</script>
