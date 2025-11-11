import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CustomAvatar, CustomAvatarsSnapshot } from '../../types/customAvatars'
import videoSpeaking from '../assets/videos/speaking.mp4'
import videoStandby from '../assets/videos/standby.mp4'
import videoThinking from '../assets/videos/thinking.mp4'
import videoConfig from '../assets/videos/config.mp4'
import { useSettingsStore } from './settingsStore'

interface OperationResult<T> {
  success: boolean
  data?: T
  error?: string
}

const builtInAvatar: CustomAvatar = {
  id: 'alice',
  name: 'Alice',
  folderName: 'Alice',
  source: 'builtin',
  stateVideos: {
    speaking: videoSpeaking,
    standby: videoStandby,
    thinking: videoThinking,
    config: videoConfig,
  },
  previewVideo: videoStandby,
}

export const useCustomAvatarsStore = defineStore('customAvatars', () => {
  const customAvatars = ref<CustomAvatar[]>([])
  const customizationRoot = ref('user-customization/custom-avatars')
  const isLoading = ref(false)
  const isRefreshing = ref(false)
  const error = ref<string | null>(null)
  const initialized = ref(false)
  const lastUpdated = ref<number | null>(null)

  function mergeSnapshot(snapshot: CustomAvatarsSnapshot) {
    customAvatars.value = snapshot.avatars
    customizationRoot.value = snapshot.customizationRoot
    lastUpdated.value = Date.now()
  }

  async function fetchSnapshot() {
    if (!window.customAvatarsAPI) {
      initialized.value = true
      error.value = null
      customAvatars.value = []
      return
    }

    isLoading.value = true
    error.value = null
    try {
      const response =
        (await window.customAvatarsAPI.list()) as OperationResult<CustomAvatarsSnapshot>
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Unable to load custom avatars.')
      }
      mergeSnapshot(response.data)
    } catch (err: any) {
      error.value = err?.message || 'Unable to load custom avatars.'
    } finally {
      isLoading.value = false
      initialized.value = true
    }
  }

  async function ensureInitialized() {
    if (!initialized.value) {
      await fetchSnapshot()
    }
  }

  async function refresh() {
    if (!window.customAvatarsAPI) return
    if (isRefreshing.value) return
    isRefreshing.value = true
    error.value = null
    try {
      const response =
        (await window.customAvatarsAPI.refresh()) as OperationResult<CustomAvatarsSnapshot>
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Unable to refresh custom avatars.')
      }
      mergeSnapshot(response.data)
    } catch (err: any) {
      error.value = err?.message || 'Unable to refresh custom avatars.'
      throw err
    } finally {
      isRefreshing.value = false
    }
  }

  const allAvatars = computed<CustomAvatar[]>(() => [builtInAvatar, ...customAvatars.value])

  const settingsStore = useSettingsStore()

  const activeAvatarId = computed(() => settingsStore.settings.assistantAvatar || builtInAvatar.id)

  const activeAvatar = computed<CustomAvatar>(() => {
    return (
      allAvatars.value.find(avatar => avatar.id === activeAvatarId.value) ||
      builtInAvatar
    )
  })

  const customAvatarCount = computed(() => customAvatars.value.length)

  return {
    customAvatars,
    customizationRoot,
    isLoading,
    isRefreshing,
    error,
    initialized,
    lastUpdated,
    allAvatars,
    activeAvatar,
    activeAvatarId,
    customAvatarCount,
    ensureInitialized,
    fetchSnapshot,
    refresh,
    builtInAvatar,
  }
})
