<template>
  <div class="space-y-6">
    <h3 class="text-xl font-semibold mb-4 text-blue-400">
      Core API Configuration
    </h3>
    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">API Keys & Providers</legend>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
        <div>
          <label for="ai-provider" class="block mb-1 text-sm"
            >AI Provider *</label
          >
          <select
            id="ai-provider"
            v-model="currentSettings.aiProvider"
            class="select select-bordered w-full focus:select-primary"
          >
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="ollama">Ollama (Local)</option>
            <option value="lm-studio">LM Studio (Local)</option>
            <option value="aws-bedrock">AWS Bedrock</option>
          </select>
        </div>
        <div>
          <label for="stt-provider" class="block mb-1 text-sm"
            >Speech-to-Text Provider *</label
          >
          <select
            id="stt-provider"
            v-model="currentSettings.sttProvider"
            class="select select-bordered w-full focus:select-primary"
            @change="
              e => $emit('update:setting', 'sttProvider', e.target.value)
            "
          >
            <option value="openai">OpenAI (gpt-4o-transcribe)</option>
            <option value="groq">Groq (whisper-large-v3)</option>
            <option value="google">Google (Cloud)</option>
            <option value="local">Local (Go Backend)</option>
          </select>
        </div>
        <div
          v-if="
            currentSettings.sttProvider === 'google' ||
            currentSettings.sttProvider === 'local'
          "
        >
          <label for="stt-language" class="block mb-1 text-sm">Language *</label>
          <select
            id="stt-language"
            v-model="currentSettings.localSttLanguage"
            class="select select-bordered w-full focus:select-primary"
            @change="
              e => $emit('update:setting', 'localSttLanguage', e.target.value)
            "
          >
            <option value="auto">Auto-detect</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ru">Russian</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="ar">Arabic</option>
            <option value="hi">Hindi</option>
            <option value="tr">Turkish</option>
            <option value="pl">Polish</option>
            <option value="nl">Dutch</option>
            <option value="sv">Swedish</option>
            <option value="da">Danish</option>
            <option value="no">Norwegian</option>
            <option value="fi">Finnish</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">
            {{
              currentSettings.sttProvider === 'google'
                ? 'Select your language for better accuracy.'
                : 'Auto-detect works for most languages. Select a specific language for better accuracy.'
            }}
          </p>
        </div>
        <div>
          <label for="openai-key" class="block mb-1 text-sm"
            >OpenAI API Key *</label
          >
          <input
            id="openai-key"
            type="password"
            v-model="currentSettings.VITE_OPENAI_API_KEY"
            class="input focus:outline-none w-full"
            autocomplete="new-password"
            placeholder="sk-..."
          />
          <p class="text-xs text-gray-400 mt-1">
            Required for TTS/STT/embeddings regardless of AI provider.
          </p>
        </div>
        <div v-if="currentSettings.aiProvider === 'openrouter'">
          <label for="openrouter-key" class="block mb-1 text-sm"
            >OpenRouter API Key *</label
          >
          <input
            id="openrouter-key"
            type="password"
            v-model="currentSettings.VITE_OPENROUTER_API_KEY"
            class="input focus:outline-none w-full"
            autocomplete="new-password"
            placeholder="sk-or-v1-..."
          />
          <p class="text-xs text-gray-400 mt-1">
            Required for chat models when using OpenRouter.
          </p>
        </div>
        <div v-if="currentSettings.aiProvider === 'ollama'">
          <label for="ollama-url" class="block mb-1 text-sm"
            >Ollama Base URL *</label
          >
          <input
            id="ollama-url"
            type="text"
            v-model="currentSettings.ollamaBaseUrl"
            class="input focus:outline-none w-full"
            placeholder="http://localhost:11434"
          />
          <p class="text-xs text-gray-400 mt-1">
            URL where your Ollama server is running.
          </p>
        </div>
        <div v-if="currentSettings.aiProvider === 'lm-studio'">
          <label for="lmstudio-url" class="block mb-1 text-sm"
            >LM Studio Base URL *</label
          >
          <input
            id="lmstudio-url"
            type="text"
            v-model="currentSettings.lmStudioBaseUrl"
            class="input focus:outline-none w-full"
            placeholder="http://localhost:1234"
          />
          <p class="text-xs text-gray-400 mt-1">
            URL where your LM Studio server is running.
          </p>
        </div>
      </div>
    </fieldset>

    <!-- AWS Bedrock Configuration -->
    <fieldset
      v-if="currentSettings.aiProvider === 'aws-bedrock'"
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">AWS Bedrock Configuration</legend>
      <div class="space-y-4 p-2">
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
              AWS Bedrock provides access to Claude models. Get your credentials from the
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

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="aws-access-key" class="block mb-1 text-sm"
              >AWS Access Key ID *</label
            >
            <input
              id="aws-access-key"
              type="password"
              v-model="currentSettings.awsAccessKeyId"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
              placeholder="AKIA..."
            />
            <p class="text-xs text-gray-400 mt-1">
              Your AWS IAM user access key ID.
            </p>
          </div>

          <div>
            <label for="aws-secret-key" class="block mb-1 text-sm"
              >AWS Secret Access Key *</label
            >
            <input
              id="aws-secret-key"
              type="password"
              v-model="currentSettings.awsSecretAccessKey"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
              placeholder="Enter your secret key"
            />
            <p class="text-xs text-gray-400 mt-1">
              Your AWS IAM user secret access key.
            </p>
          </div>

          <div>
            <label for="aws-session-token" class="block mb-1 text-sm"
              >AWS Session Token (Optional)</label
            >
            <input
              id="aws-session-token"
              type="password"
              v-model="currentSettings.awsSessionToken"
              class="input focus:outline-none w-full"
              autocomplete="new-password"
              placeholder="Optional for temporary credentials"
            />
            <p class="text-xs text-gray-400 mt-1">
              Only needed for temporary credentials (STS).
            </p>
          </div>

          <div>
            <label for="aws-region" class="block mb-1 text-sm">AWS Region *</label>
            <select
              id="aws-region"
              v-model="currentSettings.awsRegion"
              class="select select-bordered w-full focus:select-primary"
            >
              <option value="us-east-1">US East (N. Virginia)</option>
              <option value="us-west-2">US West (Oregon)</option>
              <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
              <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
              <option value="eu-central-1">Europe (Frankfurt)</option>
              <option value="eu-west-1">Europe (Ireland)</option>
              <option value="eu-west-2">Europe (London)</option>
            </select>
            <p class="text-xs text-gray-400 mt-1">
              Select a region where Bedrock is available.
            </p>
          </div>
        </div>
      </div>
    </fieldset>

    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Other API Keys</legend>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
        <div v-if="currentSettings.sttProvider === 'groq'">
          <label for="groq-key" class="block mb-1 text-sm"
            >Groq API Key (for STT) *</label
          >
          <input
            id="groq-key"
            type="password"
            v-model="currentSettings.VITE_GROQ_API_KEY"
            class="input focus:outline-none w-full"
            autocomplete="new-password"
            placeholder="gsk_..."
          />
          <p class="text-xs text-gray-400 mt-1">
            Required only if Groq STT is selected above.
          </p>
        </div>
        <div
          v-if="
            currentSettings.sttProvider === 'google' ||
            currentSettings.ttsProvider === 'google'
          "
        >
          <label for="google-key" class="block mb-1 text-sm"
            >Google API Key *</label
          >
          <input
            id="google-key"
            type="password"
            v-model="currentSettings.VITE_GOOGLE_API_KEY"
            class="input focus:outline-none w-full"
            autocomplete="new-password"
            placeholder="AIza..."
          />
          <p class="text-xs text-gray-400 mt-1">
            Required for Google STT or TTS services.
          </p>
        </div>
      </div>
    </fieldset>

    <!-- Local STT Configuration Section -->
    <fieldset
      v-if="currentSettings.sttProvider === 'local'"
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">
        Local Speech-to-Text Configuration (Go Backend)
        <span
          class="w-2 h-2 rounded-full inline-block"
          :class="getServiceStatusClass('stt')"
          :title="getServiceStatusText('stt')"
        ></span>
      </legend>
      <div class="space-y-4 p-2">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="stt-model" class="block mb-1 text-sm"
              >Whisper Model *</label
            >
            <select
              id="stt-model"
              v-model="currentSettings.localSttModel"
              class="select select-bordered w-full focus:select-primary"
              @change="
                e => $emit('update:setting', 'localSttModel', e.target.value)
              "
            >
              <option value="whisper-tiny.en">
                Tiny (English only, fastest)
              </option>
              <option value="whisper-base">Base (multilingual)</option>
              <option value="whisper-small">Small (better accuracy)</option>
              <option value="whisper-medium">Medium (high accuracy)</option>
              <option value="whisper-large">Large (best accuracy)</option>
            </select>
            <p class="text-xs text-gray-400 mt-1">
              Larger models provide better accuracy but require more resources.
            </p>
          </div>
          <div>
            <label for="stt-wake-enable" class="block mb-1 text-sm"
              >Enable Wake Word</label
            >
            <select
              id="stt-wake-enable"
              v-model="currentSettings.localSttEnabled"
              class="select select-bordered w-full focus:select-primary"
              @change="
                e =>
                  $emit(
                    'update:setting',
                    'localSttEnabled',
                    e.target.value === 'true'
                  )
              "
            >
              <option value="true">Enable</option>
              <option value="false">Disable</option>
            </select>
          </div>
          <div v-show="currentSettings.localSttEnabled">
            <label for="stt-wakeword" class="block mb-1 text-sm"
              >Wake Word *</label
            >
            <input
              id="stt-wakeword"
              type="text"
              v-model="currentSettings.localSttWakeWord"
              class="input input-bordered w-full focus:input-primary"
              @change="
                e => $emit('update:setting', 'localSttWakeWord', e.target.value)
              "
              placeholder="alice"
            />
            <p class="text-xs text-gray-400 mt-1">
              The word that will activate voice recording. Use simple, common
              words for better recognition.
            </p>
          </div>
          <div v-show="currentSettings.localSttEnabled" class="mt-4">
            <label for="stt-wakeword-sensitivity" class="block mb-2 text-sm"
              >Wake Word Sensitivity</label
            >
            <div class="flex items-center gap-3">
              <span class="text-xs text-gray-400 min-w-[40px]">Strict</span>
              <input
                id="stt-wakeword-sensitivity"
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                v-model.number="currentSettings.localSttWakeWordSensitivity"
                class="range range-primary range-sm flex-1"
                @input="
                  e =>
                    $emit(
                      'update:setting',
                      'localSttWakeWordSensitivity',
                      parseFloat(e.target.value)
                    )
                "
              />
              <span class="text-xs text-gray-400 min-w-[50px]">Flexible</span>
            </div>
            <div class="flex justify-between items-center mt-2">
              <span class="text-xs font-semibold text-blue-400">
                Current: {{ (currentSettings.localSttWakeWordSensitivity * 100).toFixed(0) }}%
              </span>
              <span class="text-xs text-gray-500">
                Catches variations like "Eloise" → "Alice"
              </span>
            </div>
            <div class="mt-2 p-2 bg-gray-800/50 rounded text-xs text-gray-400">
              <div class="font-semibold text-gray-300 mb-1">💡 Recommended: 75%</div>
              <div class="space-y-1">
                <div>• <strong>85-95%:</strong> Exact or near-exact match only</div>
                <div>• <strong>70-85%:</strong> Catches common variations (recommended)</div>
                <div>• <strong>50-70%:</strong> Very flexible, may have false positives</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </fieldset>

    <!-- VAD Noise Filtering Section -->
    <fieldset
      class="fieldset bg-gray-900/90 border-orange-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">
        🔇 Voice Activity Detection & Noise Filtering
      </legend>
      <div class="p-2">
        <div class="mb-4 p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg">
          <div class="flex items-start gap-2">
            <span class="text-orange-400 text-xl">⚠️</span>
            <div class="text-xs text-gray-300">
              <strong class="text-orange-400">Noise Filtering Settings</strong><br>
              Adjust these settings if background noise (kids talking, pets, TV) is triggering Alice unintentionally.
              Higher values = stricter filtering = fewer false triggers.
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <!-- VAD Speech Threshold -->
          <div>
            <label for="vad-speech-threshold" class="block mb-2 text-sm font-semibold"
              >VAD Speech Sensitivity</label
            >
            <div class="flex items-center gap-3">
              <span class="text-xs text-gray-400 min-w-[60px]">Sensitive</span>
              <input
                id="vad-speech-threshold"
                type="range"
                min="0.3"
                max="0.9"
                step="0.05"
                v-model.number="currentSettings.vadSpeechThreshold"
                class="range range-warning range-sm flex-1"
                @input="
                  e =>
                    $emit(
                      'update:setting',
                      'vadSpeechThreshold',
                      parseFloat(e.target.value)
                    )
                "
              />
              <span class="text-xs text-gray-400 min-w-[60px]">Strict</span>
            </div>
            <div class="flex justify-between items-center mt-2">
              <span class="text-xs font-semibold text-orange-400">
                Current: {{ (currentSettings.vadSpeechThreshold * 100).toFixed(0) }}%
              </span>
              <span class="text-xs text-gray-500">
                Higher = ignores more background sounds
              </span>
            </div>
            <div class="mt-2 text-xs text-gray-400">
              <strong>Recommended for noisy environments:</strong> 60-70%
            </div>
          </div>

          <!-- Minimum Speech Duration -->
          <div>
            <label for="vad-min-duration" class="block mb-2 text-sm font-semibold"
              >Minimum Speech Duration</label
            >
            <div class="flex items-center gap-3">
              <input
                id="vad-min-duration"
                type="range"
                min="200"
                max="2000"
                step="100"
                v-model.number="currentSettings.vadMinSpeechDuration"
                class="range range-warning range-sm flex-1"
                @input="
                  e =>
                    $emit(
                      'update:setting',
                      'vadMinSpeechDuration',
                      parseInt((e.target as HTMLInputElement).value)
                    )
                "
              />
            </div>
            <div class="flex justify-between items-center mt-2">
              <span class="text-xs font-semibold text-orange-400">
                Current: {{ currentSettings.vadMinSpeechDuration }}ms
              </span>
              <span class="text-xs text-gray-500">
                Ignores speech shorter than this
              </span>
            </div>
            <div class="mt-2 text-xs text-gray-400">
              <strong>Recommended for filtering kids' brief shouts:</strong> 800-1200ms
            </div>
          </div>

          <!-- Minimum Audio Energy -->
          <div>
            <label for="vad-min-energy" class="block mb-2 text-sm font-semibold"
              >Minimum Audio Volume</label
            >
            <div class="flex items-center gap-3">
              <span class="text-xs text-gray-400 min-w-[40px]">Quiet</span>
              <input
                id="vad-min-energy"
                type="range"
                min="0.01"
                max="0.15"
                step="0.01"
                v-model.number="currentSettings.vadMinAudioEnergy"
                class="range range-warning range-sm flex-1"
                @input="
                  e =>
                    $emit(
                      'update:setting',
                      'vadMinAudioEnergy',
                      parseFloat(e.target.value)
                    )
                "
              />
              <span class="text-xs text-gray-400 min-w-[40px]">Loud</span>
            </div>
            <div class="flex justify-between items-center mt-2">
              <span class="text-xs font-semibold text-orange-400">
                Current: {{ (currentSettings.vadMinAudioEnergy * 100).toFixed(1) }}%
              </span>
              <span class="text-xs text-gray-500">
                Ignores sounds quieter than this
              </span>
            </div>
            <div class="mt-2 text-xs text-gray-400">
              <strong>Recommended for distant/background voices:</strong> 0.05-0.08
            </div>
          </div>

          <!-- Reset to Defaults -->
          <div class="pt-2 border-t border-gray-700">
            <button
              @click="resetVadDefaults"
              class="btn btn-sm btn-outline btn-warning"
            >
              Reset to Defaults
            </button>
            <span class="ml-2 text-xs text-gray-500">
              Default: Threshold 50%, Duration 500ms, Energy 2%
            </span>
          </div>
        </div>
      </div>
    </fieldset>

    <!-- TTS Settings Section -->
    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">
        Text-to-Speech Configuration
        <span
          class="w-2 h-2 rounded-full inline-block"
          :class="getServiceStatusClass('tts')"
          :title="getServiceStatusText('tts')"
        ></span>
      </legend>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
        <div>
          <label for="tts-provider" class="block mb-1 text-sm"
            >TTS Provider *</label
          >
          <select
            id="tts-provider"
            v-model="currentSettings.ttsProvider"
            class="select select-bordered w-full focus:select-primary"
          >
            <option value="openai">OpenAI (Cloud)</option>
            <option value="google">Google (Cloud)</option>
            <option value="local">Local (Piper)</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">
            Choose between cloud-based OpenAI TTS or local Piper TTS.
          </p>
        </div>
        <div v-if="currentSettings.ttsProvider === 'openai'">
          <label for="tts-voice" class="block mb-1 text-sm"
            >OpenAI TTS Voice</label
          >
          <select
            id="tts-voice"
            v-model="currentSettings.ttsVoice"
            class="select select-bordered w-full focus:select-primary"
          >
            <option value="alloy">Alloy</option>
            <option value="echo">Echo</option>
            <option value="fable">Fable</option>
            <option value="nova">Nova</option>
            <option value="onyx">Onyx</option>
            <option value="shimmer">Shimmer</option>
          </select>
        </div>
        <div v-if="currentSettings.ttsProvider === 'google'">
          <label for="google-tts-voice" class="block mb-1 text-sm"
            >Google TTS Voice</label
          >
          <select
            id="google-tts-voice"
            v-model="currentSettings.googleTtsVoice"
            class="select select-bordered w-full focus:select-primary"
            @change="
              e => $emit('update:setting', 'googleTtsVoice', e.target.value)
            "
          >
            <option value="en-US-Journey-F">Journey F (Fem)</option>
            <option value="en-US-Journey-O">Journey O (Fem)</option>
            <option value="en-US-Neural2-C">Neural2 C (Fem)</option>
            <option value="en-US-Neural2-F">Neural2 F (Fem)</option>
            <option value="en-US-Neural2-H">Neural2 H (Fem)</option>
            <option value="en-US-Standard-C">Standard C (Fem)</option>
            <option value="en-US-Standard-E">Standard E (Fem)</option>
            <option value="en-US-Wavenet-C">Wavenet C (Fem)</option>
            <option value="en-US-Wavenet-F">Wavenet F (Fem)</option>
          </select>
        </div>
        <div v-if="currentSettings.ttsProvider === 'local'">
          <label for="local-tts-voice" class="block mb-1 text-sm"
            >Local TTS Voice</label
          >
          <div class="space-y-3">
            <div class="flex gap-2 items-center">
              <select
                id="local-tts-voice"
                v-model="currentSettings.localTtsVoice"
                class="select select-bordered flex-1 focus:select-primary"
                @change="onVoiceChange"
              >
                <option v-if="availableVoices.length === 0" disabled value="">
                  {{
                    isRefreshingVoices
                      ? 'Loading voices...'
                      : 'No voices available'
                  }}
                </option>
                <optgroup
                  v-for="(voices, language) in groupedVoices"
                  :key="language"
                  :label="getLanguageDisplayName(language)"
                >
                  <option
                    v-for="voice in voices"
                    :key="voice.name"
                    :value="voice.name"
                    :title="`${voice.description} | Quality: ${getVoiceQuality(voice.name)} | Gender: ${voice.gender || 'Unknown'}`"
                  >
                    {{ getVoiceDisplayName(voice) }}
                  </option>
                </optgroup>
              </select>
              <button
                type="button"
                @click="refreshVoices"
                :disabled="isRefreshingVoices"
                class="btn btn-square btn-sm"
                title="Refresh voices"
              >
                <span
                  v-if="isRefreshingVoices"
                  class="loading loading-spinner loading-xs"
                ></span>
                <span v-else>🔄</span>
              </button>
              <button
                type="button"
                @click="previewVoice"
                :disabled="!currentSettings.localTtsVoice || isPreviewingVoice"
                class="btn btn-square btn-sm"
                title="Preview selected voice"
              >
                <span
                  v-if="isPreviewingVoice"
                  class="loading loading-spinner loading-xs"
                ></span>
                <span v-else>🎵</span>
              </button>
            </div>

            <div
              class="flex items-center justify-between text-xs text-gray-400"
            >
              <span>
                {{
                  availableVoices.filter(v => v.gender !== 'male').length
                }}
                voice{{
                  availableVoices.filter(v => v.gender !== 'male').length !== 1
                    ? 's'
                    : ''
                }}
                across {{ Object.keys(groupedVoices).length }} languages
              </span>
              <span
                class="text-blue-400 cursor-pointer hover:underline"
                @click="showVoiceHelp = !showVoiceHelp"
              >
                {{ showVoiceHelp ? 'Hide Help' : 'Voice Help' }}
              </span>
            </div>

            <!-- Voice Help Section -->
            <div
              v-if="showVoiceHelp"
              class="bg-base-300 p-3 rounded-lg text-xs space-y-2"
            >
              <h5 class="font-medium text-sm">Voice Quality Levels:</h5>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <span class="badge badge-xs badge-outline mr-1">x_low</span>
                  16kHz, Smallest
                </div>
                <div>
                  <span class="badge badge-xs badge-outline mr-1">low</span>
                  16kHz, Fast
                </div>
                <div>
                  <span class="badge badge-xs badge-outline mr-1">medium</span>
                  22kHz, High Quality
                </div>
                <div>
                  <span class="badge badge-xs badge-outline mr-1">high</span>
                  22kHz, Best Quality
                </div>
              </div>
              <p class="text-base-content/60 mt-2">
                💡 <strong>Tip:</strong> Voice models are downloaded
                automatically when first used. Higher quality voices provide
                better audio but require more storage space.
              </p>
            </div>
          </div>
        </div>
      </div>
    </fieldset>

    <!-- Embedding Configuration Section -->
    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">
        Embedding Configuration
        <span
          class="w-2 h-2 rounded-full inline-block"
          :class="getServiceStatusClass('embeddings')"
          :title="getServiceStatusText('embeddings')"
        ></span>
      </legend>
      <div class="grid grid-cols-1 gap-4 p-2">
        <div>
          <label for="embedding-provider" class="block mb-1 text-sm"
            >Embedding Provider *</label
          >
          <select
            id="embedding-provider"
            v-model="currentSettings.embeddingProvider"
            class="select select-bordered w-full focus:select-primary"
          >
            <option value="openai">OpenAI (Cloud)</option>
            <option value="local">Local (all-MiniLM-L6-v2)</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">
            Choose between cloud-based OpenAI embeddings or local
            all-MiniLM-L6-v2 embeddings. Your existing data is preserved when
            switching.
          </p>
        </div>
      </div>
    </fieldset>

    <!-- Local Documents (RAG) Section -->
    <fieldset
      class="fieldset bg-gray-900/90 border-blue-500/50 rounded-box w-full border p-4"
    >
      <legend class="fieldset-legend">Local Documents (RAG)</legend>
      <div class="grid grid-cols-1 gap-4 p-2">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label for="rag-enabled" class="block mb-1 text-sm"
              >Enable RAG</label
            >
            <select
              id="rag-enabled"
              v-model="currentSettings.ragEnabled"
              class="select select-bordered w-full focus:select-primary"
            >
              <option :value="true">Enabled</option>
              <option :value="false">Disabled</option>
            </select>
          </div>
          <div>
            <label for="rag-topk" class="block mb-1 text-sm"
              >Top K Chunks</label
            >
            <input
              id="rag-topk"
              type="number"
              min="1"
              max="20"
              v-model.number="currentSettings.ragTopK"
              class="input input-bordered w-full focus:input-primary"
            />
          </div>
          <div>
            <label for="rag-max-chars" class="block mb-1 text-sm"
              >Max Context Chars</label
            >
            <input
              id="rag-max-chars"
              type="number"
              min="500"
              max="6000"
              step="100"
              v-model.number="currentSettings.ragMaxContextChars"
              class="input input-bordered w-full focus:input-primary"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="btn btn-sm"
            :disabled="isIndexingRag"
            @click="selectRagPaths"
          >
            Add Files/Folders
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :disabled="isIndexingRag || currentSettings.ragPaths.length === 0"
            @click="reindexRag"
          >
            Reindex
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline"
            :disabled="isIndexingRag"
            @click="clearRagIndex"
          >
            Clear Index
          </button>
          <span class="text-xs text-gray-400">
            {{ ragStats.documents }} docs, {{ ragStats.chunks }} chunks
          </span>
          <span v-if="ragStatusMessage" class="text-xs text-gray-400">
            {{ ragStatusMessage }}
          </span>
        </div>

        <div v-if="currentSettings.ragPaths.length > 0">
          <label class="block mb-2 text-sm">Indexed Paths</label>
          <div class="space-y-2">
            <div
              v-for="pathItem in currentSettings.ragPaths"
              :key="pathItem"
              class="flex items-center justify-between gap-2 bg-gray-800/50 rounded px-3 py-2 text-xs"
            >
              <span class="truncate" :title="pathItem">{{ pathItem }}</span>
              <button
                type="button"
                class="btn btn-xs btn-ghost"
                @click="removeRagPath(pathItem)"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { AliceSettings } from '../../stores/settingsStore'
