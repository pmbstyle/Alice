import { ref } from 'vue'
import { useGeneralStore } from '../stores/generalStore'
import { storeToRefs } from 'pinia'

type IpcListener = (...args: any[]) => void

export function useScreenshot() {
  const generalStore = useGeneralStore()
  const { statusMessage, isRecordingRequested, takingScreenShot } =
    storeToRefs(generalStore)

  const screenShot = ref<string>('')
  const screenshotReady = ref<boolean>(false)
  const isElectron = typeof window !== 'undefined' && (window as any)?.electron

  let handleScreenshotCapturedListener: IpcListener | null = null
  let handleOverlayClosedListener: IpcListener | null = null

  const takeScreenShot = async () => {
    if (isElectron && !takingScreenShot.value) {
      takingScreenShot.value = true
      screenshotReady.value = false
      screenShot.value = ''
      statusMessage.value = 'Taking a screenshot...'
      try {
        await window.ipcRenderer.invoke('show-overlay')
        console.log('Screenshot overlay requested.')
      } catch (error) {
        console.error('Error showing screenshot overlay:', error)
        statusMessage.value = "Error: Couldn't start screenshot"
        takingScreenShot.value = false
      }
    } else if (!isElectron) {
      statusMessage.value = 'Screenshot not available in web mode.'
    } else {
      console.log('Screenshot request ignored, already in progress.')
    }
  }

  const setupScreenshotListeners = () => {
    if (isElectron) {
      handleScreenshotCapturedListener = async () => {
        try {
          const dataURI = await window.ipcRenderer.invoke('get-screenshot')
          if (dataURI) {
            screenShot.value = dataURI
            screenshotReady.value = true
            statusMessage.value = 'Screenshot ready'
          } else {
            statusMessage.value = 'Error: Captured empty screenshot'
            screenshotReady.value = false
          }
        } catch (error) {
          console.error('Error retrieving screenshot via IPC:', error)
          statusMessage.value = 'Error retrieving screenshot'
          screenshotReady.value = false
        }
      }

      handleOverlayClosedListener = () => {
        if (takingScreenShot.value) {
          if (!screenshotReady.value) {
            statusMessage.value = isRecordingRequested.value
              ? 'Listening...'
              : 'Stand by'
          }
          takingScreenShot.value = false
        }
      }

      window.ipcRenderer.on(
        'screenshot-captured',
        handleScreenshotCapturedListener
      )
      window.ipcRenderer.on('overlay-closed', handleOverlayClosedListener)
    } else {
      console.log('Not in Electron, skipping screenshot listener setup.')
    }
  }

  const cleanupScreenshotListeners = () => {
    if (isElectron) {
      try {
        if (handleScreenshotCapturedListener) {
          window.ipcRenderer.off(
            'screenshot-captured',
            handleScreenshotCapturedListener
          )
        }
        if (handleOverlayClosedListener) {
          window.ipcRenderer.off('overlay-closed', handleOverlayClosedListener)
        }
      } catch (error) {
        console.error('Error removing screenshot IPC listeners:', error)
      } finally {
        handleScreenshotCapturedListener = null
        handleOverlayClosedListener = null
      }
    }
  }

  return {
    screenShot,
    screenshotReady,
    takeScreenShot,
    setupScreenshotListeners,
    cleanupScreenshotListeners,
  }
}
