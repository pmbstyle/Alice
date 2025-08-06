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
import { WebSocketServer } from 'ws'

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
let wss: WebSocketServer | null = null

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

function startWebSocketServer() {
  loadSettings()
    .then(settings => {
      const websocketPort = settings?.websocketPort || 5421
      wss = new WebSocketServer({ port: websocketPort })
      console.log(
        `[WebSocket] WebSocket server listening at ws://localhost:${websocketPort}`
      )
    })
    .catch(error => {
      console.error(
        '[WebSocket] Failed to load settings, using default port 5421:',
        error
      )
      wss = new WebSocketServer({ port: 5421 })
      console.log(
        '[WebSocket] WebSocket server listening at ws://localhost:5421'
      )
    })

  const pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (error: any) => void }
  >()

  wss.on('connection', ws => {
    console.log('[WebSocket] Chrome Extension connected via WebSocket')

    ws.on('message', message => {
      try {
        const data = JSON.parse(message.toString())
        console.log('[WebSocket] From Chrome Extension:', data)
        console.log('[WebSocket] Message type:', data.type)
        console.log('[WebSocket] Message requestId:', data.requestId || 'none')

        if (data.type === 'browser_context_response') {
          console.log(
            '[WebSocket] Browser context response received:',
            data.requestId
          )
          console.log('[WebSocket] Response data:', data.data)

          const mainWindow = getMainWindow()
          if (mainWindow && mainWindow.webContents) {
            console.log('[WebSocket] Sending response to main window')
            mainWindow.webContents.send('websocket:response', data)
          } else {
            console.error(
              '[WebSocket] Main window not available for response routing'
            )
          }
        } else if (data.type === 'ping') {
          console.log('[WebSocket] Ping received from extension')
        } else {
          console.log('[WebSocket] Unhandled message type:', data.type)
        }
      } catch (error) {
        console.error('[WebSocket] Error processing message:', error)
        console.error('[WebSocket] Raw message:', message.toString())
      }
    })

    ws.on('close', () => {
      console.log('[WebSocket] WebSocket disconnected')
    })
  })
}

export function getWebSocketServer() {
  return wss
}

export function restartWebSocketServer() {
  console.log(
    '[WebSocket] Restarting WebSocket server with new port configuration'
  )

  if (wss) {
    wss.close(() => {
      console.log('[WebSocket] Existing WebSocket server closed')
      startWebSocketServer()
    })
  } else {
    startWebSocketServer()
  }
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
    console.error(
      '[Main App Ready] ERROR during Task Scheduler initialization:',
      error
    )
  }

  await createMainWindow()
  await createOverlayWindow()
  checkForUpdates()
  startWebSocketServer()
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
  console.error('Certificate error for URL:', url, err)

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