import { backendApi, type Voice } from '../../services/backendApi'

// Type for service status
interface ServiceStatus {
  status: 'ready' | 'downloading' | 'error' | 'offline'
}

const props = defineProps<{
  currentSettings: AliceSettings
}>()

const emit = defineEmits<{
  'update:setting': [
    key: keyof AliceSettings,
    value: string | boolean | number | string[],
  ]
}>()

const serviceStatus = ref<{
  stt: ServiceStatus
  tts: ServiceStatus
  embeddings: ServiceStatus
}>({
  stt: { status: 'offline' },
  tts: { status: 'offline' },
  embeddings: { status: 'offline' },
})

const availableVoices = ref<Voice[]>([])
const isRefreshingVoices = ref(false)
const isPreviewingVoice = ref(false)
const showVoiceHelp = ref(false)
const ragStats = ref({ documents: 0, chunks: 0 })
const isIndexingRag = ref(false)
const ragStatusMessage = ref('')

let statusInterval: NodeJS.Timeout | null = null

const updateServiceStatus = async () => {
  try {
    await backendApi.initialize()

    // Check each service status
    const [sttReady, ttsReady, embeddingsReady] = await Promise.all([
      backendApi.isSTTReady().catch(() => false),
      backendApi.isTTSReady().catch(() => false),
      backendApi.isEmbeddingsReady().catch(() => false),
    ])

    serviceStatus.value = {
      stt: { status: sttReady ? 'ready' : 'error' },
      tts: { status: ttsReady ? 'ready' : 'error' },
      embeddings: { status: embeddingsReady ? 'ready' : 'error' },
    }
  } catch (error) {
    console.warn('Failed to get service status:', error)
    serviceStatus.value = {
      stt: { status: 'offline' },
      tts: { status: 'offline' },
      embeddings: { status: 'offline' },
    }
  }
}

