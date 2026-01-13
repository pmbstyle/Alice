<template>
  <div>
    <div class="mb-6">
      <h2 class="text-2xl font-semibold mb-3">Choose Your AI Provider</h2>
      <p class="text-base-content/70">
        Select how you want to power Alice's intelligence. You can always change
        this later.
      </p>
    </div>

    <div class="form-control mb-6">
      <label class="label">
        <span class="label-text font-medium">AI Provider</span>
      </label>
      <select
        v-model="formData.aiProvider"
        class="select select-bordered w-full focus:select-primary focus:outline-none"
        @change="$emit('reset-tests')"
      >
        <option value="openai">OpenAI (GPT models, image generation)</option>
        <option value="openrouter">
          OpenRouter (400+ models, no image gen)
        </option>
        <option value="ollama">Ollama (Local LLMs)</option>
        <option value="lm-studio">LM Studio (Local LLMs)</option>
        <option value="aws-bedrock">AWS Bedrock (Claude models)</option>
      </select>
    </div>

    <!-- OpenAI Configuration -->
    <div v-if="formData.aiProvider === 'openai'" class="space-y-4">
      <div class="alert alert-info text-sm">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="stroke-current shrink-0 w-5 h-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <div>
          <p>
            Get your API key from the
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              class="link"
              >OpenAI Platform</a
            >.
          </p>
          <p>
            You might need to
            <a
              href="https://platform.openai.com/settings/organization/general"
              target="_blank"
              class="link"
              >verify your organization</a
            >
            for image generation.
          </p>
        </div>
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text">OpenAI API Key</span>
        </label>
        <input
          type="password"
          v-model="formData.VITE_OPENAI_API_KEY"
          placeholder="sk-..."
          class="input input-bordered w-full focus:input-primary"
          :class="{
            'input-error':
              testResult.openai.error && !testResult.openai.success,
          }"
        />
      </div>

      <button
        @click="$emit('test-openai')"
        class="btn btn-secondary w-full"
        :disabled="isTesting.openai || !formData.VITE_OPENAI_API_KEY.trim()"
      >
        <span
          v-if="isTesting.openai"
          class="loading loading-spinner loading-xs mr-2"
        ></span>
        Test OpenAI Key
      </button>

      <TestResult :result="testResult.openai" />
    </div>

    <!-- OpenRouter Configuration -->
    <div v-else-if="formData.aiProvider === 'openrouter'" class="space-y-4">
      <div class="alert alert-info text-sm">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="stroke-current shrink-0 w-5 h-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <span
          >OpenRouter provides access to 400+ models. You can choose local
          models for voice features in the next step.</span
        >
      </div>

      <!-- OpenRouter Key -->
      <div class="form-control">
        <label class="label">
          <span class="label-text">OpenRouter API Key</span>
        </label>
        <div class="text-sm text-base-content/70 mb-2">
          Get your key from the
          <a href="https://openrouter.ai/keys" target="_blank" class="link"
            >OpenRouter Platform</a
          >
        </div>
        <input
          type="password"
          v-model="formData.VITE_OPENROUTER_API_KEY"
          placeholder="sk-or-v1-..."
          class="input input-bordered w-full focus:input-primary"
          :class="{
            'input-error':
              testResult.openrouter.error && !testResult.openrouter.success,
          }"
        />
      </div>

      <button
        @click="$emit('test-openrouter')"
        class="btn btn-secondary w-full"
        :disabled="
          isTesting.openrouter || !formData.VITE_OPENROUTER_API_KEY.trim()
        "
      >
        <span
          v-if="isTesting.openrouter"
          class="loading loading-spinner loading-xs mr-2"
        ></span>
        Test OpenRouter Key
      </button>

      <TestResult :result="testResult.openrouter" />
    </div>

    <!-- Ollama Configuration -->
    <div v-else-if="formData.aiProvider === 'ollama'" class="space-y-4">
      <div class="alert alert-info text-sm">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="stroke-current shrink-0 w-5 h-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <span
          >Make sure Ollama is installed and running. You can use built-in local
          models for voice features in the next step.</span
        >
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text">Ollama Base URL</span>
        </label>
        <input
          type="text"
          v-model="formData.ollamaBaseUrl"
          placeholder="http://localhost:11434"
          class="input input-bordered w-full focus:input-primary"
          :class="{
            'input-error':
              testResult.ollama.error && !testResult.ollama.success,
          }"
        />
      </div>

      <button
        @click="$emit('test-ollama')"
        class="btn btn-secondary w-full"
        :disabled="isTesting.ollama || !formData.ollamaBaseUrl.trim()"
      >
        <span
          v-if="isTesting.ollama"
          class="loading loading-spinner loading-xs mr-2"
        ></span>
        Test Ollama Connection
      </button>

      <TestResult :result="testResult.ollama" />

      <!-- Model Selection for Ollama -->
      <div
        v-if="testResult.ollama.success && formData.availableModels.length > 0"
        class="space-y-4"
      >
        <div class="form-control">
          <label class="label">
            <span class="label-text">Assistant Model</span>
          </label>
          <select
            v-model="formData.assistantModel"
            class="select select-bordered w-full focus:select-primary focus:outline-none"
          >
            <option
              v-for="model in formData.availableModels"
              :key="model"
              :value="model"
            >
              {{ model }}
            </option>
          </select>
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text">Summarization Model</span>
          </label>
          <select
            v-model="formData.summarizationModel"
            class="select select-bordered w-full focus:select-primary focus:outline-none"
          >
            <option
              v-for="model in formData.availableModels"
              :key="model"
              :value="model"
            >
              {{ model }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- LM Studio Configuration -->
    <div v-else-if="formData.aiProvider === 'lm-studio'" class="space-y-4">
      <div class="alert alert-info text-sm">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="stroke-current shrink-0 w-5 h-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <span
          >Make sure LM Studio is installed with a local server running. You can
          use built-in local models for voice features in the next step.</span
        >
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text">LM Studio Base URL</span>
        </label>
        <input
          type="text"
          v-model="formData.lmStudioBaseUrl"
          placeholder="http://localhost:1234"
          class="input input-bordered w-full focus:input-primary"
          :class="{
            'input-error':
              testResult.lmStudio.error && !testResult.lmStudio.success,
          }"
        />
      </div>

      <button
        @click="$emit('test-lmstudio')"
        class="btn btn-secondary w-full"
        :disabled="isTesting.lmStudio || !formData.lmStudioBaseUrl.trim()"
      >
        <span
          v-if="isTesting.lmStudio"
          class="loading loading-spinner loading-xs mr-2"
        ></span>
        Test LM Studio Connection
      </button>

      <TestResult :result="testResult.lmStudio" />

      <!-- Model Selection for LM Studio -->
      <div
        v-if="
          testResult.lmStudio.success && formData.availableModels.length > 0
        "
        class="space-y-4"
      >
        <div class="form-control">
          <label class="label">
            <span class="label-text">Assistant Model</span>
          </label>
          <select
            v-model="formData.assistantModel"
            class="select select-bordered w-full focus:select-primary focus:outline-none"
          >
            <option
              v-for="model in formData.availableModels"
              :key="model"
              :value="model"
            >
              {{ model }}
            </option>
          </select>
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text">Summarization Model</span>
          </label>
          <select
            v-model="formData.summarizationModel"
            class="select select-bordered w-full focus:select-primary focus:outline-none"
          >
            <option
              v-for="model in formData.availableModels"
              :key="model"
              :value="model"
            >
              {{ model }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- AWS Bedrock Configuration -->
    <div v-else-if="formData.aiProvider === 'aws-bedrock'" class="space-y-4">
      <div class="alert alert-info text-sm">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="stroke-current shrink-0 w-5 h-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <div>
          <p>
            Get your AWS credentials from the
            <a
              href="https://console.aws.amazon.com/iam/home#/security_credentials"
              target="_blank"
              class="link"
              >AWS IAM Console</a
            >.
          </p>
          <p class="mt-2 text-xs">
            Required IAM permissions: <code class="text-xs">bedrock:InvokeModel</code>,
            <code class="text-xs">bedrock:InvokeModelWithResponseStream</code>,
            <code class="text-xs">bedrock:ListFoundationModels</code>
          </p>
        </div>
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text">AWS Access Key ID</span>
        </label>
        <input
          type="password"
          v-model="formData.awsAccessKeyId"
          placeholder="AKIA..."
          class="input input-bordered w-full focus:input-primary"
          :class="{
            'input-error':
              testResult.bedrock.error && !testResult.bedrock.success,
          }"
        />
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text">AWS Secret Access Key</span>
        </label>
        <input
          type="password"
          v-model="formData.awsSecretAccessKey"
          placeholder="Enter your secret key"
          class="input input-bordered w-full focus:input-primary"
          :class="{
            'input-error':
              testResult.bedrock.error && !testResult.bedrock.success,
          }"
        />
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text">AWS Session Token (Optional)</span>
        </label>
        <input
          type="password"
          v-model="formData.awsSessionToken"
          placeholder="Only for temporary credentials"
          class="input input-bordered w-full focus:input-primary"
        />
        <label class="label">
          <span class="label-text-alt">Only needed for temporary credentials (STS)</span>
        </label>
      </div>

      <div class="form-control">
        <label class="label">
          <span class="label-text">AWS Region</span>
        </label>
        <select
          v-model="formData.awsRegion"
          class="select select-bordered w-full focus:select-primary focus:outline-none"
        >
          <option value="us-east-1">US East (N. Virginia)</option>
          <option value="us-west-2">US West (Oregon)</option>
          <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
          <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
          <option value="eu-central-1">Europe (Frankfurt)</option>
          <option value="eu-west-1">Europe (Ireland)</option>
          <option value="eu-west-2">Europe (London)</option>
        </select>
      </div>

      <button
        @click="$emit('test-bedrock')"
        class="btn btn-secondary w-full"
        :disabled="
          isTesting.bedrock ||
          !formData.awsAccessKeyId.trim() ||
          !formData.awsSecretAccessKey.trim() ||
          !formData.awsRegion.trim()
        "
      >
        <span
          v-if="isTesting.bedrock"
          class="loading loading-spinner loading-xs mr-2"
        ></span>
        Test AWS Bedrock Connection
      </button>

      <TestResult :result="testResult.bedrock" />

      <!-- Model Selection for Bedrock -->
      <div
        v-if="testResult.bedrock.success && formData.availableModels.length > 0"
        class="space-y-4"
      >
        <div class="form-control">
          <label class="label">
            <span class="label-text">Assistant Model</span>
          </label>
          <select
            v-model="formData.assistantModel"
            class="select select-bordered w-full focus:select-primary focus:outline-none"
          >
            <option
              v-for="model in formData.availableModels"
              :key="model"
              :value="model"
            >
              {{ model }}
            </option>
          </select>
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text">Summarization Model</span>
          </label>
          <select
            v-model="formData.summarizationModel"
            class="select select-bordered w-full focus:select-primary focus:outline-none"
          >
            <option
              v-for="model in formData.availableModels"
              :key="model"
              :value="model"
            >
              {{ model }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import TestResult from '../TestResult.vue'

defineProps<{
  formData: any
  testResult: any
  isTesting: any
}>()

defineEmits<{
  'test-openai': []
  'test-openrouter': []
  'test-ollama': []
  'test-lmstudio': []
  'test-bedrock': []
  'reset-tests': []
}>()
</script>
