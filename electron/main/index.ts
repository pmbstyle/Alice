// Fix for hybrid graphics systems (NVIDIA + AMD): Disable GPU before any Electron initialization
// This prevents GPU process crashes on systems with multiple graphics cards
process.env.ELECTRON_DISABLE_GPU = '1'
process.env.ELECTRON_NO_SANDBOX = '1'
process.env.LIBGL_ALWAYS_SOFTWARE = '1'
process.env.GALLIUM_DRIVER = 'llvmpipe'

import { app, session } from 'electron'

app.disableHardwareAcceleration()

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
import fs from 'node:fs'
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
import { backendManager } from './backendManager'
import { setupDependencies } from '../../scripts/setup-dependencies.js'


// Global state for hot reload persistence
declare global {
  var aliceAppState:
    | {
        managersInitialized: boolean
        appInitialized: boolean
        initTimestamp: number
        initId: string
      }
    | undefined
}

const USER_DATA_PATH = app.getPath('userData')
const GENERATED_IMAGES_FULL_PATH = path.join(USER_DATA_PATH, 'generated_images')

let isHandlingQuit = false
let wss: WebSocketServer | null = null
// Use global variables to persist across hot reloads
if (!global.aliceAppState) {
  global.aliceAppState = {
    managersInitialized: false,
    appInitialized: false,
    initTimestamp: Date.now(),
    initId: Math.random().toString(36).substr(2, 9),
  }
}

let managersInitialized = global.aliceAppState.managersInitialized
let appInitialized = global.aliceAppState.appInitialized
const initId = global.aliceAppState.initId

// Prevent clustering in development
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
process.env.NODE_OPTIONS = '--max-old-space-size=4096'

const currentTime = Date.now()
const timeSinceLastInit = currentTime - global.aliceAppState.initTimestamp

console.log(
  `[Main Index ${initId}] Starting Electron main process... PID: ${process.pid}, Time since last init: ${timeSinceLastInit}ms`
)

function isBrowserContextToolEnabled(settings: any): boolean {
  return settings?.assistantTools?.includes('browser_context') || false
}

// CPU optimization for worker threads
process.env.ONNX_WEB_WEBGPU_DISABLED = 'true'
process.env.ONNX_WEB_INIT_TIMEOUT = '60000'
process.env.ONNX_WEB_WASM_ENABLE_SIMD = 'true'
process.env.UV_THREADPOOL_SIZE = '8'

if (process.platform === 'win32') app.setAppUserModelId(app.getName())

// Use Electron's built-in single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log(
    `[Main Index ${initId}] Electron single instance lock failed, quitting...`
  )
  app.quit()
  process.exit(0)
} else {
  console.log(
    `[Main Index ${initId}] Got Electron single instance lock, continuing to initialize...`
  )
}

console.log(
  `[Main Index ${initId}] About to define functions and event handlers...`
)

