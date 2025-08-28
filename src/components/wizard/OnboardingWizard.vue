<template>
  <div class="fixed inset-0 text-base-content flex items-center justify-center">
    <div
      class="w-full max-w-2xl h-full bg-base-200 border border-base-300 rounded-lg shadow-2xl flex flex-col"
    >
      <!-- Header -->
      <WizardHeader :title="currentStepTitle" @close="closeWizard" />

      <!-- Scrollable Content -->
      <div ref="scrollContainer" class="flex-1 overflow-y-auto p-6">
        <WelcomeStep v-if="step === 1" @next="step = 2" />
        <AIProviderStep
          v-else-if="step === 2"
          :form-data="formData"
          :test-result="testResult"
          :is-testing="isTesting"
          @test-openai="testOpenAIKey"
          @test-openrouter="testOpenRouterKey"
          @test-ollama="testOllamaConnection"
          @test-lmstudio="testLMStudioConnection"
          @reset-tests="resetTestResults"
        />
        <VoiceModelsStep
          v-else-if="step === 3"
          :form-data="formData"
          @toggle-local="toggleLocalModels"
        />
        <FinalSetupStep
          v-else-if="step === 4"
          :form-data="formData"
          :is-finishing="isFinishing"
          @finish="finishOnboarding"
        />
      </div>

      <!-- Footer -->
      <WizardFooter
        :step="step"
        :total-steps="4"
        :can-continue="canContinue"
        :is-finishing="isFinishing"
        @back="goBack"
        @next="goNext"
        @finish="finishOnboarding"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { useSettingsStore } from '../../stores/settingsStore'
import WizardHeader from './WizardHeader.vue'
import WizardFooter from './WizardFooter.vue'
import WelcomeStep from './steps/WelcomeStep.vue'
import AIProviderStep from './steps/AIProviderStep.vue'
import VoiceModelsStep from './steps/VoiceModelsStep.vue'
import FinalSetupStep from './steps/FinalSetupStep.vue'
import OpenAI from 'openai'

const step = ref(1)
const settingsStore = useSettingsStore()
const scrollContainer = ref<HTMLElement>()

const formData = reactive({
  VITE_OPENAI_API_KEY: '',
  VITE_OPENROUTER_API_KEY: '',
  aiProvider: 'openai' as 'openai' | 'openrouter' | 'ollama' | 'lm-studio',
  assistantModel: 'gpt-4o-mini' as string,
  summarizationModel: 'gpt-4o-mini' as string,
  sttProvider: 'openai' as 'openai' | 'groq' | 'local',
  ttsProvider: 'openai' as 'openai' | 'local',
  embeddingProvider: 'openai' as 'openai' | 'local',
  VITE_GROQ_API_KEY: '',
  ollamaBaseUrl: 'http://localhost:11434',
  lmStudioBaseUrl: 'http://localhost:1234',
  useLocalModels: false,
  availableModels: [] as string[],
})

const isTesting = reactive({
  openai: false,
  openrouter: false,
  ollama: false,
  lmStudio: false,
})

const testResult = reactive({
  openai: { success: false, error: '' },
  openrouter: { success: false, error: '' },
  ollama: { success: false, error: '' },
  lmStudio: { success: false, error: '' },
})

const isFinishing = ref(false)

const currentStepTitle = computed(() => {
  const titles = {
    1: 'Welcome to Alice',
    2: 'AI Provider Setup',
    3: 'Voice & Embedding Models',
    4: 'Final Configuration',
  }
  return titles[step.value as keyof typeof titles] || 'Setup'
})