const getServiceStatusClass = (service: 'stt' | 'tts' | 'embeddings') => {
  const status = serviceStatus.value[service].status
  switch (status) {
    case 'ready':
      return 'bg-green-500'
    case 'downloading':
      return 'bg-yellow-500'
    case 'error':
      return 'bg-red-500'
    case 'offline':
    default:
      return 'bg-gray-500'
  }
}

const getServiceStatusText = (service: 'stt' | 'tts' | 'embeddings') => {
  const status = serviceStatus.value[service].status
  const serviceNames = {
    stt: 'Speech-to-Text',
    tts: 'Text-to-Speech',
    embeddings: 'Embeddings',
  }

  switch (status) {
    case 'ready':
      return `${serviceNames[service]} service is ready`
    case 'downloading':
      return `${serviceNames[service]} model is downloading`
    case 'error':
      return `${serviceNames[service]} service has errors`
    case 'offline':
    default:
      return `${serviceNames[service]} service is offline`
  }
}

// Voice management computed properties and functions
const groupedVoices = computed(() => {
  const groups: Record<string, Voice[]> = {}
  // Filter out male voices
  const femaleVoices = availableVoices.value.filter(
    voice => voice.gender !== 'male'
  )
  femaleVoices.forEach(voice => {
    const lang = voice.language || 'unknown'
    if (!groups[lang]) groups[lang] = []
    groups[lang].push(voice)
  })

  // Sort voices within each language group by name
  Object.keys(groups).forEach(lang => {
    groups[lang].sort((a, b) => a.name.localeCompare(b.name))
  })

  return groups
})

