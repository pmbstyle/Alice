import { useSettingsStore } from '../../stores/settingsStore'

export type ProviderKey = 'openai' | 'openrouter' | 'ollama' | 'lm-studio'

export function getProviderKey(): ProviderKey {
  return useSettingsStore().config.aiProvider as ProviderKey
}
