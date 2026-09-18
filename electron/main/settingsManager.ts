import { app, safeStorage } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  hasSecretValues,
  mergeSecretSettings,
  splitSecretSettings,
} from './settingsSecurity'

const SETTINGS_FILE_NAME = 'alice-settings.json'
const SECRETS_FILE_NAME = 'alice-secrets.bin'
const settingsFilePath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME)
const secretsFilePath = path.join(app.getPath('userData'), SECRETS_FILE_NAME)

// A failed protected-storage read must never be treated as an empty secret
// set: the next renderer save would otherwise overwrite the existing blob.
let protectedSecretsLoadFailed = false

export interface AppSettings {
  VITE_OPENAI_API_KEY?: string
  VITE_OPENAI_ORGANIZATION?: string
  VITE_OPENAI_PROJECT?: string
  VITE_OPENAI_ASSISTANT_ID?: string
  VITE_OPENROUTER_API_KEY?: string
  VITE_ZAI_API_KEY?: string
  VITE_MINIMAX_API_KEY?: string
  VITE_DEEPSEEK_API_KEY?: string
  VITE_API_ROUTE_API_KEY?: string
  VITE_GROQ_API_KEY?: string
  sttProvider?: 'openai' | 'groq' | 'transformers'
  aiProvider?:
    | 'openai'
    | 'openrouter'
    | 'ollama'
    | 'lm-studio'
    | 'zai'
    | 'minimax'
    | 'deepseek'
    | 'api-route'
    | 'codex'

  // Transformers STT settings
  transformersModel?: string
  transformersDevice?: 'webgpu' | 'wasm'
  transformersQuantization?: 'fp32' | 'fp16' | 'q8' | 'q4'
  transformersEnableFallback?: boolean
  transformersWakeWordEnabled?: boolean
  transformersWakeWord?: string

  ollamaBaseUrl?: string
  lmStudioBaseUrl?: string
  zaiBaseUrl?: string
  minimaxBaseUrl?: string
  deepseekBaseUrl?: string
  codexAuthConnected?: boolean
  codexAccountLabel?: string

  assistantModel?: string
  assistantSystemPrompt?: string
  assistantTemperature?: number
  assistantTopP?: number
  assistantReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  assistantVerbosity?: 'low' | 'medium' | 'high'
  assistantTools?: string[]
  assistantAvatar?: string
  mcpServersConfig?: string
  MAX_HISTORY_MESSAGES_FOR_API?: number
  SUMMARIZATION_MESSAGE_COUNT?: number
  SUMMARIZATION_MODEL?: string
  SUMMARIZATION_SYSTEM_PROMPT?: string
  ttsProvider?: 'openai' | 'local'
  ttsVoice?:
    | 'alloy'
    | 'ash'
    | 'ballad'
    | 'coral'
    | 'echo'
    | 'fable'
    | 'nova'
    | 'onyx'
    | 'sage'
    | 'shimmer'
    | 'verse'
    | 'marin'
    | 'cedar'
  localTtsVoice?: string
  embeddingProvider?: 'openai' | 'local'
  ragEnabled?: boolean
  ragPaths?: string[]
  ragTopK?: number
  ragMaxContextChars?: number

  microphoneToggleHotkey?: string
  mutePlaybackHotkey?: string
  takeScreenshotHotkey?: string

  VITE_JACKETT_API_KEY?: string
  VITE_JACKETT_URL?: string
  VITE_QB_URL?: string
  VITE_QB_USERNAME?: string
  VITE_QB_PASSWORD?: string

  VITE_TAVILY_API_KEY?: string

  VITE_SEARXNG_URL?: string
  VITE_SEARXNG_API_KEY?: string

  websocketPort?: number

  approvedCommands?: string[]
  onboardingCompleted?: boolean
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const { publicSettings, secrets, hadSecretFields } = splitSecretSettings(
      settings as Record<string, unknown>
    )
    const secretValues = secrets as Record<string, unknown>