const getLanguageDisplayName = (langCode: string): string => {
  const languageMap: Record<string, string> = {
    'en-US': 'English (US)',
    'en-GB': 'English (UK)',
    'es-ES': 'Spanish (Spain)',
    'es-MX': 'Spanish (Mexico)',
    'fr-FR': 'French',
    'de-DE': 'German',
    'it-IT': 'Italian',
    'pt-BR': 'Portuguese (Brazil)',
    'ru-RU': 'Russian',
    'zh-CN': 'Chinese (Mandarin)',
    'ja-JP': 'Japanese',
    'nl-NL': 'Dutch',
    'no-NO': 'Norwegian',
    'sv-SE': 'Swedish',
    'da-DK': 'Danish',
    'fi-FI': 'Finnish',
    'pl-PL': 'Polish',
    'uk-UA': 'Ukrainian',
    'hi-IN': 'Hindi',
    'ar-JO': 'Arabic',
  }
  return languageMap[langCode] || langCode
}

const getLanguageFlag = (langCode: string): string => {
  const flagMap: Record<string, string> = {
    'en-US': '🇺🇸',
    'en-GB': '🇬🇧',
    'es-ES': '🇪🇸',
    'es-MX': '🇲🇽',
    'fr-FR': '🇫🇷',
    'de-DE': '🇩🇪',
    'it-IT': '🇮🇹',
    'pt-BR': '🇧🇷',
    'ru-RU': '🇷🇺',
    'zh-CN': '🇨🇳',
    'ja-JP': '🇯🇵',
    'nl-NL': '🇳🇱',
    'no-NO': '🇳🇴',
    'sv-SE': '🇸🇪',
    'da-DK': '🇩🇰',
    'fi-FI': '🇫🇮',
    'pl-PL': '🇵🇱',
    'uk-UA': '🇺🇦',
    'hi-IN': '🇮🇳',
    'ar-JO': '🇯🇴',
  }
  return flagMap[langCode] || '🌍'
}

