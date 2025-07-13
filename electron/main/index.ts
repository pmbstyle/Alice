import { app, session } from 'electron'
import {
  initializeThoughtVectorStore,
  ensureSaveOnQuit as ensureThoughtStoreSave,
} from './thoughtVectorStore'
import {
  initializeSchedulerDB,
  loadAndScheduleAllTasks,
  shutdownScheduler,
} from './schedulerManager'
import { loadSettings } from './settingsManager'
import path from 'node:path'
import os from 'node:os'

import {
  createMainWindow,
  createOverlayWindow,
  cleanupWindows,
  registerCustomProtocol,
  getMainWindow,
} from './windowManager'
import { registerIPCHandlers, registerGoogleIPCHandlers } from './ipcManager'
import {
  registerMicrophoneToggleHotkey,
  registerMutePlaybackHotkey,
  registerTakeScreenshotHotkey,
  unregisterAllHotkeys,
} from './hotkeyManager'
import { initializeUpdater, checkForUpdates } from './updaterManager'
import { registerAuthIPCHandlers, stopAuthServer } from './authManager'
import DesktopManager from './desktopManager'

const USER_DATA_PATH = app.getPath('userData')
const GENERATED_IMAGES_FULL_PATH = path.join(USER_DATA_PATH, 'generated_images')

let isHandlingQuit = false

if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

function initializeManagers(): void {
  new DesktopManager()
  initializeUpdater()

  registerIPCHandlers()
  registerGoogleIPCHandlers()
  registerAuthIPCHandlers()
}

app.on('ready', () => {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission === 'media') {
        callback(true)
      } else {
        callback(false)
      }
    }
  )
})

app.whenReady().then(async () => {
  initializeManagers()

  registerCustomProtocol(GENERATED_IMAGES_FULL_PATH)

  const initialSettings = await loadSettings()
  if (initialSettings) {
    registerMicrophoneToggleHotkey(initialSettings.microphoneToggleHotkey)
    registerMutePlaybackHotkey(initialSettings.mutePlaybackHotkey)
    registerTakeScreenshotHotkey(initialSettings.takeScreenshotHotkey)
  } else {
    console.warn('No initial settings found or settings failed to load.')
    const defaultFallbackSettings = {
      microphoneToggleHotkey: 'Alt+M',
      mutePlaybackHotkey: 'Alt+S',
      takeScreenshotHotkey: 'Alt+C',
    }
    registerMicrophoneToggleHotkey(
      defaultFallbackSettings.microphoneToggleHotkey
    )
    registerMutePlaybackHotkey(defaultFallbackSettings.mutePlaybackHotkey)
    registerTakeScreenshotHotkey(defaultFallbackSettings.takeScreenshotHotkey)
  }

  try {
    console.log(
      '[Main App Ready] Attempting to initialize Thought Vector Store...'
    )
    await initializeThoughtVectorStore()
    console.log(
      '[Main App Ready] Thought Vector Store initialization complete.'
    )
  } catch (error) {
    console.error(
      '[Main App Ready] CRITICAL ERROR during Thought Vector Store initialization:',
      error
    )
  }

  try {
    console.log('[Main App Ready] Initializing Task Scheduler...')
    initializeSchedulerDB()
    await loadAndScheduleAllTasks()
    console.log('[Main App Ready] Task Scheduler initialization complete.')
  } catch (error) {
    console.error('[Main App Ready] ERROR during Task Scheduler initialization:', error)
  }

  await createMainWindow()
  await createOverlayWindow()
  checkForUpdates()
})

app.on('before-quit', async event => {
  if (isHandlingQuit) {
    return
  }
  isHandlingQuit = true
  unregisterAllHotkeys()
  stopAuthServer()
  shutdownScheduler()
  console.log('[Main Index] Before quit: Performing cleanup...')
  event.preventDefault()

  try {
    await ensureThoughtStoreSave()
    console.log('[Main Index] All cleanup tasks complete. Quitting now.')
  } catch (err) {
    console.error('[Main Index] Error during before-quit cleanup:', err)
  } finally {
    app.exit()
  }
})

app.on('window-all-closed', () => {
  cleanupWindows()
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', (event, commandLine, workingDirectory) => {
  const win = getMainWindow()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const { BrowserWindow } = require('electron')
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createMainWindow()
  }
})

app.on('certificate-error', (event, webContents, url, err, certificate, cb) => {
  if (err)
    console.error(
      'Certificate error for URL:',
      url,
      err.message ? err.message : err
    )

  if (
    url.startsWith('https://192.168.') ||
    url.startsWith('https://localhost')
  ) {
    console.warn(`Bypassing certificate error for local/dev URL: ${url}`)
    event.preventDefault()
    cb(true)
  } else {
    cb(false)
  }
})
