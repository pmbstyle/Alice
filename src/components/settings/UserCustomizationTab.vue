<template>
  <div class="space-y-6">
    <h3 class="text-xl font-semibold mb-4 text-green-400">
      User Customization
    </h3>
    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Assistant Avatar</legend>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex gap-4">
          <div
            class="avatar-ring w-[180px] h-[180px] ring-2 ring-blue-400 flex items-center justify-center rounded-full from-slate-900 to-slate-800 flex-shrink-0"
          >
            <video
              ref="avatarPreviewVideo"
              class="rounded-full w-[180px] h-[180px] object-cover"
              :src="previewVideoSource"
              loop
              muted
              autoplay
              playsinline
            ></video>
          </div>
          <div class="space-y-2 text-sm text-gray-300">
            <p>
              Drop folders inside
              <code class="text-xs bg-gray-800 px-1 py-0.5 rounded">{{
                customizationPathDisplay
              }}</code>
              with three MP4 files:
              <code>speaking.mp4</code>,
              <code>thinking.mp4</code>, and
              <code>standby.mp4</code>.
            </p>
            <p class="text-xs text-gray-400">
              Folder name becomes the avatar name. Standby video renders inside the app and this preview.
            </p>
            <div class="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                class="btn btn-sm btn-outline"
                :disabled="customAvatarsStore.isRefreshing"
                @click="handleAvatarRefresh"
              >
                <span
                  v-if="customAvatarsStore.isRefreshing"
                  class="loading loading-spinner loading-xs mr-2"
                ></span>
                Refresh
              </button>
              <span class="text-xs text-gray-500">
                {{ customAvatarsStore.customAvatarCount }} custom avatars detected
              </span>
            </div>
          </div>
        </div>
        <div class="text-sm text-gray-200">
          Currently selected:
          <span class="font-semibold text-white">{{ selectedAvatar.name }}</span>
        </div>
      </div>
      <div class="mt-4 space-y-3">
        <div
          v-if="customAvatarsStore.isLoading"
          class="flex items-center gap-2 text-sm text-gray-300"
        >
          <span class="loading loading-spinner loading-sm"></span>
          Loading avatars...
        </div>
        <div
          v-else
          class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <label
            v-for="avatar in customAvatarsStore.allAvatars"
            :key="avatar.id"
            class="p-3 rounded-lg border cursor-pointer transition-all bg-gray-900/70"
            :class="{
              'border-blue-400 ring-2 ring-blue-400':
                selectedAvatarId === avatar.id,
              'border-gray-700 hover:border-gray-500': selectedAvatarId !== avatar.id,
            }"
          >
            <input
              class="hidden"
              type="radio"
              name="assistant-avatar"
              :value="avatar.id"
              :checked="selectedAvatarId === avatar.id"
              @change="() => handleAvatarSelect(avatar.id)"
            />
            <div class="flex flex-col gap-1">
              <span class="font-semibold text-white">{{ avatar.name }}</span>
              <span class="text-xs text-gray-400">
                {{ avatar.source === 'builtin' ? 'Built-in' : avatar.folderName }}
              </span>
            </div>
          </label>
        </div>
        <div
          v-if="customAvatarsStore.error"
          class="alert alert-error text-sm mt-2"
        >
          {{ customAvatarsStore.error }}
        </div>
        <p
          v-else-if="!customAvatarsStore.customAvatarCount"
          class="text-xs text-gray-400"
        >
          No custom avatars yet. Create a folder under
          <code>{{ customizationPathDisplay }}</code>
          and add the required videos to see it here.
        </p>
      </div>
    </fieldset>

    <fieldset
      class="fieldset bg-gray-900/90 border-green-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Custom Tools</legend>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-sm text-gray-300 max-w-2xl">
            Drop your own tool definitions and scripts into Alice. Tools are stored in
            <code class="text-xs bg-gray-800 px-1 py-0.5 rounded">{{ store.filePath || 'user-customization/custom-tools.json' }}</code>.
            Each entry can be edited here, refreshed from disk, or managed manually if you prefer.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-sm btn-outline"
            :disabled="store.isRefreshing"
            @click="handleRefresh"
          >
            <span
              v-if="store.isRefreshing"
              class="loading loading-spinner loading-xs mr-2"
            ></span>
            Refresh
          </button>
          <label class="btn btn-sm btn-outline btn-secondary cursor-pointer">
            <input
              ref="scriptInput"
              type="file"
              accept=".js,.mjs,.cjs"
              class="hidden"
              @change="handleScriptUpload"
            />
            Upload Script
          </label>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            @click="openToolModal()"
          >
            Add Tool
          </button>
        </div>
      </div>
      <div v-if="store.diagnostics.length" class="alert alert-warning mt-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <h4 class="font-semibold">JSON warnings</h4>
          <ul class="list-disc pl-5 text-sm">
            <li v-for="issue in store.diagnostics" :key="issue">{{ issue }}</li>
          </ul>
        </div>
      </div>
      <div v-if="store.error" class="alert alert-error mt-4">
        <span>{{ store.error }}</span>
      </div>

    <section class="space-y-3 mt-4">
      <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-100">Available custom Tools</h3>
          <p class="text-sm text-gray-400">
            Toggle availability, inspect validation errors, or edit each definition individually.
          </p>
        </div>
        <span class="text-xs text-gray-500">
          {{ store.tools.length }} defined / {{ store.enabledAndValidTools.length }} ready
        </span>
      </header>

      <div v-if="store.isLoading" class="flex items-center gap-2 text-sm text-gray-300">
        <span class="loading loading-spinner loading-sm"></span>
        Loading tools...
      </div>

      <div
        v-else-if="!store.tools.length"
        class="text-sm text-gray-400 border border-dashed border-gray-600 rounded-lg p-6"
      >
        No custom tools yet. Upload a script and click "Add Tool" to register it.
      </div>

      <div v-else class="space-y-4">
        <article
          v-for="tool in store.tools"
          :key="tool.id"
          class="border border-gray-800 rounded-lg p-4 bg-gray-900/70"
        >
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div class="flex items-center gap-2">
                <h5 class="text-lg font-semibold text-white">{{ tool.name }}</h5>
                <span
                  class="badge"
                  :class="tool.isValid ? 'badge-success' : 'badge-error'"
                >
                  {{ tool.isValid ? 'Valid' : 'Needs attention' }}
                </span>
                <span
                  class="badge badge-outline"
                  :class="tool.enabled ? 'badge-success' : 'badge-ghost'"
                >
                  {{ tool.enabled ? 'Enabled' : 'Disabled' }}
                </span>
              </div>
              <p class="text-sm text-gray-300 mt-1">{{ tool.description }}</p>
              <p class="text-xs text-gray-500 mt-2">
                Entry: <code>{{ tool.handler.entry || 'not set' }}</code>
              </p>
              <p class="text-xs text-gray-500">
                Runtime: {{ tool.handler.runtime || 'node' }}
              </p>
              <ul
                v-if="tool.errors.length"
                class="mt-2 text-xs text-red-300 list-disc pl-5"
              >
                <li v-for="error in tool.errors" :key="error">{{ error }}</li>
              </ul>
            </div>
            <div class="flex flex-col gap-2 items-start md:items-end">
              <label class="label cursor-pointer gap-2">
                <span class="label-text text-sm text-gray-300">Enabled</span>
                <input
                  type="checkbox"
                  class="toggle toggle-success"
                  :disabled="!tool.isValid"
                  :checked="tool.enabled"
                  @change="() => handleToggle(tool)"
                />
              </label>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="btn btn-xs"
                  @click="openToolModal(tool)">
                  Edit
                </button>
                <button
                  type="button"
                  class="btn btn-xs btn-ghost"
                  @click="() => confirmDelete(tool)"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="border border-gray-800 rounded-lg mt-4">
      <header
        class="flex items-center justify-between p-4 cursor-pointer bg-gray-900/70"
        @click="showAdvanced = !showAdvanced"
      >
        <div>
          <h4 class="text-lg font-semibold text-gray-100">Advanced JSON Editor</h4>
          <p class="text-xs text-gray-500">
            Edit <code>custom-tools.json</code> directly. Validate JSON before saving.
          </p>
        </div>
        <span class="text-sm text-gray-400">
          {{ showAdvanced ? 'Hide' : 'Show' }}
        </span>
      </header>
      <div v-if="showAdvanced" class="p-4 space-y-3">
        <textarea
          v-model="jsonEditorValue"
          class="textarea textarea-bordered w-full h-64 font-mono text-xs"
        ></textarea>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-sm"
            @click="resetJsonEditor"
          >
            Reset from disk
          </button>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="isSavingJson"
            @click="saveJsonEditor"
          >
            <span
              v-if="isSavingJson"
              class="loading loading-spinner loading-xs mr-2"
            ></span>
            Save JSON
          </button>
          <span v-if="jsonError" class="text-xs text-red-400">{{ jsonError }}</span>
        </div>
      </div>
    </section>
  </fieldset>

    <dialog ref="toolModal" class="modal">
      <div class="modal-box w-11/12 max-w-3xl">
        <h3 class="font-bold text-lg mb-4">
          {{ editingTool ? 'Edit custom tool' : 'Add custom tool' }}
        </h3>
        <form class="space-y-5" @submit.prevent="saveTool">
          <div class="grid md:grid-cols-2 gap-4">
            <label class="form-control gap-2">
              <span class="label-text font-semibold text-xs uppercase tracking-wide"
                >Function name *</span
              >
              <input
                v-model="toolForm.name"
                type="text"
                required
                class="input input-bordered"
                placeholder="my_custom_tool"
              />
            </label>
            <label class="form-control gap-2">
              <span class="label-text font-semibold text-xs uppercase tracking-wide"
                >Display description *</span
              >
              <input
                v-model="toolForm.description"
                type="text"
                required
                class="input input-bordered"
                placeholder="What this tool does"
              />
            </label>
          </div>
          <label class="form-control gap-2">
            <span class="label-text font-semibold text-xs uppercase tracking-wide"
              >Script entry path *</span
            >
            <input
              v-model="toolForm.entry"
              type="text"
              required
              class="input input-bordered"
              placeholder="custom-tool-scripts/weather.js"
            />
            <span class="label-text-alt text-xs text-gray-400"
              >Paths are relative to <code>{{ customizationRoot }}</code></span
            >
          </label>
          <label class="form-control gap-2">
            <span class="label-text font-semibold text-xs uppercase tracking-wide"
              >JSON schema (parameters)</span
            >
            <textarea
              v-model="toolForm.parameters"
              class="textarea textarea-bordered font-mono text-xs h-44 leading-5"
            ></textarea>
            <span class="label-text-alt text-xs text-gray-400"
              >Provide a valid JSON schema describing tool arguments.</span
            >
          </label>
          <div class="grid md:grid-cols-2 gap-4">
            <label class="form-control gap-2">
              <span class="label-text font-semibold text-xs uppercase tracking-wide"
                >Strict validation</span
              >
              <select v-model="toolForm.strict" class="select select-bordered">
                <option :value="false">Flexible</option>
                <option :value="true">Strict</option>
              </select>
            </label>
            <label
              class="label cursor-pointer gap-3 border border-white/10 rounded-lg px-4 py-3 bg-base-200/40"
            >
              <div class="flex flex-col">
                <span class="label-text font-semibold text-sm">Enable immediately</span>
                <span class="label-text-alt text-xs text-gray-400"
                  >Enabled tools appear in the assistant panel.</span
                >
              </div>
              <input type="checkbox" v-model="toolForm.enabled" class="toggle" />
            </label>
          </div>
          <div class="modal-action">
            <button type="button" class="btn" @click="closeToolModal">Cancel</button>
            <button type="submit" class="btn btn-primary">Save tool</button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useCustomToolsStore } from '../../stores/customToolsStore'
