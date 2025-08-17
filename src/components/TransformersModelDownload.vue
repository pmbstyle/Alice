<template>
  <div class="space-y-4">
    <div v-if="!isDownloading && !modelReady">
      <label for="transformers-model" class="block mb-2 text-sm font-medium">
        Select Local STT Model *
      </label>
      <select
        id="transformers-model"
        v-model="selectedModel"
        class="select select-bordered w-full focus:select-primary"
        @change="onModelChange"
      >
        <option value="" disabled>Choose a model...</option>
        <option
          v-for="model in availableModels"
          :key="model.id"
          :value="model.id"
        >
          {{ model.name }} ({{ model.size }})
        </option>
      </select>
      <p class="text-xs text-gray-400 mt-1">
        {{ selectedModelDescription }}
      </p>
    </div>

    <div v-if="selectedModel && !isDownloading" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="transformers-device" class="block mb-1 text-sm">
            Processing Device
          </label>
          <select
            id="transformers-device"
            v-model="currentSettings.transformersDevice"
            class="select select-bordered w-full focus:select-primary"
            @change="
              e => emit('update:setting', 'transformersDevice', e.target.value)
            "
          >
            <option value="wasm">WASM (Default, Compatible)</option>
            <option value="webgpu">WebGPU (Faster, Requires Support)</option>
          </select>
        </div>
        <div>
          <label for="transformers-quantization" class="block mb-1 text-sm">
            Model Quantization
          </label>
          <select
            id="transformers-quantization"
            v-model="currentSettings.transformersQuantization"
            class="select select-bordered w-full focus:select-primary"
            @change="
              e =>
                emit(
                  'update:setting',
                  'transformersQuantization',
                  e.target.value
                )
            "
          >
            <option value="q8">Q8 (Recommended - Fast & Efficient)</option>
            <option value="q4">Q4 (Smallest Size)</option>
            <option value="fp16">FP16 (Higher Quality)</option>
            <option value="fp32">FP32 (Best Quality, Largest)</option>
          </select>
        </div>
      </div>

      <div class="form-control">
        <label class="label cursor-pointer">
          <span class="label-text">
            Enable OpenAI Fallback
            <span class="text-xs text-gray-400 block">
              If local transcription fails, automatically try OpenAI STT
            </span>
          </span>
          <input
            type="checkbox"
            class="checkbox checkbox-primary"
            :checked="currentSettings.transformersEnableFallback"
            @change="
              e =>
                emit(
                  'update:setting',
                  'transformersEnableFallback',
                  e.target.checked
                )
            "
          />
        </label>
      </div>

      <div class="form-control">
        <label class="label cursor-pointer">
          <span class="label-text">
            Enable Wake Word
            <span class="text-xs text-gray-400 block">
              Only process audio when wake word is detected (e.g., "Alice", "Hey Alice")
            </span>
          </span>
          <input
            type="checkbox"
            class="checkbox checkbox-primary"
            :checked="currentSettings.transformersWakeWordEnabled"
            @change="
              e =>
                emit(
                  'update:setting',
                  'transformersWakeWordEnabled',
                  e.target.checked
                )
            "
          />
        </label>
      </div>

      <div v-if="currentSettings.transformersWakeWordEnabled" class="form-control">
        <label for="wake-word" class="block mb-1 text-sm">
          Wake Word
        </label>
        <input
          id="wake-word"
          type="text"
          v-model="currentSettings.transformersWakeWord"
          class="input input-bordered w-full focus:input-primary"
          placeholder="Alice"
          @input="
            e => emit('update:setting', 'transformersWakeWord', e.target.value)
          "
        />
        <p class="text-xs text-gray-400 mt-1">
          Say this word (or "Hey [word]", "OK [word]") to activate voice commands
        </p>
      </div>
    </div>

    <div v-if="selectedModel && !isDownloading && !modelReady" class="mt-4">
      <button
        @click="downloadModel"
        class="btn btn-primary w-full"
        :disabled="!selectedModel"
      >
        <svg
          v-if="!selectedModel"
          class="w-4 h-4 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
          ></path>
        </svg>
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
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
          ></path>
        </svg>
        Download {{ selectedModelInfo?.name }}
      </button>
    </div>

    <div v-if="isDownloading" class="space-y-3">
      <div class="flex justify-between items-center">
        <span class="text-sm font-medium">{{ downloadProgress.message }}</span>
        <span class="text-sm text-gray-400"
          >{{ downloadProgress.progress }}%</span
        >
      </div>

      <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
        <div
          class="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
          :style="{ width: downloadProgress.progress + '%' }"
        ></div>
      </div>

      <div
        v-if="downloadProgress.total > 0"
        class="text-xs text-gray-400 text-center"
      >
        {{ formatBytes(downloadProgress.loaded) }} /
        {{ formatBytes(downloadProgress.total) }}
      </div>

      <button @click="cancelDownload" class="btn btn-outline btn-sm w-full">
        Cancel Download
      </button>
    </div>

    <div v-if="modelReady && !isDownloading" class="alert alert-success">
      <svg
        class="w-6 h-6 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        ></path>
      </svg>
      <div>
        <h3 class="font-bold">Model Ready!</h3>
        <div class="text-xs">
          {{ selectedModelInfo?.name }} is downloaded and ready for use.
        </div>
      </div>
      <button @click="changeModel" class="btn btn-sm btn-outline">
        Change Model
      </button>
    </div>

    <div v-if="errorMessage" class="alert alert-error">
      <svg
        class="w-6 h-6 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        ></path>
      </svg>
      <div>
        <h3 class="font-bold">Download Failed</h3>
        <div class="text-xs">{{ errorMessage }}</div>
      </div>
      <button @click="retryDownload" class="btn btn-sm btn-outline">
        Retry
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { AliceSettings } from '../stores/settingsStore'
import {
  AVAILABLE_TRANSFORMERS_MODELS,
  transformersSTTService,
  type TransformersModel,
  type ModelDownloadProgress,
} from '../services/transformersSTT'

