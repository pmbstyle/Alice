<template>
  <div class="assistant-manager p-1">
    <button
      @click="$emit('backToMainSettings')"
      class="btn btn-sm btn-outline mb-6"
    >
      ← Back to Application Settings
    </button>

    <div v-if="isLoadingAssistants" class="text-center p-4">
      <span class="loading loading-lg loading-spinner text-primary"></span>
      <p>Loading assistants...</p>
    </div>

    <div
      v-if="!isLoadingAssistants && assistantsList.length === 0 && !showForm"
      class="text-center p-4 rounded-lg bg-base-200"
    >
      <p class="mb-2">No assistants found for your OpenAI account.</p>
      <button @click="handleCreateNew" class="btn btn-primary btn-sm">
        Create Your First Assistant
      </button>
    </div>

    <div
      v-if="!isLoadingAssistants && assistantsList.length > 0 && !showForm"
      class="space-y-3 mb-6"
    >
      <h3 class="text-xl font-semibold mb-3">Available Assistants</h3>
      <div
        v-for="assistant in assistantsList"
        :key="assistant.id"
        class="p-4 rounded-lg shadow bg-base-300/70 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
        :class="{
          'ring-2 ring-primary shadow-primary/50': isActiveAssistant(
            assistant.id
          ),
        }"
      >
        <div>
          <p class="font-semibold text-lg">
            {{ assistant.name || 'Unnamed Assistant' }}
          </p>
          <p class="text-xs text-gray-400">ID: {{ assistant.id }}</p>
          <p class="text-sm text-gray-300">Model: {{ assistant.model }}</p>
        </div>
        <div class="flex flex-wrap gap-2 mt-2 sm:mt-0 shrink-0">
          <button
            @click="
              handleSelect(assistant.id, assistant.name || 'Unnamed Assistant')
            "
            class="btn btn-sm btn-primary"
            :disabled="isSavingSelection"
          >
            {{ isActiveAssistant(assistant.id) ? 'Selected' : 'Select' }}
          </button>
          <button
            @click="handleEdit(assistant)"
            class="btn btn-sm btn-secondary"
          >
            Edit
          </button>
          <button
            @click="
              handleDelete(assistant.id, assistant.name || 'Unnamed Assistant')
            "
            class="btn btn-sm btn-error btn-outline"
            :disabled="isDeleting"
          >
            Delete
          </button>
        </div>
      </div>
      <button
        @click="handleCreateNew"
        class="btn btn-primary mt-4 w-full sm:w-auto"
      >
        Create New Assistant
      </button>
    </div>

    <div
      v-if="showForm"
      class="p-4 border border-neutral-focus rounded-lg bg-base-200 shadow-xl"
    >
      <h3 class="text-xl font-semibold mb-6">
        {{ isEditing ? 'Edit Assistant' : 'Create New Assistant' }}
      </h3>
      <form @submit.prevent="saveAssistantForm" class="space-y-6">
        <div>
          <label for="assistant-name" class="block mb-1 text-sm font-medium"
            >Name</label
          >
          <input
            id="assistant-name"
            type="text"
            v-model="currentAssistantForm.name"
            class="input input-bordered w-full focus:input-primary"
            placeholder="e.g., My Helpful Assistant"
          />
        </div>

        <div>
          <label
            for="assistant-instructions"
            class="block mb-1 text-sm font-medium"
            >Instructions (System Prompt)</label
          >
          <textarea
            id="assistant-instructions"
            v-model="currentAssistantForm.instructions"
            rows="6"
            class="textarea textarea-bordered w-full focus:textarea-primary"
            placeholder="You are a helpful AI assistant..."
          ></textarea>
        </div>

        <div>
          <label for="assistant-model" class="block mb-1 text-sm font-medium"
            >Model</label
          >
          <select
            id="assistant-model"
            v-model="currentAssistantForm.model"
            class="select select-bordered w-full focus:select-primary"
            required
          >
            <option disabled value="">Select a model</option>
            <option v-if="isLoadingModels" value="">Loading models...</option>
            <option
              v-for="model in modelsList"
              :key="model.id"
              :value="model.id"
            >
              {{ model.id }}
            </option>
          </select>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              for="assistant-temperature"
              class="block mb-1 text-sm font-medium"
              >Temperature (0.0 - 2.0)</label
            >
            <input
              id="assistant-temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              v-model.number="currentAssistantForm.temperature"
              class="input input-bordered w-full focus:input-primary"
            />
          </div>
          <div>
            <label for="assistant-top-p" class="block mb-1 text-sm font-medium"
              >Top P (0.0 - 1.0)</label
            >
            <input
              id="assistant-top-p"
              type="number"
              step="0.1"
              min="0"
              max="1"
              v-model.number="currentAssistantForm.top_p"
              class="input input-bordered w-full focus:input-primary"
            />
          </div>
        </div>

        <div>
          <label class="block mb-2 text-sm font-medium">Tools</label>
          <div
            class="space-y-2 p-3 border border-neutral-content/20 rounded-md max-h-60 overflow-y-auto"
          >
            <div
              v-for="tool in predefinedTools"
              :key="tool.function.name"
              class="form-control"
            >
              <label
                class="label cursor-pointer py-1 justify-start gap-3"
                :class="{
                  'opacity-50 cursor-not-allowed': !isToolConfigured(
                    tool.function.name
                  ),
                }"
              >
                <input
                  type="checkbox"
                  :value="tool.function.name"
                  v-model="selectedPredefinedToolNames"
                  class="checkbox checkbox-primary checkbox-sm"
                  :disabled="!isToolConfigured(tool.function.name)"
                />
                <span
                  class="label-text"
                  :title="
                    !isToolConfigured(tool.function.name)
                      ? 'API key for this tool not configured in settings'
                      : tool.function.description
                  "
                >
                  {{ tool.function.name }}
                  <span
                    v-if="!isToolConfigured(tool.function.name)"
                    class="text-xs text-warning normal-case"
                  >
                    (Needs config)</span
                  >
                </span>
              </label>
            </div>
            <p v-if="!predefinedTools.length" class="text-xs text-gray-400">
              No predefined tools found.
            </p>
          </div>
        </div>

        <div v-if="formError" class="alert alert-error text-sm p-3">
          {{ formError }}
        </div>

        <div class="flex gap-3 pt-4">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="isSavingForm"
          >
            <span
              v-if="isSavingForm"
              class="loading loading-spinner loading-xs"
            ></span>
            {{ isEditing ? 'Save Changes' : 'Create Assistant' }}
          </button>
          <button type="button" @click="cancelForm" class="btn btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useSettingsStore, type AliceSettings } from '../stores/settingsStore'
