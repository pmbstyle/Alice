import { reactive, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

interface CodexAuthStatus {
  available: boolean
  isAuthenticated: boolean
  authInProgress: boolean
  isLoading: boolean
  accountLabel: string
  error: string | null
  message: string | null
}

interface CodexAccountStatusPayload {
  available?: boolean
  connected?: boolean
  accountLabel?: string
  error?: string
}

export function useCodexAuth() {
  const settingsStore = useSettingsStore()
  const codexAuthStatus = reactive<CodexAuthStatus>({
    available: true,
    isAuthenticated: false,
    authInProgress: false,
    isLoading: false,
    accountLabel: '',
    error: null,
    message: null,
  })

  function syncSettings(status: CodexAccountStatusPayload) {
    const connected = Boolean(status.connected)
    const accountLabel = connected ? status.accountLabel || 'Connected' : ''
    codexAuthStatus.available = status.available !== false
    codexAuthStatus.isAuthenticated = connected
    codexAuthStatus.accountLabel = accountLabel

    settingsStore.updateSetting('codexAuthConnected', connected)
    settingsStore.updateSetting('codexAccountLabel', accountLabel)
  }

  async function checkCodexAuthStatus() {
    codexAuthStatus.isLoading = true
    codexAuthStatus.error = null
    try {
      const result = await window.ipcRenderer.invoke('codex-auth:status')
      syncSettings(result || {})
      if (result?.error) {
        codexAuthStatus.error = result.error
      }
    } catch (error: any) {
      codexAuthStatus.available = false
      codexAuthStatus.isAuthenticated = false
      codexAuthStatus.error =
        'Error checking ChatGPT Codex auth status: ' + error.message
      settingsStore.updateSetting('codexAuthConnected', false)
      settingsStore.updateSetting('codexAccountLabel', '')
    } finally {
      codexAuthStatus.isLoading = false
    }
  }

  async function startCodexAuth() {
    codexAuthStatus.isLoading = true
    codexAuthStatus.authInProgress = true
    codexAuthStatus.error = null
    codexAuthStatus.message = null
    try {
      const result = await window.ipcRenderer.invoke('codex-auth:start-login')
      if (result?.success) {
        codexAuthStatus.message =
          'ChatGPT authorization opened in your browser.'
      } else {
        codexAuthStatus.error =
          result?.error || 'Failed to start ChatGPT Codex authorization.'
        codexAuthStatus.authInProgress = false
      }
    } catch (error: any) {
      codexAuthStatus.error =
        'Error starting ChatGPT Codex authorization: ' + error.message
      codexAuthStatus.authInProgress = false
    } finally {
      codexAuthStatus.isLoading = false
    }
  }

  async function disconnectCodex() {
    codexAuthStatus.isLoading = true
    codexAuthStatus.error = null
    codexAuthStatus.message = 'Disconnecting ChatGPT Codex...'
    try {
      const result = await window.ipcRenderer.invoke('codex-auth:disconnect')
      if (result?.success) {
        syncSettings({ available: true, connected: false })
        codexAuthStatus.authInProgress = false
        codexAuthStatus.message = 'ChatGPT Codex disconnected.'
      } else {
        codexAuthStatus.error =
          result?.error || 'Failed to disconnect ChatGPT Codex.'
        codexAuthStatus.message = null
      }
    } catch (error: any) {
      codexAuthStatus.error =
        'Error disconnecting ChatGPT Codex: ' + error.message
      codexAuthStatus.message = null
    } finally {
      codexAuthStatus.isLoading = false
    }
  }

  function handleCodexLoginCompleted(event: any, payload: any) {
    codexAuthStatus.authInProgress = false
    if (payload?.success === false) {
      codexAuthStatus.isAuthenticated = false
      codexAuthStatus.error =
        payload?.error || 'ChatGPT Codex authorization failed.'
      codexAuthStatus.message = null
      return
    }
    codexAuthStatus.message = 'ChatGPT Codex authorization completed.'
    codexAuthStatus.error = null
    void checkCodexAuthStatus()
  }

  function handleCodexStatusChanged(
    event: any,
    payload: CodexAccountStatusPayload
  ) {
    codexAuthStatus.authInProgress = false
    syncSettings(payload || {})
    codexAuthStatus.error = payload?.error || null
    codexAuthStatus.message = payload?.connected
      ? 'ChatGPT Codex connected.'
      : null
  }

  function handleCodexAccountUpdated() {
    void checkCodexAuthStatus()
  }

  onMounted(async () => {
    await checkCodexAuthStatus()
    if (window.ipcRenderer) {
      window.ipcRenderer.on(
        'codex-auth-login-completed',
        handleCodexLoginCompleted
      )
      window.ipcRenderer.on(
        'codex-auth-status-changed',
        handleCodexStatusChanged
      )
      window.ipcRenderer.on('codex-auth-updated', handleCodexAccountUpdated)
    }
  })

  onUnmounted(() => {
    if (window.ipcRenderer) {
      window.ipcRenderer.off(
        'codex-auth-login-completed',
        handleCodexLoginCompleted
      )
      window.ipcRenderer.off(
        'codex-auth-status-changed',
        handleCodexStatusChanged
      )
      window.ipcRenderer.off('codex-auth-updated', handleCodexAccountUpdated)
    }
  })

  return {
    codexAuthStatus,
    checkCodexAuthStatus,
    startCodexAuth,
    disconnectCodex,
  }
}