    if (hasSecretValues(secrets)) {
      if (protectedSecretsLoadFailed) {
        throw new Error(
          'Protected secret storage is unavailable. Unlock the system keychain before changing credentials.'
        )
      }
      await saveEncryptedSecrets(secretValues)
    } else if (hadSecretFields && (await fileExists(secretsFilePath))) {
      if (protectedSecretsLoadFailed) {
        console.warn(
          '[Settings Security] Preserving protected secrets because the previous load failed.'
        )
      } else {
        await saveEncryptedSecrets({})
      }
    }

    await writePrivateFile(
      settingsFilePath,
      JSON.stringify(publicSettings, null, 2),
      'utf8'
    )
    console.log('Settings saved to:', settingsFilePath)
  } catch (error) {
    console.error('Failed to save settings:', error)
    throw error
  }
}

export async function loadSettings(): Promise<AppSettings | null> {
  try {
    await fs.access(settingsFilePath)
    const jsonData = await fs.readFile(settingsFilePath, 'utf-8')
    const settings = JSON.parse(jsonData) as Record<string, unknown>
    const splitSettings = splitSecretSettings(settings)
    let secrets: Record<string, unknown> = {}
    let protectedSecretsFileExists = false

    try {
      protectedSecretsFileExists = await fileExists(secretsFilePath)
      if (protectedSecretsFileExists) {
        secrets = await loadEncryptedSecrets()
        protectedSecretsLoadFailed = false
      } else {
        protectedSecretsLoadFailed = false
      }

      if (splitSettings.hadSecretFields) {
        if (hasSecretValues(splitSettings.secrets)) {
          await saveEncryptedSecrets(
            splitSettings.secrets as Record<string, unknown>
          )
          secrets = {
            ...secrets,
            ...splitSettings.secrets,
          }
        }
        await writePrivateFile(
          settingsFilePath,
          JSON.stringify(splitSettings.publicSettings, null, 2),
          'utf8'
        )
        console.log(
          '[Settings Security] Migrated plaintext secrets to protected storage.'
        )
      }
    } catch (error) {
      if (hasSecretValues(splitSettings.secrets)) {
        protectedSecretsLoadFailed = true
        console.warn(
          '[Settings Security] Protected storage is unavailable; retaining legacy secrets in memory until migration can complete.',
          error
        )
        return settings as AppSettings
      }
      if (protectedSecretsFileExists) {
        protectedSecretsLoadFailed = true
      }
      throw error
    }

    const mergedSettings = mergeSecretSettings(
      splitSettings.publicSettings,
      secrets
    ) as AppSettings
    console.log('Settings loaded from:', settingsFilePath)
    return mergedSettings
  } catch (error) {
    console.warn(
      'Failed to load settings or settings file not found:',
      getErrorMessage(error)
    )
    return null
  }
}

export async function deleteSettingsFile(): Promise<void> {
  try {
    await Promise.all([
      fs.rm(settingsFilePath, { force: true }),
      fs.rm(secretsFilePath, { force: true }),
    ])
    protectedSecretsLoadFailed = false
    console.log('Settings and protected secrets deleted.')
  } catch (error) {
    console.warn(
      'Failed to delete settings file (it may not exist):',
      getErrorMessage(error)
    )
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requireProtectedStorage(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Protected secret storage is unavailable. Unlock the system keychain and try again.'
    )
  }
}

async function saveEncryptedSecrets(
  secrets: Record<string, unknown>
): Promise<void> {
  requireProtectedStorage()
  const encrypted = safeStorage.encryptString(JSON.stringify(secrets))
  await writePrivateFile(secretsFilePath, encrypted)
  protectedSecretsLoadFailed = false
}

async function loadEncryptedSecrets(): Promise<Record<string, unknown>> {
  requireProtectedStorage()
  const encrypted = await fs.readFile(secretsFilePath)
  const decrypted = safeStorage.decryptString(encrypted)
  const parsed = JSON.parse(decrypted) as unknown

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Protected secrets file has an invalid format.')
  }

  return parsed as Record<string, unknown>
}

async function writePrivateFile(
  filePath: string,
  data: string | Buffer,
  encoding?: BufferEncoding
): Promise<void> {
  await fs.writeFile(filePath, data, { encoding, mode: 0o600 })
  await fs.chmod(filePath, 0o600)
}
