import { reactive, onMounted, onUnmounted } from 'vue'

interface GoogleAuthStatus {
  isAuthenticated: boolean
  authInProgress: boolean
  isLoading: boolean
  error: string | null
  message: string | null
}

export function useGoogleAuth() {
  const googleAuthStatus = reactive<GoogleAuthStatus>({
    isAuthenticated: false,
    authInProgress: false,
    isLoading: false,
    error: null,
    message: null,
  })

  async function checkGoogleAuthStatus() {
    googleAuthStatus.isLoading = true
    googleAuthStatus.error = null
    try {
      const result = await window.ipcRenderer.invoke(
        'google-calendar:check-auth-status'
      )
      if (result.success)
        googleAuthStatus.isAuthenticated = result.isAuthenticated
    } catch (e: any) {
      googleAuthStatus.error = 'Error checking auth status: ' + e.message
    } finally {
      googleAuthStatus.isLoading = false
    }
  }

  async function connectGoogleServices() {
    googleAuthStatus.isLoading = true
    googleAuthStatus.authInProgress = true
    googleAuthStatus.error = null
    googleAuthStatus.message = null
    try {
      const result = await window.ipcRenderer.invoke(
        'google-calendar:get-auth-url'
      )
      if (result.success) googleAuthStatus.message = result.message
      else {
        googleAuthStatus.error =
          result.error || 'Failed to start Google authentication.'
        googleAuthStatus.authInProgress = false
      }
    } catch (e: any) {
      googleAuthStatus.error = 'Error initiating auth: ' + e.message
      googleAuthStatus.authInProgress = false
    } finally {
      googleAuthStatus.isLoading = false
    }
  }

  async function disconnectGoogleServices() {
    googleAuthStatus.isLoading = true
    googleAuthStatus.error = null
    googleAuthStatus.message = 'Disconnecting...'
    try {
      const result = await window.ipcRenderer.invoke('google-calendar:disconnect')
      if (result.success) {
        googleAuthStatus.isAuthenticated = false
        googleAuthStatus.authInProgress = false
        googleAuthStatus.message = result.message
      } else {
        googleAuthStatus.error =
          result.error || 'Failed to disconnect from Google.'
        googleAuthStatus.message = null
      }
    } catch (e: any) {
      googleAuthStatus.error = 'Error disconnecting: ' + e.message
      googleAuthStatus.message = null
    } finally {
      googleAuthStatus.isLoading = false
    }
  }

  function handleGoogleAuthSuccess(event: any, message: string) {
    googleAuthStatus.isAuthenticated = true
    googleAuthStatus.authInProgress = false
    googleAuthStatus.message = message
    googleAuthStatus.error = null
  }

  function handleGoogleAuthError(event: any, errorMsg: string) {
    googleAuthStatus.isAuthenticated = false
    googleAuthStatus.authInProgress = false
    googleAuthStatus.error = `Authentication failed: ${errorMsg}`
    googleAuthStatus.message = null
  }

  onMounted(async () => {
    await checkGoogleAuthStatus()
    if (window.ipcRenderer) {
      window.ipcRenderer.on(
        'google-auth-loopback-success',
        handleGoogleAuthSuccess
      )
      window.ipcRenderer.on('google-auth-loopback-error', handleGoogleAuthError)
    }
  })

  onUnmounted(() => {
    if (window.ipcRenderer) {
      window.ipcRenderer.off(
        'google-auth-loopback-success',
        handleGoogleAuthSuccess
      )
      window.ipcRenderer.off('google-auth-loopback-error', handleGoogleAuthError)
    }
  })

  return {
    googleAuthStatus,
    checkGoogleAuthStatus,
    connectGoogleServices,
    disconnectGoogleServices,
  }
}