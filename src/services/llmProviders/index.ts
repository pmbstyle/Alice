import { useSettingsStore } from '../../stores/settingsStore'
import type { AIProviderKey } from './providerCatalog'

export type ProviderKey = AIProviderKey

export function getProviderKey(): ProviderKey {
  return useSettingsStore().config.aiProvider as ProviderKey
}