// Add error handlers to catch any unhandled exceptions
process.on('uncaughtException', error => {
  console.error(`[Main Index ${initId}] Uncaught Exception:`, error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error(
    `[Main Index ${initId}] Unhandled Rejection at:`,
    promise,
    'reason:',
    reason
  )
})

function initializeManagers(): void {
  if (global.aliceAppState.managersInitialized) {
    console.log(
      `[Main Index ${initId}] Managers already initialized, skipping...`
    )
    return
  }
  global.aliceAppState.managersInitialized = true

  console.log(`[Main Index ${initId}] Initializing managers...`)
  DesktopManager.getInstance()
  initializeUpdater()

  registerIPCHandlers()
  registerGoogleIPCHandlers()
  registerAuthIPCHandlers()
  console.log(`[Main Index ${initId}] Managers initialization complete.`)
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
  // Check if server is already running
  if (wss && wss.readyState === 1) {
    // 1 = OPEN
    console.log('[WebSocket] Server already running, skipping initialization')
    return
  }

  // Close existing server first
  if (wss) {
    try {
      wss.close()
      wss = null
    } catch (error) {
      console.warn('[WebSocket] Error closing existing server:', error)
    }
  }

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

    server.on('error', (error: any) => {
      console.error('[WebSocket] Server error:', error)
      if (error.code === 'EADDRINUSE') {
        console.error(`[WebSocket] Port ${port} is already in use`)
        // Try alternative ports
        tryAlternativePorts(port + 1)
      }
    })
  }

  const tryAlternativePorts = (startPort: number) => {
    const maxRetries = 5
    for (let i = 0; i < maxRetries; i++) {
      const port = startPort + i
      try {
        console.log(`[WebSocket] Trying alternative port ${port}...`)
        wss = new WebSocketServer({ port })
        setupWebSocketHandlers(wss, port)
        return // Success
      } catch (error: any) {
        if (error.code === 'EADDRINUSE') {
          console.warn(`[WebSocket] Port ${port} also in use, trying next...`)
          continue
        } else {
          console.error(`[WebSocket] Unexpected error on port ${port}:`, error)
          break
        }
      }
    }
    console.error('[WebSocket] Failed to find available port after retries')
    wss = null
  }

  loadSettings()
    .then(settings => {
      const websocketPort = settings?.websocketPort || 5421

      try {
        wss = new WebSocketServer({ port: websocketPort })
        setupWebSocketHandlers(wss, websocketPort)
      } catch (error: any) {
        console.error(
          `[WebSocket] Failed to create WebSocket server on port ${websocketPort}:`,
          error
        )
        if (error.code === 'EADDRINUSE') {
          tryAlternativePorts(websocketPort + 1)
        }
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
      } catch (serverError: any) {
        console.error(
          '[WebSocket] Failed to create WebSocket server on default port 5421:',
          serverError
        )
        if (serverError.code === 'EADDRINUSE') {
          tryAlternativePorts(5422)
        } else {
          wss = null
        }
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
    try {
      wss.close(() => {
        console.log('[WebSocket] WebSocket server stopped')
      })
    } catch (error) {
      console.warn('[WebSocket] Error stopping server:', error)
    }
    wss = null
  }
}

export function restartWebSocketServer() {
  console.log(
    '[WebSocket] Restarting WebSocket server with new port configuration'
  )

  stopWebSocketServer()

  setTimeout(() => {
    startWebSocketServer()
  }, 1000)
}

app.on('ready', () => {
  console.log(`[Main Index ${initId}] App 'ready' event fired`)
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
  console.log(
    `[Main Index ${initId}] whenReady called, appInitialized:`,
    global.aliceAppState.appInitialized
  )
  if (global.aliceAppState.appInitialized) {
    console.log(`[Main Index ${initId}] App already initialized, skipping...`)
    return
  }
  global.aliceAppState.appInitialized = true

  console.log(`[Main Index ${initId}] Starting app initialization...`)

  // Setup dependencies for out-of-box experience
  console.log(`[Main Index ${initId}] Setting up dependencies...`)
  try {
    await setupDependencies()
  } catch (error) {
    console.warn(
      `[Main Index ${initId}] Warning: Could not setup all dependencies:`,
      error
    )
  }

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

  try {
    console.log('[Main App Ready] Starting Go AI backend...')
    const backendStarted = await backendManager.start()
    if (backendStarted) {
      console.log('[Main App Ready] Go AI backend started successfully')
    } else {
      console.error('[Main App Ready] Failed to start Go AI backend')
    }
  } catch (error) {
    console.error('[Main App Ready] Error starting Go AI backend:', error)
  }

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
  stopWebSocketServer()
  console.log('[Main Index] Before quit: Performing cleanup...')
  event.preventDefault()

  const cleanupTimeout = setTimeout(() => {
    console.warn('[Main Index] Cleanup timeout reached, forcing quit...')
    app.exit(0)
  }, 5000)

  try {
    await Promise.race([
      Promise.all([ensureThoughtStoreSave(), backendManager.stop()]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Cleanup timeout')), 4000)
      ),
    ])
    console.log('[Main Index] All cleanup tasks complete. Quitting now.')
  } catch (err) {
    console.error('[Main Index] Error during before-quit cleanup:', err)
  } finally {
    clearTimeout(cleanupTimeout)
    app.exit(0)
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
