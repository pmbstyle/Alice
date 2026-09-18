export const SECRET_SETTING_KEYS = [
  'VITE_OPENAI_API_KEY',
  'VITE_OPENROUTER_API_KEY',
  'VITE_ZAI_API_KEY',
  'VITE_MINIMAX_API_KEY',
  'VITE_DEEPSEEK_API_KEY',
  'VITE_API_ROUTE_API_KEY',
  'VITE_GROQ_API_KEY',
  'VITE_GOOGLE_API_KEY',
  'VITE_JACKETT_API_KEY',
  'VITE_QB_PASSWORD',
  'VITE_TAVILY_API_KEY',
  'VITE_SEARXNG_API_KEY',
] as const

export type SecretSettingKey = (typeof SECRET_SETTING_KEYS)[number]

export type SettingsRecord = Record<string, unknown>

export interface SplitSettings {
  publicSettings: SettingsRecord
  secrets: Partial<Record<SecretSettingKey, string>>
  hadSecretFields: boolean
}

export function splitSecretSettings(settings: SettingsRecord): SplitSettings {
  const publicSettings: SettingsRecord = { ...settings }
  const secrets: Partial<Record<SecretSettingKey, string>> = {}
  let hadSecretFields = false

  for (const key of SECRET_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(publicSettings, key)) {
      hadSecretFields = true
      const value = publicSettings[key]
      if (typeof value === 'string' && value.length > 0) {
        secrets[key] = value
      }
      delete publicSettings[key]
    }
  }

  return { publicSettings, secrets, hadSecretFields }
}

export function mergeSecretSettings(
  publicSettings: SettingsRecord,
  secrets: SettingsRecord
): SettingsRecord {
  return { ...publicSettings, ...secrets }
}

export function hasSecretValues(
  secrets: Partial<Record<SecretSettingKey, string>>
): boolean {
  return Object.values(secrets).some(
    value => typeof value === 'string' && value.length > 0
  )
}