import { useConversationStore } from '../stores/openAIStore'
import { useGeneralStore } from '../stores/generalStore'
import { PREDEFINED_OPENAI_TOOLS } from '../utils/assistantTools'
import defaultSystemPrompt from '../../docs/systemPrompt.md?raw'
import type {
  LocalAssistantCreateParams,
  LocalAssistantUpdateParams,
} from '../api/openAI/assistant'

const emit = defineEmits(['backToMainSettings'])

const settingsStore = useSettingsStore()
const openAIStore = useConversationStore()
const generalStore = useGeneralStore()

interface AssistantInList {
  id: string
  name: string | null
  model: string
}
interface ModelInList {
  id: string
}

const assistantsList = ref<AssistantInList[]>([])
const modelsList = ref<ModelInList[]>([])
const predefinedTools = ref(PREDEFINED_OPENAI_TOOLS)
const selectedPredefinedToolNames = ref<string[]>([])

const defaultFormState = () => ({
  name: '',
  instructions: '',
  model: '',
  temperature: 1.0,
  top_p: 1.0,
})

const currentAssistantForm = ref(defaultFormState())
const isEditing = ref(false)
const editingAssistantId = ref<string | null>(null)
const showForm = ref(false)

const isLoadingAssistants = ref(false)
const isLoadingModels = ref(false)
const isSavingForm = ref(false)
const isDeleting = ref(false)
const isSavingSelection = ref(false)
const formError = ref<string | null>(null)

const toolDependencies: Record<string, (keyof AliceSettings)[]> = {
  perform_web_search: ['VITE_TAVILY_API_KEY'],
  get_weather_forecast: ['VITE_OPENWEATHERMAP_API_KEY'],
  search_torrents: ['VITE_JACKETT_API_KEY', 'VITE_JACKETT_URL'],
  add_torrent_to_qb: ['VITE_QB_URL', 'VITE_QB_USERNAME', 'VITE_QB_PASSWORD'],
}

const defaultFormStateValues = () => ({
  name: 'Alice Assistant',
  instructions: defaultSystemPrompt,
  model: 'gpt-4.1-mini',
  temperature: 0.5,
  top_p: 1.0,
})

function isToolConfigured(toolName: string): boolean {
  const currentSettings = settingsStore.config
  const deps = toolDependencies[toolName]
  if (!deps) return true
  return deps.every(depKey => !!currentSettings[depKey]?.trim())
}