const getVoiceDisplayName = (voice: Voice): string => {
  const quality = getVoiceQuality(voice.name)
  const genderIcon =
    voice.gender === 'male' ? '👨' : voice.gender === 'female' ? '👩' : '👥'
  return `${genderIcon} ${voice.description || voice.name} (${quality})`
}

const getVoiceQuality = (voiceName: string): string => {
  if (voiceName.includes('-x_low')) return 'x_low'
  if (voiceName.includes('-low')) return 'low'
  if (voiceName.includes('-medium')) return 'medium'
  if (voiceName.includes('-high')) return 'high'
  return 'unknown'
}

const previewVoice = async () => {
  if (!props.currentSettings.localTtsVoice || isPreviewingVoice.value) return

  isPreviewingVoice.value = true
  try {
    await backendApi.initialize()

    // Get sample text based on language
    const selectedVoice = availableVoices.value.find(
      v => v.name === props.currentSettings.localTtsVoice
    )
    const sampleTexts: Record<string, string> = {
      'en-US': 'Hello! This is a preview of the Amy voice.',
      'en-GB': 'Good day! This is a preview of this British voice.',
      'es-ES': 'Hola, este es un ejemplo de esta voz en español.',
      'es-MX': 'Hola, este es un ejemplo de esta voz mexicana.',
      'fr-FR': 'Bonjour, ceci est un exemple de cette voix française.',
      'de-DE': 'Hallo, das ist ein Beispiel dieser deutschen Stimme.',
      'it-IT': 'Ciao, questo è un esempio di questa voce italiana.',
      'pt-BR': 'Olá, este é um exemplo desta voz brasileira.',
      'ru-RU': 'Привет, это пример этого русского голоса.',
      'zh-CN': '你好，这是这个中文声音的示例。',
      'ja-JP': 'こんにちは、これはこの日本語の音声のサンプルです。',
      'nl-NL': 'Hallo, dit is een voorbeeld van deze Nederlandse stem.',
      'no-NO': 'Hei, dette er et eksempel på denne norske stemmen.',
      'sv-SE': 'Hej, det här är ett exempel på denna svenska röst.',
      'da-DK': 'Hej, dette er et eksempel på denne danske stemme.',
      'fi-FI': 'Hei, tämä on esimerkki tästä suomalaisesta äänestä.',
      'pl-PL': 'Cześć, to jest przykład tego polskiego głosu.',
      'uk-UA': 'Привіт, це приклад цього українського голосу.',
      'hi-IN': 'नमस्ते, यह इस हिंदी आवाज़ का उदाहरण है।',
      'ar-JO': 'مرحبا، هذا مثال على هذا الصوت العربي.',
    }

    const sampleText =
      sampleTexts[selectedVoice?.language || 'en-US'] ||
      'Hello, this is a voice preview.'

    const result = await backendApi.synthesizeSpeech(
      sampleText,
      props.currentSettings.localTtsVoice
    )

    // Play the audio
    const audioData = new Uint8Array(result.audio)
    const blob = new Blob([audioData], { type: 'audio/wav' })
    const audioUrl = URL.createObjectURL(blob)
    const audio = new Audio(audioUrl)

    audio.play().catch(console.error)

    // Clean up URL after playing
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(audioUrl)
    })
  } catch (error) {
    console.warn('Failed to preview voice:', error)
  } finally {
    isPreviewingVoice.value = false
  }
}

