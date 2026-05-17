<template>
  <div
    data-theme="dark"
    class="fixed inset-0 bg-transparent text-base-content flex items-center justify-center"
  >
    <div
      class="w-full max-w-2xl h-full bg-gray-900 border border-gray-700 rounded-lg shadow-2xl flex flex-col"
    >
      <!-- Header -->
      <WizardHeader :title="currentStepTitle" @close="closeWizard" />

      <!-- Scrollable Content -->
      <div
        ref="scrollContainer"
        class="flex-1 overflow-y-auto overflow-x-hidden p-6"
      >
        <WelcomeStep v-if="step === 1" @next="step = 2" />
        <AIProviderStep
          v-else-if="step === 2"
          :form-data="formData"
          :test-result="testResult"
          :is-testing="isTesting"
          @test-openai="testOpenAIKey"
          @test-openrouter="testOpenRouterKey"
          @test-zai="testZAIKey"
          @test-minimax="testMiniMaxKey"
          @test-deepseek="testDeepSeekKey"
          @test-codex="testCodexAuth"
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
import {
  ref,
  reactive,
  computed,
  watch,
  nextTick,
  onMounted,
  onUnmounted,
} from 'vue'
import { useSettingsStore } from '../../stores/settingsStore'
import WizardHeader from './WizardHeader.vue'
import WizardFooter from './WizardFooter.vue'
import WelcomeStep from './steps/WelcomeStep.vue'
import AIProviderStep from './steps/AIProviderStep.vue'
import VoiceModelsStep from './steps/VoiceModelsStep.vue'
import FinalSetupStep from './steps/FinalSetupStep.vue'
import OpenAI from 'openai'
import {
  DEEPSEEK_OPENAI_BASE_URL,
  MINIMAX_OPENAI_BASE_URL,
  PROVIDER_CONFIGS,
  ZAI_CODING_BASE_URL,
  type AIProviderKey,
} from '../../services/llmProviders/providerCatalog'
import { listDeepSeekModelsForConfig } from '../../services/llmProviders/deepseek'
import { listCodexModels } from '../../services/llmProviders/codex'
import { listMiniMaxModelsForConfig } from '../../services/llmProviders/minimax'
import { listOpenAIModelsForConfig } from '../../services/llmProviders/openai'
import { listOpenRouterModelsForConfig } from '../../services/llmProviders/openrouter'
import { listZAIModelsForConfig } from '../../services/llmProviders/zai'

const step = ref(1)
const settingsStore = useSettingsStore()
const scrollContainer = ref<HTMLElement>()
const OPENAI_SUMMARIZATION_MODEL = 'gpt-4.1-nano'
const DEFAULT_MAIN_WINDOW_SIZE = {
  width: 500,
  height: 500,
}
const WIZARD_WINDOW_SIZE = {
  width: 720,
  height: 800,
}

const getDefaultModels = (provider: AIProviderKey) => {
  const assistantModel =
    PROVIDER_CONFIGS[provider]?.defaultModel ||
    PROVIDER_CONFIGS.openai.defaultModel
  const summarizationModel =
    provider === 'openai' || provider === 'openrouter'
      ? OPENAI_SUMMARIZATION_MODEL
      : assistantModel

  return {
    assistantModel,
    summarizationModel,
  }
}

const openaiDefaults = getDefaultModels('openai')

const formData = reactive({
  VITE_OPENAI_API_KEY: '',
  VITE_OPENROUTER_API_KEY: '',
  VITE_ZAI_API_KEY: '',
  VITE_MINIMAX_API_KEY: '',
  VITE_DEEPSEEK_API_KEY: '',
  codexAuthConnected: false,
  codexAccountLabel: '',
  aiProvider: 'openai' as AIProviderKey,
  assistantModel: openaiDefaults.assistantModel as string,
  summarizationModel: openaiDefaults.summarizationModel as string,
  sttProvider: 'openai' as 'openai' | 'groq' | 'google' | 'local',
  ttsProvider: 'openai' as 'openai' | 'google' | 'local',
  embeddingProvider: 'openai' as 'openai' | 'local',
  VITE_GROQ_API_KEY: '',
  VITE_GOOGLE_API_KEY: '',
  ollamaBaseUrl: 'http://localhost:11434',
  lmStudioBaseUrl: 'http://localhost:1234',
  zaiBaseUrl: ZAI_CODING_BASE_URL,
  minimaxBaseUrl: MINIMAX_OPENAI_BASE_URL,
  deepseekBaseUrl: DEEPSEEK_OPENAI_BASE_URL,
  useLocalModels: false,
  availableModels: [] as string[],
  localSttLanguage: 'auto',
})