const canContinue = computed(() => {
  switch (step.value) {
    case 1:
      return true
    case 2:
      return isCurrentProviderTested()
    case 3:
      if (formData.useLocalModels) return true
      if (
        (formData.aiProvider === 'ollama' ||
          formData.aiProvider === 'lm-studio' ||
          formData.aiProvider === 'openrouter') &&
        !formData.useLocalModels
      ) {
        return formData.VITE_OPENAI_API_KEY.trim() !== ''
      }
      if (formData.sttProvider === 'groq') {
        return formData.VITE_GROQ_API_KEY.trim() !== ''
      }
      return true
    case 4:
      return true
    default:
      return false
  }
})

watch(step, async () => {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0
  }
})

const toggleLocalModels = (useLocal: boolean) => {
  formData.useLocalModels = useLocal
  if (useLocal) {
    formData.sttProvider = 'local'
    formData.ttsProvider = 'local'
    formData.embeddingProvider = 'local'
  } else {
    formData.sttProvider = 'openai'
    formData.ttsProvider = 'openai'
    formData.embeddingProvider = 'openai'
  }
}

watch(
  () => formData.aiProvider,
  newProvider => {
    if (newProvider === 'openai' || newProvider === 'openrouter') {
      formData.assistantModel = 'gpt-4o-mini'
      formData.summarizationModel = 'gpt-4o-mini'
    }
  }
)

const fetchAvailableModels = async () => {
  try {
    let baseURL = ''
    if (formData.aiProvider === 'ollama') {
      baseURL = `${formData.ollamaBaseUrl}/v1`
    } else if (formData.aiProvider === 'lm-studio') {
      baseURL = `${formData.lmStudioBaseUrl}/v1`
    } else {
      return
    }

    const tempClient = new OpenAI({
      apiKey: formData.aiProvider,
      baseURL,
      dangerouslyAllowBrowser: true,
    })

    const models = await tempClient.models.list()
    formData.availableModels = models.data.map(model => model.id)

    if (formData.availableModels.length > 0) {
      formData.assistantModel = formData.availableModels[0]
      formData.summarizationModel = formData.availableModels[0]
    }
  } catch (error) {
    console.error('Failed to fetch models:', error)
    formData.availableModels = []
  }
}

const testOpenAIKey = async () => {
  if (!formData.VITE_OPENAI_API_KEY.trim()) {
    testResult.openai.error = 'API Key cannot be empty.'
    testResult.openai.success = false
    return
  }

  isTesting.openai = true
  testResult.openai.error = ''
  testResult.openai.success = false

  try {
    const tempClient = new OpenAI({
      apiKey: formData.VITE_OPENAI_API_KEY,
      dangerouslyAllowBrowser: true,
    })

    await tempClient.models.list({ limit: 1 })
    testResult.openai.success = true
  } catch (e: any) {
    testResult.openai.error = 'API Key is invalid or has no permissions.'
    if (e.message?.includes('401')) {
      testResult.openai.error = 'Invalid API key - please check your key.'
    } else if (e.message?.includes('429')) {
      testResult.openai.error = 'Rate limit exceeded - please try again later.'
    }
  } finally {
    isTesting.openai = false
  }
}

const testOpenRouterKey = async () => {
  if (!formData.VITE_OPENROUTER_API_KEY.trim()) {
    testResult.openrouter.error = 'API Key cannot be empty.'
    testResult.openrouter.success = false
    return
  }

  isTesting.openrouter = true
  testResult.openrouter.error = ''
  testResult.openrouter.success = false

  try {
    const tempClient = new OpenAI({
      apiKey: formData.VITE_OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      dangerouslyAllowBrowser: true,
    })

    await tempClient.models.list({ limit: 1 })
    testResult.openrouter.success = true
  } catch (e: any) {
    testResult.openrouter.error = 'API Key is invalid or has no permissions.'
    if (e.message?.includes('401')) {
      testResult.openrouter.error = 'Invalid API key - please check your key.'
    } else if (e.message?.includes('429')) {
      testResult.openrouter.error =
        'Rate limit exceeded - please try again later.'
    }
  } finally {
    isTesting.openrouter = false
  }
}