const refreshVoices = async () => {
  if (isRefreshingVoices.value) return

  isRefreshingVoices.value = true
  try {
    await backendApi.initialize()
    const voices = await backendApi.getAvailableVoices()
    availableVoices.value = voices
    console.log('Available voices loaded:', voices)
  } catch (error) {
    console.warn('Failed to load voices:', error)
    availableVoices.value = []
  } finally {
    isRefreshingVoices.value = false
  }
}

const onVoiceChange = async () => {
  try {
    await backendApi.initialize()
    await backendApi.setDefaultVoice(props.currentSettings.localTtsVoice)
    console.log('Default voice updated:', props.currentSettings.localTtsVoice)
  } catch (error) {
    console.warn('Failed to update default voice:', error)
  }
}

onMounted(async () => {
  updateServiceStatus()
  statusInterval = setInterval(updateServiceStatus, 10000) // Check every 10 seconds

  // Load voices if local TTS is selected
  if (props.currentSettings.ttsProvider === 'local') {
    await refreshVoices()
  }

  await refreshRagStats()
})

// Watch for TTS provider changes to load voices
watch(
  () => props.currentSettings.ttsProvider,
  async newProvider => {
    if (newProvider === 'local') {
      await refreshVoices()
    }
  }
)

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }
})

const refreshRagStats = async () => {
  try {
    const result = await window.ipcRenderer.invoke('rag:stats')
    if (result.success && result.data) {
      ragStats.value = result.data
    }
  } catch (error) {
    console.warn('Failed to load RAG stats:', error)
  }
}

