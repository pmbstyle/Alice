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
      console.warn('Screenshot feature only available in Electron app.')
    } else {
      console.log('Screenshot request ignored, already in progress.')
    }
  }

  const setupScreenshotListeners = () => {
    if (isElectron) {
      handleScreenshotCapturedListener = async () => {
        console.log("IPC 'screenshot-captured' received.")
        try {
          const dataURI = await window.ipcRenderer.invoke('get-screenshot')
          if (dataURI) {
            screenShot.value = dataURI
            screenshotReady.value = true
            statusMessage.value = 'Screenshot ready'
            console.log('Screenshot data retrieved.')
          } else {
            console.warn('Retrieved empty screenshot data URI.')
            statusMessage.value = 'Error: Empty screenshot'
          }
        } catch (error) {
          console.error('Error retrieving screenshot via IPC:', error)
          statusMessage.value = 'Error retrieving screenshot'
        } finally {
          takingScreenShot.value = false
        }
      }

      handleOverlayClosedListener = () => {
        console.log("IPC 'overlay-closed' received.")
        if (takingScreenShot.value) {
          takingScreenShot.value = false
          if (!screenshotReady.value) {
            statusMessage.value = isRecordingRequested.value
              ? 'Listening...'
              : 'Stand by'
          }
        }
      }

      window.ipcRenderer.on(
        'screenshot-captured',
        handleScreenshotCapturedListener
      )
      window.ipcRenderer.on('overlay-closed', handleOverlayClosedListener)
      console.log('Screenshot IPC listeners attached.')
    } else {
      console.log('Not in Electron, skipping screenshot listener setup.')
    }
  }

  const cleanupScreenshotListeners = () => {
    if (isElectron) {
      try {
        s
        if (handleScreenshotCapturedListener) {
          window.ipcRenderer.off(
            'screenshot-captured',
            handleScreenshotCapturedListener
          )
        }
        if (handleOverlayClosedListener) {
          window.ipcRenderer.off('overlay-closed', handleOverlayClosedListener)
        }
        console.log('Screenshot IPC listeners removed.')
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
