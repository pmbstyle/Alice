<template>
  <div class="memory-manager p-4 h-full overflow-y-auto text-white">
    <h2 class="text-2xl font-semibold mb-6 text-center">Manage Memories</h2>

    <form
      @submit.prevent="handleSaveMemory"
      class="mb-8 p-4 bg-gray-800 rounded-lg"
    >
      <h3 class="text-xl mb-3">
        {{ editingMemoryId ? 'Edit Memory' : 'Create New Memory' }}
      </h3>
      <div class="mb-4">
        <label for="memory-content" class="block mb-1 text-sm">Content *</label>
        <textarea
          id="memory-content"
          v-model="form.content"
          rows="3"
          class="textarea textarea-bordered w-full focus:textarea-primary text-white bg-gray-700"
          placeholder="Enter memory content..."
          required
        ></textarea>
      </div>
      <div class="mb-4">
        <label for="memory-type" class="block mb-1 text-sm"
          >Type (e.g., personal, work, hobby)</label
        >
        <input
          id="memory-type"
          type="text"
          v-model="form.memoryType"
          class="input input-bordered w-full focus:input-primary text-white bg-gray-700"
          placeholder="general"
        />
      </div>
      <div class="flex gap-3">
        <button
          type="submit"
          class="btn btn-primary btn-sm"
          :disabled="isSaving"
        >
          <span
            v-if="isSaving"
            class="loading loading-spinner loading-xs"
          ></span>
          {{ editingMemoryId ? 'Save Changes' : 'Add Memory' }}
        </button>
        <button
          v-if="editingMemoryId"
          type="button"
          @click="cancelEdit"
          class="btn btn-warning btn-sm"
        >
          Cancel Edit
        </button>
      </div>
      <p v-if="formError" class="text-red-400 text-xs mt-2">{{ formError }}</p>
    </form>

    <div class="mb-6">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-xl">Stored Memories ({{ memories.length }})</h3>
        <button
          @click="confirmDeleteAllMemories"
          class="btn btn-error btn-sm btn-outline"
          :disabled="memories.length === 0 || isLoading"
        >
          Delete All Memories
        </button>
      </div>
      <div v-if="isLoading" class="text-center py-4">
        <span class="loading loading-lg loading-spinner text-primary"></span>
        <p>Loading memories...</p>
      </div>
      <div
        v-else-if="memories.length === 0"
        class="text-center py-4 text-gray-400"
      >
        No memories stored yet.
      </div>
      <ul v-else class="space-y-3">
        <li
          v-for="memory in memories"
          :key="memory.id"
          class="p-3 bg-gray-800/70 rounded-lg shadow flex flex-col sm:flex-row justify-between items-start gap-2"
        >
          <div class="flex-grow">
            <p class="text-xs text-gray-400 mb-1">
              <span class="font-semibold">Type:</span>
              {{ memory.memoryType || 'general' }} |
              <span class="font-semibold">Date:</span>
              {{ formatDate(memory.createdAt) }}
            </p>
            <p class="text-sm whitespace-pre-wrap">{{ memory.content }}</p>
          </div>
          <div class="flex gap-2 sm:mt-0 shrink-0">
            <button @click="startEdit(memory)" class="btn btn-secondary btn-xs">
              Edit
            </button>
            <button
              @click="confirmDeleteMemory(memory.id)"
              class="btn btn-error btn-xs btn-outline"
            >
              Delete
            </button>
          </div>
        </li>
      </ul>
    </div>
    <p v-if="listError" class="text-red-400 text-xs mt-2">{{ listError }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'

interface Memory {
  id: string
  content: string
  memoryType: string
  createdAt: string
}

const memories = ref<Memory[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const listError = ref<string | null>(null)
const formError = ref<string | null>(null)

const form = reactive({
  content: '',
  memoryType: 'general',
})
const editingMemoryId = ref<string | null>(null)

async function fetchMemories() {
  isLoading.value = true
  listError.value = null
  try {
    const result = await window.ipcRenderer.invoke('memory:get', { limit: 200 })
    if (result.success) {
      memories.value = result.data
    } else {
      listError.value = result.error || 'Failed to fetch memories.'
    }
  } catch (error: any) {
    listError.value = `Error: ${error.message}`
  } finally {
    isLoading.value = false
  }
}

async function handleSaveMemory() {
  if (!form.content.trim()) {
    formError.value = 'Memory content cannot be empty.'
    return
  }
  isSaving.value = true
  formError.value = null
  try {
    let result
    const memoryData = {
      content: form.content,
      memoryType: form.memoryType.trim() || 'general',
    }

    if (editingMemoryId.value) {
      result = await window.ipcRenderer.invoke('memory:update', {
        id: editingMemoryId.value,
        ...memoryData,
      })
    } else {
      result = await window.ipcRenderer.invoke('memory:save', memoryData)
    }

    if (result.success) {
      await fetchMemories()
      resetForm()
    } else {
      formError.value = result.error || 'Failed to save memory.'
    }
  } catch (error: any) {
    formError.value = `Error: ${error.message}`
  } finally {
    isSaving.value = false
  }
}

function startEdit(memory: Memory) {
  editingMemoryId.value = memory.id
  form.content = memory.content
  form.memoryType = memory.memoryType
  window.scrollTo(0, 0)
}

function cancelEdit() {
  resetForm()
}

function resetForm() {
  editingMemoryId.value = null
  form.content = ''
  form.memoryType = 'general'
  formError.value = null
}

async function confirmDeleteMemory(id: string) {
  if (confirm('Are you sure you want to delete this memory?')) {
    isLoading.value = true
    try {
      const result = await window.ipcRenderer.invoke('memory:delete', { id })
      if (result.success) {
        await fetchMemories()
      } else {
        listError.value = result.error || 'Failed to delete memory.'
      }
    } catch (error: any) {
      listError.value = `Error: ${error.message}`
    } finally {
      isLoading.value = false
    }
  }
}

async function confirmDeleteAllMemories() {
  if (
    confirm(
      'Are you sure you want to delete ALL memories? This cannot be undone.'
    )
  ) {
    isLoading.value = true
    try {
      const result = await window.ipcRenderer.invoke('memory:delete-all')
      if (result.success) {
        await fetchMemories()
      } else {
        listError.value = result.error || 'Failed to delete all memories.'
      }
    } catch (error: any) {
      listError.value = `Error: ${error.message}`
    } finally {
      isLoading.value = false
    }
  }
}

function formatDate(dateString: string) {
  if (!dateString) return 'N/A'
  try {
    return new Date(dateString).toLocaleString()
  } catch (e) {
    return dateString
  }
}

onMounted(() => {
  fetchMemories()
})
</script>

<style scoped>
.whitespace-pre-wrap {
  white-space: pre-wrap;
}
</style>