const selectRagPaths = async () => {
  try {
    const result = await window.ipcRenderer.invoke('rag:select-paths')
    if (!result.success || !Array.isArray(result.data)) {
      return
    }
    const updated = Array.from(
      new Set([...props.currentSettings.ragPaths, ...result.data])
    )
    emit('update:setting', 'ragPaths', updated)
    await indexRagPaths(updated)
  } catch (error) {
    console.warn('Failed to select RAG paths:', error)
  }
}

const indexRagPaths = async (paths: string[]) => {
  const normalizedPaths = Array.from(paths || []).map(String)
  if (normalizedPaths.length === 0) return
  isIndexingRag.value = true
  ragStatusMessage.value = 'Indexing...'
  try {
    const result = await window.ipcRenderer.invoke('rag:index-paths', {
      paths: normalizedPaths,
      recursive: true,
    })
    if (result.success && result.data) {
      ragStatusMessage.value = `Indexed ${result.data.indexed}, skipped ${result.data.skipped}`
    } else {
      ragStatusMessage.value = result.error || 'Indexing failed'
    }
  } catch (error) {
    ragStatusMessage.value = 'Indexing failed'
  } finally {
    isIndexingRag.value = false
    await refreshRagStats()
  }
}

const reindexRag = async () => {
  await indexRagPaths(props.currentSettings.ragPaths)
}