const operationalAssistantId = computed(
  () => settingsStore.config.VITE_OPENAI_ASSISTANT_ID
)

function isActiveAssistant(assistantId: string): boolean {
  return operationalAssistantId.value === assistantId
}

async function loadAssistants() {
  isLoadingAssistants.value = true
  formError.value = null
  try {
    const fetchedAssistants = await openAIStore.fetchAssistants()
    assistantsList.value = fetchedAssistants.map(a => ({
      id: a.id,
      name: a.name,
      model: a.model,
    }))
  } catch (error: any) {
    console.error('Failed to load assistants:', error)
    formError.value = `Failed to load assistants: ${error.message || 'Unknown error'}`
    generalStore.statusMessage = 'Error: Could not load assistants list.'
  } finally {
    isLoadingAssistants.value = false
  }
}

async function loadModels() {
  isLoadingModels.value = true
  try {
    if (openAIStore.availableModels.length === 0) {
      await openAIStore.fetchModels()
    }
    modelsList.value = openAIStore.availableModels.map(m => ({ id: m.id }))
  } catch (error: any) {
    console.error('Failed to load models:', error)
    generalStore.statusMessage = 'Error: Could not load AI models.'
  } finally {
    isLoadingModels.value = false
  }
}

function handleCreateNew() {
  isEditing.value = false
  editingAssistantId.value = null
  currentAssistantForm.value = defaultFormStateValues()
  selectedPredefinedToolNames.value = []
  formError.value = null
  showForm.value = true
}

async function handleEdit(assistant: AssistantInList) {
  isSavingForm.value = true
  formError.value = null
  try {
    const detailedAssistant = await openAIStore.fetchAssistantDetails(
      assistant.id
    )
    if (detailedAssistant) {
      currentAssistantForm.value = {
        name: detailedAssistant.name || '',
        instructions: detailedAssistant.instructions || '',
        model: detailedAssistant.model || '',
        temperature: detailedAssistant.temperature ?? 1.0,
        top_p: detailedAssistant.top_p ?? 1.0,
      }
      selectedPredefinedToolNames.value = detailedAssistant.tools
        .filter((tool: any) => tool.type === 'function' && tool.function?.name)
        .map((tool: any) => tool.function.name)

      isEditing.value = true
      editingAssistantId.value = assistant.id
      showForm.value = true
    } else {
      formError.value = `Could not load details for assistant: ${assistant.name || assistant.id}`
      generalStore.statusMessage = `Error: Failed to load details for ${assistant.name}.`
    }
  } catch (error: any) {
    formError.value = `Error loading assistant details: ${error.message || 'Unknown error'}`
  } finally {
    isSavingForm.value = false
  }
}

async function handleDelete(assistantId: string, assistantName: string) {
  if (
    !confirm(
      `Are you sure you want to delete assistant "${assistantName}"? This cannot be undone.`
    )
  ) {
    return
  }
  isDeleting.value = true
  formError.value = null
  try {
    const success = await openAIStore.deleteExistingAssistant(assistantId)
    if (success) {
      generalStore.statusMessage = `Assistant "${assistantName}" deleted.`
      await loadAssistants()
      if (
        settingsStore.isProduction &&
        settingsStore.settings.VITE_OPENAI_ASSISTANT_ID === ''
      ) {
        await settingsStore.saveSettingsToFile()
      }
      if (!settingsStore.config.VITE_OPENAI_ASSISTANT_ID) {
        openAIStore.isInitialized = false
        generalStore.statusMessage =
          'Active assistant deleted. Please select or create a new one.'
      } else if (
        openAIStore.assistant !== settingsStore.config.VITE_OPENAI_ASSISTANT_ID
      ) {
        await openAIStore.initialize()
      }
    } else {
      formError.value = `Failed to delete assistant "${assistantName}". Reason: ${generalStore.statusMessage}`
    }
  } catch (error: any) {
    formError.value = `Error deleting assistant: ${error.message || 'Unknown error'}`
  } finally {
    isDeleting.value = false
  }
}

