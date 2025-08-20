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

function isBrowserContextToolEnabled(settings: any): boolean {
  return settings?.assistantTools?.includes('browser_context') || false
}

// Disable hardware acceleration for Windows 7 and to prevent SharedImageManager errors
if (os.release().startsWith('6.1') || process.platform === 'win32') {
  app.disableHardwareAcceleration()
}
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

async function handleContextAction(actionData: any) {
  try {
    const { action, selectedText, url, title } = actionData

    let prompt = ''
    switch (action) {
      case 'fact_check':
        prompt = `Please fact-check the following information using web search. Determine if the information is accurate, misleading, or false. Provide a clear assessment and cite sources:\n\n"${selectedText}"\n\nFrom: ${title} (${url})`
        break
      case 'summarize':
        prompt = `Please summarize the following content in a clear and concise manner:\n\n"${selectedText}"\n\nFrom: ${title} (${url})`
        break
      case 'tell_more':
        prompt = `Please provide more detailed information about the following topic using web search. Give me additional context, background, and related information:\n\n"${selectedText}"\n\nFrom: ${title} (${url})`
        break
      default:
        return
    }

    const mainWindow = getMainWindow()
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('context-action', {
        prompt,
        source: {
          selectedText,
          url,
          title,
          action,
        },
      })
    }
  } catch (error) {
    console.error('[WebSocket] Error handling context action:', error)
  }
}

function startWebSocketServer() {
  const setupWebSocketHandlers = (server: WebSocketServer, port: number) => {
    console.log(
      `[WebSocket] WebSocket server listening at ws://localhost:${port}`
    )

    const pendingRequests = new Map<
      string,
      { resolve: (value: any) => void; reject: (error: any) => void }
    >()

    server.on('connection', ws => {
      ws.on('message', async message => {
        try {
          const data = JSON.parse(message.toString())

          if (data.type === 'browser_context_response') {
            const mainWindow = getMainWindow()
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('websocket:response', data)
            }
          } else if (data.type === 'context_action') {
            await handleContextAction(data.data)
          }
        } catch (error) {
          console.error('[WebSocket] Error processing message:', error)
        }
      })
    })
  }

  loadSettings()
    .then(settings => {
      const websocketPort = settings?.websocketPort || 5421

      try {
        wss = new WebSocketServer({ port: websocketPort })
        setupWebSocketHandlers(wss, websocketPort)
      } catch (error) {
        console.error(
          `[WebSocket] Failed to create WebSocket server on port ${websocketPort}:`,
          error
        )
        throw error
      }
    })
    .catch(error => {
      console.error(
        '[WebSocket] Failed to load settings, using default port 5421:',
        error
      )

      try {
        wss = new WebSocketServer({ port: 5421 })
        setupWebSocketHandlers(wss, 5421)
      } catch (serverError) {
        console.error(
          '[WebSocket] Failed to create WebSocket server on default port 5421:',
          serverError
        )
        wss = null
      }
    })
}

export function getWebSocketServer() {
  return wss
}

export { startWebSocketServer }

export function stopWebSocketServer() {
  if (wss) {
    console.log('[WebSocket] Stopping WebSocket server')
    wss.close(() => {
      console.log('[WebSocket] WebSocket server stopped')
    })
    wss = null
  }
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

  if (initialSettings && isBrowserContextToolEnabled(initialSettings)) {
    console.log(
      '[Main App Ready] browser_context tool is enabled, starting WebSocket server'
    )
    startWebSocketServer()
  } else {
    console.log(
      '[Main App Ready] browser_context tool is disabled, skipping WebSocket server startup'
    )
  }
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