const testOllamaConnection = async () => {
  if (!formData.ollamaBaseUrl.trim()) {
    testResult.ollama.error = 'Ollama Base URL cannot be empty.'
    testResult.ollama.success = false
    return
  }

  isTesting.ollama = true
  testResult.ollama.error = ''
  testResult.ollama.success = false

  try {
    const tempClient = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${formData.ollamaBaseUrl}/v1`,
      dangerouslyAllowBrowser: true,
      timeout: 10 * 1000,
      maxRetries: 1,
    })

    await tempClient.models.list({ limit: 1 })
    testResult.ollama.success = true
    await fetchAvailableModels()
  } catch (e: any) {
    testResult.ollama.error =
      'Connection failed - check if Ollama is running and accessible.'
    if (e.message?.includes('NetworkError') || e.message?.includes('fetch')) {
      testResult.ollama.error =
        'Cannot reach Ollama server - is it running on this URL?'
    } else if (e.message?.includes('timeout')) {
      testResult.ollama.error =
        'Connection timeout - Ollama may be starting up.'
    }
  } finally {
    isTesting.ollama = false
  }
}

const testLMStudioConnection = async () => {
  if (!formData.lmStudioBaseUrl.trim()) {
    testResult.lmStudio.error = 'LM Studio Base URL cannot be empty.'
    testResult.lmStudio.success = false
    return
  }

  isTesting.lmStudio = true
  testResult.lmStudio.error = ''
  testResult.lmStudio.success = false

  try {
    const tempClient = new OpenAI({
      apiKey: 'lm-studio',
      baseURL: `${formData.lmStudioBaseUrl}/v1`,
      dangerouslyAllowBrowser: true,
      timeout: 10 * 1000,
      maxRetries: 1,
    })

    await tempClient.models.list({ limit: 1 })
    testResult.lmStudio.success = true
    await fetchAvailableModels()
  } catch (e: any) {
    testResult.lmStudio.error =
      'Connection failed - check if LM Studio server is running and accessible.'
    if (e.message?.includes('NetworkError') || e.message?.includes('fetch')) {
      testResult.lmStudio.error =
        'Cannot reach LM Studio server - is it running on this URL?'
    } else if (e.message?.includes('timeout')) {
      testResult.lmStudio.error =
        'Connection timeout - LM Studio may be starting up.'
    }
  } finally {
    isTesting.lmStudio = false
  }
}

const resetTestResults = () => {
  testResult.openai.success = false
  testResult.openai.error = ''
  testResult.openrouter.success = false
  testResult.openrouter.error = ''
  testResult.ollama.success = false
  testResult.ollama.error = ''
  testResult.lmStudio.success = false
  testResult.lmStudio.error = ''
}

const isCurrentProviderTested = () => {
  if (formData.aiProvider === 'openai') {
    return testResult.openai.success
  } else if (formData.aiProvider === 'openrouter') {
    return testResult.openrouter.success
  } else if (formData.aiProvider === 'ollama') {
    return (
      testResult.ollama.success &&
      formData.assistantModel &&
      formData.summarizationModel
    )
  } else if (formData.aiProvider === 'lm-studio') {
    return (
      testResult.lmStudio.success &&
      formData.assistantModel &&
      formData.summarizationModel
    )
  }
  return false
}

const goBack = () => {
  if (step.value > 1) {
    step.value--
  }
}

const goNext = () => {
  if (step.value < 4 && canContinue.value) {
    step.value++
  }
}

const finishOnboarding = async () => {
  isFinishing.value = true

  try {
    const success = await settingsStore.completeOnboarding(formData)
    if (!success) {
      alert('Failed to save settings. Please try again.')
    }
  } catch (error) {
    console.error('Onboarding completion error:', error)
    alert('An error occurred during setup. Please try again.')
  } finally {
    isFinishing.value = false
  }
}

const closeWizard = () => {
  ;(window as any).electron.closeApp()
}
</script>