async function handleSelect(assistantId: string, assistantName: string) {
  isSavingSelection.value = true
  formError.value = null
  generalStore.statusMessage = `Selecting assistant "${assistantName}"...`

  if (settingsStore.isProduction) {
    const success = await openAIStore.setActiveAssistant(assistantId)
    if (success) {
      const saveSuccess = await settingsStore.saveSettingsToFile()
      if (saveSuccess) {
        generalStore.statusMessage = `Assistant "${assistantName}" is now active.`
        settingsStore.successMessage = `Assistant "${assistantName}" is now active.`
      } else {
        generalStore.statusMessage = `Failed to save selection for "${assistantName}". ${settingsStore.error || ''}`
        formError.value = `Failed to save selection for "${assistantName}". ${settingsStore.error || ''}`
      }
    } else {
      generalStore.statusMessage = 'Assistant switch failed'
      formError.value = `Could not switch to assistant "${assistantName}". ${generalStore.statusMessage.replace('Error: ', '')}`
    }
  } else {
    // Development mode
    // Temporary override for chat in dev:
    await openAIStore.setActiveAssistant(assistantId)
    generalStore.statusMessage = `Assistant "${assistantName}" is now active.`

    openAIStore.assistant = assistantId
    await openAIStore.createNewThread()
    openAIStore.isInitialized = true
  }
  setTimeout(() => {
    if (settingsStore.successMessage?.startsWith('Dev:'))
      settingsStore.successMessage = null
  }, 4000)
  isSavingSelection.value = false
}

async function saveAssistantForm() {
  isSavingForm.value = true
  formError.value = null

  if (!currentAssistantForm.value.model) {
    formError.value = 'Please select a model for the assistant.'
    isSavingForm.value = false
    return
  }
  if (!currentAssistantForm.value.name?.trim()) {
    formError.value = 'Assistant name cannot be empty.'
    isSavingForm.value = false
    return
  }

  const toolsPayload: LocalAssistantCreateParams['tools'] =
    selectedPredefinedToolNames.value
      .map(toolName => {
        const foundTool = predefinedTools.value.find(
          t => t.function.name === toolName
        )
        if (foundTool && isToolConfigured(toolName)) {
          return { type: 'function', function: foundTool.function } as {
            type: 'function'
            function: any
          }
        }
        return null
      })
      .filter(t => t !== null) as { type: 'function'; function: any }[]

  const assistantData: LocalAssistantCreateParams | LocalAssistantUpdateParams =
    {
      name: currentAssistantForm.value.name,
      instructions: currentAssistantForm.value.instructions,
      model: currentAssistantForm.value.model,
      temperature: currentAssistantForm.value.temperature,
      top_p: currentAssistantForm.value.top_p,
      tools: toolsPayload,
    }

  try {
    let savedAssistant = null
    if (isEditing.value && editingAssistantId.value) {
      savedAssistant = await openAIStore.updateExistingAssistant(
        editingAssistantId.value,
        assistantData as LocalAssistantUpdateParams
      )
    } else {
      savedAssistant = await openAIStore.createNewAssistant(
        assistantData as LocalAssistantCreateParams
      )
    }

    if (savedAssistant) {
      generalStore.statusMessage = `Assistant "${savedAssistant.name}" ${isEditing.value ? 'updated' : 'created'} successfully.`
      showForm.value = false
      isEditing.value = false
      editingAssistantId.value = null
      await loadAssistants()
    } else {
      formError.value = `Failed to ${isEditing.value ? 'update' : 'create'} assistant. ${generalStore.statusMessage.replace('Error: ', '')}`
    }
  } catch (error: any) {
    console.error(
      `Failed to ${isEditing.value ? 'update' : 'create'} assistant:`,
      error
    )
    formError.value = `Error: ${error.message || 'Unknown error'}`
    generalStore.statusMessage = `Error: Could not save assistant.`
  } finally {
    isSavingForm.value = false
  }
}

function cancelForm() {
  showForm.value = false
  isEditing.value = false
  editingAssistantId.value = null
  formError.value = null
}

onMounted(async () => {
  if (settingsStore.coreOpenAISettingsValid) {
    await loadAssistants()
    await loadModels()
  } else {
    generalStore.statusMessage =
      'Cannot manage assistants: Core OpenAI settings are invalid or not yet tested.'
    formError.value =
      'Core OpenAI settings (API Key) must be valid to manage assistants. Please check Application Settings.'
  }
})

watch(
  () => settingsStore.coreOpenAISettingsValid,
  async isValid => {
    if (
      isValid &&
      assistantsList.value.length === 0 &&
      !isLoadingAssistants.value
    ) {
      generalStore.statusMessage =
        'Core OpenAI Settings Validated. Loading assistants...'
      formError.value = null
      await loadAssistants()
      if (modelsList.value.length === 0 && !isLoadingModels.value) {
        await loadModels()
      }
    } else if (!isValid) {
      assistantsList.value = []
      modelsList.value = []
      showForm.value = false
      formError.value =
        'Core OpenAI settings are invalid. Please check Application Settings.'
    }
  }
)
</script>

<style scoped>
.form-control .label-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 30px);
}
</style>