const props = defineProps<{
  currentSettings: AliceSettings
}>()

const emit = defineEmits<{
  'update:setting': [key: keyof AliceSettings, value: string | boolean]
}>()

const selectedModel = ref('')
const isDownloading = ref(false)
const modelReady = ref(false)
const errorMessage = ref('')
const downloadProgress = ref<ModelDownloadProgress>({
  status: 'downloading',
  progress: 0,
  loaded: 0,
  total: 0,
  message: '',
})

const availableModels = computed(() => AVAILABLE_TRANSFORMERS_MODELS)

const selectedModelInfo = computed(() =>
  availableModels.value.find(m => m.id === selectedModel.value)
)

const selectedModelDescription = computed(() => {
  if (!selectedModelInfo.value) return 'Please select a model to continue.'
  return selectedModelInfo.value.description
})

watch(
  () => props.currentSettings.transformersModel,
  newModel => {
    if (newModel && availableModels.value.some(m => m.id === newModel)) {
      selectedModel.value = newModel
    }
    checkModelStatus()
  }
)

watch(selectedModel, newModel => {
  if (newModel !== props.currentSettings.transformersModel) {
    emit('update:setting', 'transformersModel', newModel)
  }
})

const onModelChange = () => {
  errorMessage.value = ''
  modelReady.value = false
  transformersSTTService.dispose()
}

const downloadModel = async () => {
  if (!selectedModel.value) return

  isDownloading.value = true
  errorMessage.value = ''

  try {
    const success = await transformersSTTService.initializeModel(
      selectedModel.value,
      props.currentSettings.transformersDevice,
      props.currentSettings.transformersQuantization,
      progress => {
        downloadProgress.value = progress

        if (progress.status === 'ready') {
          modelReady.value = true
          isDownloading.value = false
        } else if (progress.status === 'error') {
          errorMessage.value = progress.message
          isDownloading.value = false
        }
      }
    )

    if (!success) {
      errorMessage.value = 'Failed to initialize model'
      isDownloading.value = false
    }
  } catch (error: any) {
    errorMessage.value = error.message || 'Unknown error occurred'
    isDownloading.value = false
  }
}

const cancelDownload = () => {
  isDownloading.value = false
  downloadProgress.value = {
    status: 'downloading',
    progress: 0,
    loaded: 0,
    total: 0,
    message: '',
  }
}

const retryDownload = () => {
  errorMessage.value = ''
  downloadModel()
}

const changeModel = () => {
  modelReady.value = false
  transformersSTTService.dispose()
}

const checkModelStatus = () => {
  modelReady.value =
    transformersSTTService.isReady() &&
    transformersSTTService.getCurrentModel() === selectedModel.value
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(() => {
  const savedModel = props.currentSettings.transformersModel
  if (savedModel && availableModels.value.some(m => m.id === savedModel)) {
    selectedModel.value = savedModel
  } else if (availableModels.value.length > 0) {
    selectedModel.value = availableModels.value[0].id
    emit('update:setting', 'transformersModel', selectedModel.value)
  }
  checkModelStatus()
})
</script>