import { useCustomAvatarsStore } from '../../stores/customAvatarsStore'
import type { AliceSettings } from '../../stores/settingsStore'

const props = defineProps<{
  currentSettings: AliceSettings
}>()

const emit = defineEmits<{
  'update:setting': [
    key: keyof AliceSettings,
    value: string | boolean | number | string[],
  ]
}>()

const store = useCustomToolsStore()
const customAvatarsStore = useCustomAvatarsStore()
const { tools } = storeToRefs(store)

const showAdvanced = ref(false)
const jsonEditorValue = ref('[]')
const jsonError = ref<string | null>(null)
const isSavingJson = ref(false)
const lastUploadedPath = ref<string | null>(null)

const toolModal = ref<HTMLDialogElement | null>(null)
const scriptInput = ref<HTMLInputElement | null>(null)
const editingTool = ref<any>(null)
const toolForm = ref({
  id: '',
  name: '',
  description: '',
  entry: '',
  enabled: true,
  strict: false,
  parameters: JSON.stringify(
    {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    null,
    2
  ),
})

const customizationRoot = computed(() => {
  const pathParts = store.filePath.split('custom-tools.json')
  return pathParts.length > 1 ? pathParts[0] : 'user-customization/'
})

const avatarPreviewVideo = ref<HTMLVideoElement | null>(null)
const selectedAvatarId = computed(
  () => props.currentSettings.assistantAvatar || customAvatarsStore.builtInAvatar.id
)
const selectedAvatar = computed(
  () =>
    customAvatarsStore.allAvatars.find(avatar => avatar.id === selectedAvatarId.value) ||
    customAvatarsStore.builtInAvatar
)
const previewVideoSource = computed(() => selectedAvatar.value.stateVideos.standby)
const customizationPathDisplay = computed(
  () => customAvatarsStore.customizationRoot || 'user-customization/custom-avatars'
)

watch(previewVideoSource, async () => {
  await nextTick()
  if (avatarPreviewVideo.value) {
    avatarPreviewVideo.value.load()
    avatarPreviewVideo.value
      .play()
      .catch(() => {
        /* Ignore autoplay issues inside settings */
      })
  }
})

function hydrateJsonEditor() {
  jsonEditorValue.value = JSON.stringify(tools.value, null, 2)
}

onMounted(async () => {
  await Promise.all([
    store.ensureInitialized(),
    customAvatarsStore.ensureInitialized(),
  ])
  hydrateJsonEditor()
  await nextTick()
  if (avatarPreviewVideo.value) {
    avatarPreviewVideo.value
      .play()
      .catch(() => {
        /* ignore */
      })
  }
})

watch(
  () => tools.value,
  () => {
    if (!isSavingJson.value) {
      hydrateJsonEditor()
    }
  },
  { deep: true }
)

function openToolModal(tool?: any) {
  editingTool.value = tool || null
  if (tool) {
    toolForm.value = {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      entry: tool.handler.entry,
      enabled: tool.enabled,
      strict: tool.strict ?? false,
      parameters: JSON.stringify(tool.parameters, null, 2),
    }
  } else {
    toolForm.value = {
      id: '',
      name: '',
      description: '',
      entry: lastUploadedPath.value || 'custom-tool-scripts/',
      enabled: true,
      strict: false,
      parameters: JSON.stringify(
        {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        null,
        2
      ),
    }
  }
  toolModal.value?.showModal()
}

function closeToolModal() {
  toolModal.value?.close()
}

async function handleRefresh() {
  await store.refresh()
}

async function handleToggle(tool: any) {
  await store.toggleTool(tool.id, !tool.enabled)
}

async function confirmDelete(tool: any) {
  if (confirm(`Delete custom tool ${tool.name}?`)) {
    await store.deleteTool(tool.id)
  }
}

async function handleScriptUpload(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files || !target.files.length) return
  const file = target.files[0]
  try {
    const uploadResult = await store.uploadScript(file)
    if (uploadResult) {
      lastUploadedPath.value = uploadResult.relativePath
      openToolModal({
        handler: { entry: uploadResult.relativePath },
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      })
    }
  } catch (error: any) {
    jsonError.value = error?.message || 'Failed to upload script.'
  } finally {
    target.value = ''
  }
}

async function saveTool() {
  try {
    const parameters = JSON.parse(toolForm.value.parameters || '{}')
    await store.upsertTool({
      id: toolForm.value.id || undefined,
      name: toolForm.value.name.trim(),
      description: toolForm.value.description.trim(),
      enabled: toolForm.value.enabled,
      strict: toolForm.value.strict,
      parameters,
      handler: {
        type: 'script',
        entry: toolForm.value.entry.trim(),
        runtime: 'node',
      },
    } as any)
    closeToolModal()
  } catch (error: any) {
    jsonError.value = error?.message || 'Failed to save tool.'
  }
}

function resetJsonEditor() {
  hydrateJsonEditor()
  jsonError.value = null
}

async function saveJsonEditor() {
  jsonError.value = null
  isSavingJson.value = true
  try {
    await store.replaceJson(jsonEditorValue.value)
  } catch (error: any) {
    jsonError.value = error?.message || 'Invalid JSON payload.'
  } finally {
    isSavingJson.value = false
  }
}

function handleAvatarSelect(id: string) {
  emit('update:setting', 'assistantAvatar', id)
}

async function handleAvatarRefresh() {
  try {
    await customAvatarsStore.refresh()
  } catch {
    // error surfaced via store.error
  }
}
</script>
