import { globalShortcut } from 'electron'
import { getMainWindow } from './windowManager'

type HotkeyType = 'microphone' | 'mutePlayback' | 'takeScreenshot'

interface HotkeyRegistration {
  type: HotkeyType
  accelerator: string | null
  callback: () => void
}

const currentHotkeys = new Map<HotkeyType, string>()

export function registerHotkey(
  type: HotkeyType,
  accelerator: string | undefined,
  callback: () => void
): void {
  const currentAccelerator = currentHotkeys.get(type)
  if (currentAccelerator) {
    globalShortcut.unregister(currentAccelerator)
    console.log(
      `[HotkeyManager] Unregistered ${type} hotkey: ${currentAccelerator}`
    )
    currentHotkeys.delete(type)
  }

  if (accelerator && accelerator.trim() !== '') {
    try {
      const success = globalShortcut.register(accelerator, callback)

      if (success) {
        console.log(`[HotkeyManager] Registered ${type} hotkey: ${accelerator}`)
        currentHotkeys.set(type, accelerator)
      } else {
        console.error(
          `[HotkeyManager] Failed to register ${type} hotkey: ${accelerator}. It might be in use by another application or an invalid combination.`
        )
        const win = getMainWindow()
        win?.webContents.send('show-notification', {
          type: 'error',
          message: `Failed to register ${type} hotkey: ${accelerator}. It may be in use.`,
        })
      }
    } catch (error) {
      console.error(
        `[HotkeyManager] Error registering ${type} hotkey: ${accelerator}`,
        error
      )
      const win = getMainWindow()
      win?.webContents.send('show-notification', {
        type: 'error',
        message: `Error registering ${type} hotkey: ${accelerator}.`,
      })
    }
  } else {
    console.log(`[HotkeyManager] No ${type} hotkey provided or it was cleared.`)
  }
}

export function registerMicrophoneToggleHotkey(
  accelerator: string | undefined
): void {
  registerHotkey('microphone', accelerator, () => {
    console.log(
      `[HotkeyManager] Microphone toggle hotkey pressed: ${accelerator}`
    )
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('global-hotkey-mic-toggle')
      console.log(`[HotkeyManager] Sent microphone toggle event to renderer`)
    } else {
      console.warn(
        `[HotkeyManager] Main window not available for microphone toggle`
      )
    }
  })
}

export function registerMutePlaybackHotkey(
  accelerator: string | undefined
): void {
  registerHotkey('mutePlayback', accelerator, () => {
    console.log(`[HotkeyManager] Mute playback hotkey pressed: ${accelerator}`)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('global-hotkey-mute-playback')
      console.log(`[HotkeyManager] Sent mute playback event to renderer`)
    } else {
      console.warn(
        `[HotkeyManager] Main window not available for mute playback`
      )
    }
  })
}

export function registerTakeScreenshotHotkey(
  accelerator: string | undefined
): void {
  registerHotkey('takeScreenshot', accelerator, () => {
    console.log(
      `[HotkeyManager] Take screenshot hotkey pressed: ${accelerator}`
    )
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('global-hotkey-take-screenshot')
      console.log(`[HotkeyManager] Sent take screenshot event to renderer`)
    } else {
      console.warn(
        `[HotkeyManager] Main window not available for take screenshot`
      )
    }
  })
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
  currentHotkeys.clear()
  console.log('[HotkeyManager] All hotkeys unregistered')
}

export function getCurrentHotkeys(): Map<HotkeyType, string> {
  return new Map(currentHotkeys)
}
