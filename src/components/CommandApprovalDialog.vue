<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    @click.self="$emit('cancel')"
  >
    <div 
      class="bg-base-100 rounded-lg shadow-xl"
      :class="isMinified ? 'p-3 max-w-xs w-full mx-2' : 'p-6 max-w-md w-full mx-4'"
    >
      <div class="flex items-center" :class="isMinified ? 'mb-2' : 'mb-4'">
        <div :class="isMinified ? 'text-warning text-lg mr-2' : 'text-warning text-2xl mr-3'">⚠️</div>
        <h3 :class="isMinified ? 'text-sm font-semibold' : 'text-lg font-semibold'">
          {{ isMinified ? 'Approve Command?' : 'Command Approval Required' }}
        </h3>
      </div>

      <div v-if="!isMinified" class="mb-4">
        <p class="text-sm text-base-content/70 mb-2">
          Alice wants to execute the following command:
        </p>
        <div class="bg-base-200 rounded p-3 font-mono text-sm break-all">
          {{ command }}
        </div>
      </div>

      <div v-else class="mb-3">
        <div class="bg-base-200 rounded p-2 font-mono text-xs break-all max-h-16 overflow-y-auto">
          {{ command }}
        </div>
      </div>

      <div v-if="!isMinified" class="mb-6">
        <p class="text-sm text-base-content/70">
          Do you want to allow this command to run?
        </p>
      </div>

      <div class="flex flex-col gap-1">
        <button
          @click="$emit('approve', 'once')"
          :class="isMinified ? 'btn btn-success btn-xs' : 'btn btn-success btn-sm'"
        >
          {{ isMinified ? '✓ Once' : '✓ Allow Once' }}
        </button>
        <button
          @click="$emit('approve', 'session')"
          :class="isMinified ? 'btn btn-primary btn-xs' : 'btn btn-primary btn-sm'"
        >
          {{ isMinified ? '✓ Session' : '✓ Allow for This Session' }}
        </button>
        <button
          @click="$emit('approve', 'forever')"
          :class="isMinified ? 'btn btn-accent btn-xs' : 'btn btn-accent btn-sm'"
        >
          {{ isMinified ? '✓ Always' : '✓ Always Allow This Command' }}
        </button>
        <button @click="$emit('cancel')" :class="isMinified ? 'btn btn-error btn-xs' : 'btn btn-error btn-sm'">
          {{ isMinified ? '✗' : '✗ Deny' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  isVisible: boolean
  command: string
  isMinified?: boolean
}

defineProps<Props>()

defineEmits<{
  approve: [approvalType: 'once' | 'session' | 'forever']
  cancel: []
}>()
</script>