const isTesting = reactive({
  openai: false,
  openrouter: false,
  zai: false,
  minimax: false,
  deepseek: false,
  codex: false,
  ollama: false,
  lmStudio: false,
})

const testResult = reactive({
  openai: { success: false, error: '' },
  openrouter: { success: false, error: '' },
  zai: { success: false, error: '' },
  minimax: { success: false, error: '' },
  deepseek: { success: false, error: '' },
  codex: { success: false, error: '' },
  ollama: { success: false, error: '' },
  lmStudio: { success: false, error: '' },
})

const isFinishing = ref(false)

const currentStepTitle = computed(() => {
  const titles = {
    1: 'Welcome to Alice',
    2: 'AI Provider Setup',
    3: 'Voice & Memory Mode',
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

      // Check OpenAI Key requirement for non-OpenAI providers (for voice features)
      if (
        (formData.aiProvider === 'ollama' ||
          formData.aiProvider === 'lm-studio' ||
          formData.aiProvider === 'openrouter' ||
          formData.aiProvider === 'zai' ||
          formData.aiProvider === 'minimax' ||
          formData.aiProvider === 'deepseek' ||
          formData.aiProvider === 'codex') &&
        !formData.VITE_OPENAI_API_KEY.trim()
      ) {
        return false
      }

      // Check specific STT provider requirements
      if (
        formData.sttProvider === 'groq' &&
        !formData.VITE_GROQ_API_KEY.trim()
      ) {
        return false
      }
      if (
        formData.sttProvider === 'google' &&
        !formData.VITE_GOOGLE_API_KEY.trim()
      ) {
        return false
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

onMounted(() => {
  window.electron?.resize?.(WIZARD_WINDOW_SIZE)
  window.ipcRenderer?.on?.('codex-auth-status-changed', handleCodexStatus)
  window.ipcRenderer?.on?.('codex-auth-login-completed', handleCodexLogin)
})

onUnmounted(() => {
  window.ipcRenderer?.off?.('codex-auth-status-changed', handleCodexStatus)
  window.ipcRenderer?.off?.('codex-auth-login-completed', handleCodexLogin)
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
    const defaults = getDefaultModels(newProvider)
    formData.assistantModel = defaults.assistantModel
    formData.summarizationModel = defaults.summarizationModel
  }
)

const fetchAvailableModels = async () => {
  try {
    let baseURL = ''
    if (formData.aiProvider === 'ollama') {
      baseURL = `${formData.ollamaBaseUrl}/v1`
    } else if (formData.aiProvider === 'lm-studio') {
      baseURL = `${formData.lmStudioBaseUrl}/v1`
    } else if (formData.aiProvider === 'zai') {
      baseURL = formData.zaiBaseUrl
    } else if (formData.aiProvider === 'minimax') {
      baseURL = formData.minimaxBaseUrl
    } else if (formData.aiProvider === 'deepseek') {
      baseURL = formData.deepseekBaseUrl
    } else if (formData.aiProvider === 'codex') {
      const models = await listCodexModels()
      formData.availableModels = models.map(model => model.id)

      if (formData.availableModels.length > 0) {
        formData.assistantModel = formData.availableModels[0]
        formData.summarizationModel = formData.availableModels[0]
      }
      return
    } else {
      return
    }

    if (formData.aiProvider === 'minimax') {
      const models = await listMiniMaxModelsForConfig(
        formData.VITE_MINIMAX_API_KEY,
        baseURL
      )
      formData.availableModels = models.map(model => model.id)

      if (formData.availableModels.length > 0) {
        formData.assistantModel = formData.availableModels[0]
        formData.summarizationModel = formData.availableModels[0]
      }
      return
    }

    if (formData.aiProvider === 'deepseek') {
      const models = await listDeepSeekModelsForConfig(
        formData.VITE_DEEPSEEK_API_KEY,
        baseURL
      )
      formData.availableModels = models.map(model => model.id)

      if (formData.availableModels.length > 0) {
        formData.assistantModel = formData.availableModels[0]
        formData.summarizationModel = formData.availableModels[0]
      }
      return
    }

    if (formData.aiProvider === 'zai') {
      const models = await listZAIModelsForConfig(
        formData.VITE_ZAI_API_KEY,
        baseURL
      )
      formData.availableModels = models.map(model => model.id)

      if (formData.availableModels.length > 0) {
        formData.assistantModel = formData.availableModels[0]
        formData.summarizationModel = formData.availableModels[0]
      }
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
    throw error
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
    await listOpenAIModelsForConfig(formData.VITE_OPENAI_API_KEY)
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
    await listOpenRouterModelsForConfig(formData.VITE_OPENROUTER_API_KEY)
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

const testZAIKey = async () => {
  if (!formData.VITE_ZAI_API_KEY.trim()) {
    testResult.zai.error = 'API Key cannot be empty.'
    testResult.zai.success = false
    return
  }
  if (!formData.zaiBaseUrl.trim()) {
    testResult.zai.error = 'Base URL cannot be empty.'
    testResult.zai.success = false
    return
  }

  isTesting.zai = true
  testResult.zai.error = ''
  testResult.zai.success = false

  try {
    await fetchAvailableModels()
    testResult.zai.success = true
  } catch (e: any) {
    testResult.zai.error =
      'API key or Coding Plan endpoint is invalid or has no permissions.'
    if (e.message?.includes('401')) {
      testResult.zai.error = 'Invalid API key - please check your key.'
    } else if (e.message?.includes('429')) {
      testResult.zai.error = 'Rate limit exceeded - please try again later.'
    }
  } finally {
    isTesting.zai = false
  }
}

const testMiniMaxKey = async () => {
  if (!formData.VITE_MINIMAX_API_KEY.trim()) {
    testResult.minimax.error = 'API Key cannot be empty.'
    testResult.minimax.success = false
    return
  }
  if (!formData.minimaxBaseUrl.trim()) {
    testResult.minimax.error = 'Base URL cannot be empty.'
    testResult.minimax.success = false
    return
  }

  isTesting.minimax = true
  testResult.minimax.error = ''
  testResult.minimax.success = false

  try {
    await fetchAvailableModels()
    testResult.minimax.success = true
  } catch (e: any) {
    testResult.minimax.error =
      'API key or OpenAI-compatible endpoint is invalid or has no permissions.'
    if (e.message?.includes('401')) {
      testResult.minimax.error = 'Invalid API key - please check your key.'
    } else if (e.message?.includes('429')) {
      testResult.minimax.error = 'Rate limit exceeded - please try again later.'
    }
  } finally {
    isTesting.minimax = false
  }
}

const testDeepSeekKey = async () => {
  if (!formData.VITE_DEEPSEEK_API_KEY.trim()) {
    testResult.deepseek.error = 'API Key cannot be empty.'
    testResult.deepseek.success = false
    return
  }
  if (!formData.deepseekBaseUrl.trim()) {
    testResult.deepseek.error = 'Base URL cannot be empty.'
    testResult.deepseek.success = false
    return
  }

  isTesting.deepseek = true
  testResult.deepseek.error = ''
  testResult.deepseek.success = false

  try {
    await fetchAvailableModels()
    testResult.deepseek.success = true
  } catch (e: any) {
    testResult.deepseek.error =
      'API key or OpenAI-compatible endpoint is invalid or has no permissions.'
    if (e.message?.includes('401')) {
      testResult.deepseek.error = 'Invalid API key - please check your key.'
    } else if (e.message?.includes('429')) {
      testResult.deepseek.error =
        'Rate limit exceeded - please try again later.'
    }
  } finally {
    isTesting.deepseek = false
  }
}

const syncCodexStatus = async () => {
  const status = await window.ipcRenderer.invoke('codex-auth:status')
  const connected = Boolean(status?.connected)
  formData.codexAuthConnected = connected
  formData.codexAccountLabel = connected ? status.accountLabel || 'Connected' : ''
  testResult.codex.success = connected
  testResult.codex.error = connected
    ? ''
    : status?.error || 'ChatGPT Codex is not connected.'

  if (connected) {
    await fetchAvailableModels()
  }

  return connected
}

const testCodexAuth = async () => {
  isTesting.codex = true
  testResult.codex.error = ''
  testResult.codex.success = false

  try {
    if (await syncCodexStatus()) {
      return
    }

    const result = await window.ipcRenderer.invoke('codex-auth:start-login')
    if (!result?.success) {
      testResult.codex.error =
        result?.error || 'Failed to start ChatGPT Codex authorization.'
      return
    }

    testResult.codex.error =
      'Browser authorization opened. Finish it, then return to Alice.'
  } catch (e: any) {
    testResult.codex.error =
      'ChatGPT Codex authorization failed: ' + (e.message || String(e))
  } finally {
    isTesting.codex = false
  }
}

function handleCodexStatus(event: any, status: any) {
  const connected = Boolean(status?.connected)
  formData.codexAuthConnected = connected
  formData.codexAccountLabel = connected ? status.accountLabel || 'Connected' : ''
  testResult.codex.success = connected
  testResult.codex.error = connected
    ? ''
    : status?.error || 'ChatGPT Codex is not connected.'
  if (connected && formData.aiProvider === 'codex') {
    void fetchAvailableModels()
  }
}

function handleCodexLogin(event: any, payload: any) {
  if (payload?.success === false) {
    testResult.codex.success = false
    testResult.codex.error =
      payload?.error || 'ChatGPT Codex authorization failed.'
    return
  }
  void syncCodexStatus()
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

    await tempClient.models.list()
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

    await tempClient.models.list()
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
  testResult.zai.success = false
  testResult.zai.error = ''
  testResult.minimax.success = false
  testResult.minimax.error = ''
  testResult.deepseek.success = false
  testResult.deepseek.error = ''
  testResult.codex.success = false
  testResult.codex.error = ''
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
  } else if (formData.aiProvider === 'zai') {
    return (
      testResult.zai.success &&
      Boolean(formData.assistantModel) &&
      Boolean(formData.summarizationModel)
    )
  } else if (formData.aiProvider === 'minimax') {
    return (
      testResult.minimax.success &&
      Boolean(formData.assistantModel) &&
      Boolean(formData.summarizationModel)
    )
  } else if (formData.aiProvider === 'deepseek') {
    return (
      testResult.deepseek.success &&
      Boolean(formData.assistantModel) &&
      Boolean(formData.summarizationModel)
    )
  } else if (formData.aiProvider === 'codex') {
    return (
      testResult.codex.success &&
      formData.codexAuthConnected &&
      Boolean(formData.assistantModel) &&
      Boolean(formData.summarizationModel)
    )
  } else if (formData.aiProvider === 'ollama') {
    return (
      testResult.ollama.success &&
      Boolean(formData.assistantModel) &&
      Boolean(formData.summarizationModel)
    )
  } else if (formData.aiProvider === 'lm-studio') {
    return (
      testResult.lmStudio.success &&
      Boolean(formData.assistantModel) &&
      Boolean(formData.summarizationModel)
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
      return
    }
    window.electron?.resize?.(DEFAULT_MAIN_WINDOW_SIZE)
  } catch (error) {
    console.error('Onboarding completion error:', error)
    alert('An error occurred during setup. Please try again.')
  } finally {
    isFinishing.value = false
  }
}

const closeWizard = () => {
  try {
    if (typeof window.electron?.closeApp === 'function') {
      window.electron.closeApp()
      return
    }

    window.ipcRenderer?.send?.('close-app')
  } catch (error) {
    console.error('Failed to close onboarding wizard:', error)
  }
}
</script>
