<template>
  <div class="fixed inset-0 text-base-content flex items-center justify-center">
    <div
      class="w-full max-w-lg p-8 rounded-lg shadow-2xl bg-base-200 border border-base-300"
    >
      <div class="flex justify-between mb-4">
        <button class="dragable select-none">
          <svg fill="#fff" viewBox="0 0 32 32" class="w-8 h-8">
            <rect x="10" y="6" width="4" height="4" />
            <rect x="18" y="6" width="4" height="4" />
            <rect x="10" y="14" width="4" height="4" />
            <rect x="18" y="14" width="4" height="4" />
            <rect x="10" y="22" width="4" height="4" />
            <rect x="18" y="22" width="4" height="4" />
          </svg>
        </button>
        <button @click="closeWizard" class="btn btn-link btn-circle">
          <svg
            xmlns="http://www.svg.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="w-6 h-6"
          >
            <path
              stroke-linecap="round"
              d="M6 18L18 6M6 6l12 12"
              stroke="#fff"
            />
          </svg>
        </button>
      </div>

      <div v-if="step === 1">
        <div class="text-center mb-6">
          <h1 class="text-3xl font-bold mb-2">Welcome to Alice</h1>
          <p class="text-base-content/70">
            Let's get you set up in just a few steps.
          </p>
        </div>
        <button @click="step = 2" class="btn btn-primary btn-active w-full">
          Let's Start
        </button>
      </div>

      <div v-if="step === 2">
        <h2 class="text-2xl font-semibold mb-4">OpenAI API Key</h2>
        <p class="text-sm text-base-content/70 mb-4">
          Alice needs an OpenAI API key for her core brain functions. You can
          get one from the
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            class="link link-primary"
            >OpenAI Platform</a
          >. You might need to
          <a
            href="https://platform.openai.com/settings/organization/general"
            target="_blank"
            class="link link-primary"
            >verify your organization</a
          >
          on OpenAI Platform to use image generation.
        </p>

        <div class="form-control mb-4">
          <label class="label">
            <span class="label-text">API Key</span>
          </label>
          <input
            type="password"
            v-model="formData.VITE_OPENAI_API_KEY"
            placeholder="sk-..."
            class="input focus:outline-none w-full"
            :class="{
              'input-error':
                testResult.openai.error && !testResult.openai.success,
            }"
          />
        </div>

        <button
          @click="testOpenAIKey"
          class="btn btn-secondary btn-active w-full mb-4"
          :disabled="isTesting.openai || !formData.VITE_OPENAI_API_KEY.trim()"
        >
          <span
            v-if="isTesting.openai"
            class="loading loading-spinner loading-xs mr-2"
          ></span>
          Test Key
        </button>

        <div v-if="testResult.openai.error" class="alert alert-error mb-4">
          <span class="text-xs">{{ testResult.openai.error }}</span>
        </div>

        <div v-if="testResult.openai.success" class="alert alert-success mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>Success! Your API key is working.</span>
        </div>

        <div class="flex justify-between mt-6">
          <button @click="step = 1" class="btn btn-ghost">Back</button>
          <button
            @click="step = 3"
            class="btn btn-primary btn-active"
            :disabled="!testResult.openai.success"
          >
            Next
          </button>
        </div>
      </div>

      <div v-if="step === 3">
        <h2 class="text-2xl font-semibold mb-4">Speech-to-Text</h2>
        <p class="text-sm text-base-content/70 mb-4">
          Choose a provider for voice transcription. Groq is faster, while
          OpenAI is integrated.
        </p>

        <div class="form-control mb-4">
          <label class="label">
            <span class="label-text">STT Provider</span>
          </label>
          <select
            v-model="formData.sttProvider"
            class="select select-bordered w-full focus:select-primary focus:outline-none"
          >
            <option value="openai">OpenAI (Good quality, integrated)</option>
            <option value="groq">Groq (Faster, requires separate key)</option>
          </select>
        </div>

        <div v-if="formData.sttProvider === 'groq'" class="form-control mb-4">
          <label class="label">
            <span class="label-text">Groq API Key</span>
          </label>
          <p class="text-sm text-base-content/70 mb-2">
            You'll need a Groq API key. Get one from the
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              class="link link-primary"
              >Groq Console</a
            >.
          </p>
          <input
            type="password"
            v-model="formData.VITE_GROQ_API_KEY"
            placeholder="gsk_..."
            class="input input-bordered w-full"
          />
        </div>

        <div class="flex justify-between mt-6">
          <button @click="step = 2" class="btn btn-ghost">Back</button>
          <button
            @click="finishOnboarding"
            class="btn btn-success btn-active"
            :disabled="
              isFinishing ||
              (formData.sttProvider === 'groq' &&
                !formData.VITE_GROQ_API_KEY.trim())
            "
          >
            <span
              v-if="isFinishing"
              class="loading loading-spinner loading-xs mr-2"
            ></span>
            Finish Setup
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import OpenAI from 'openai'

const step = ref(1)
const settingsStore = useSettingsStore()

const formData = reactive({
  VITE_OPENAI_API_KEY: '',
  sttProvider: 'openai' as 'openai' | 'groq',
  VITE_GROQ_API_KEY: '',
})

const isTesting = reactive({ openai: false })
const testResult = reactive({
  openai: { success: false, error: '' },
})

const isFinishing = ref(false)

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

const finishOnboarding = async () => {
  if (formData.sttProvider === 'groq' && !formData.VITE_GROQ_API_KEY.trim()) {
    alert('Please enter a Groq API key or choose the OpenAI provider.')
    return
  }

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