const clearRagIndex = async () => {
  isIndexingRag.value = true
  ragStatusMessage.value = 'Clearing index...'
  try {
    await window.ipcRenderer.invoke('rag:clear')
    ragStatusMessage.value = 'Index cleared'
  } catch (error) {
    ragStatusMessage.value = 'Failed to clear index'
  } finally {
    isIndexingRag.value = false
    await refreshRagStats()
  }
}

const removeRagPath = (pathItem: string) => {
  const updated = props.currentSettings.ragPaths.filter(
    item => item !== pathItem
  )
  emit('update:setting', 'ragPaths', updated)
  removeRagDocuments(pathItem)
}

const removeRagDocuments = async (pathItem: string) => {
  isIndexingRag.value = true
  ragStatusMessage.value = 'Removing documents...'
  try {
    const result = await window.ipcRenderer.invoke('rag:remove-paths', {
      paths: [pathItem],
    })
    if (result.success && result.data) {
      ragStatusMessage.value = `Removed ${result.data.removed} documents`
    } else {
      ragStatusMessage.value = result.error || 'Failed to remove documents'
    }
  } catch (error) {
    ragStatusMessage.value = 'Failed to remove documents'
  } finally {
    isIndexingRag.value = false
    await refreshRagStats()
  }
}

const resetVadDefaults = () => {
  emit('update:setting', 'vadSpeechThreshold', 0.5)
  emit('update:setting', 'vadMinSpeechDuration', 500)
  emit('update:setting', 'vadMinAudioEnergy', 0.02)
}

</script>
