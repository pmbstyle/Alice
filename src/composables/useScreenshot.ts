import { ref } from 'vue'
import { useGeneralStore } from '../stores/generalStore'
import { storeToRefs } from 'pinia'

export function useScreenshot() {
  const generalStore = useGeneralStore()
  const { statusMessage, takingScreenShot, isRecordingRequested } =
    storeToRefs(generalStore)

  const screenShot = ref<string>('')
  const screenshotReady = ref<boolean>(false)
  const isElectron = typeof window !== 'undefined' && window?.electron

  const takeScreenShot = async () => {
    if (!takingScreenShot.value && isElectron) {
      takingScreenShot.value = true
      statusMessage.value = 'Taking a screenshot'
      await window.electron.showOverlay()
    }
  }

  const setupScreenshotListeners = () => {
    if (isElectron) {
      window.ipcRenderer.on('screenshot-captured', async () => {
        try {
          const dataURI = await window.ipcRenderer.invoke('get-screenshot')
          screenShot.value = dataURI
          screenshotReady.value = true
          statusMessage.value = 'Screenshot ready'
        } catch (error) {
          console.error('Error retrieving screenshot:', error)
          statusMessage.value = 'Error taking screenshot'
        } finally {
          takingScreenShot.value = false
        }
      })

      window.ipcRenderer.on('overlay-closed', () => {
        takingScreenShot.value = false
        statusMessage.value = isRecordingRequested.value
          ? 'Listening'
          : 'Stand by'
      })
    }
  }

  return {
    screenShot,
    screenshotReady,
    takeScreenShot,
    setupScreenshotListeners,
  }
}
