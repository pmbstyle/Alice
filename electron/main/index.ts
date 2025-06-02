import {
  app,
  BrowserWindow,
  screen,
  shell,
  ipcMain,
  session,
  desktopCapturer,
  clipboard,
  protocol,
  globalShortcut,
} from 'electron'
import { loadSettings, saveSettings, AppSettings } from './settingsManager'
import {
  saveMemoryLocal,
  getRecentMemoriesLocal,
  updateMemoryLocal,
  deleteMemoryLocal,
  deleteAllMemoriesLocal,
} from './memoryManager'
import {
  initializeThoughtVectorStore,
  addThoughtVector,
  searchSimilarThoughts,
  deleteAllThoughtVectors,
  ensureSaveOnQuit as ensureThoughtStoreSave,
  getRecentMessagesForSummarization,
  saveConversationSummary,
  getLatestConversationSummary,
} from './thoughtVectorStore'
import * as googleAuthManager from './googleAuthManager'
import * as googleCalendarManager from './googleCalendarManager'
import * as googleGmailManager from './googleGmailManager'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { URL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const IS_DEV = !!VITE_DEV_SERVER_URL
const OAUTH_SERVER_PORT = 9876
let authServer: http.Server | null = null

const USER_DATA_PATH = app.getPath('userData')
const GENERATED_IMAGES_DIR_NAME = 'generated_images'
const GENERATED_IMAGES_FULL_PATH = path.join(
  USER_DATA_PATH,
  GENERATED_IMAGES_DIR_NAME
)

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
let screenshotDataURL: string | null = null

let isHandlingQuit = false

let currentMicToggleHotkey: string | null = null
let currentMutePlaybackHotkey: string | null = null
let currentTakeScreenshotHotkey: string | null = null

function registerMicrophoneToggleHotkey(accelerator: string | undefined) {
  if (currentMicToggleHotkey) {
    globalShortcut.unregister(currentMicToggleHotkey)
    console.log(
      `[HotkeyManager] Unregistered microphone hotkey: ${currentMicToggleHotkey}`
    )
    currentMicToggleHotkey = null
  }

  if (accelerator && accelerator.trim() !== '') {
    try {
      const success = globalShortcut.register(accelerator, () => {
        console.log(
          `[HotkeyManager] Microphone toggle hotkey pressed: ${accelerator}`
        )
        win?.webContents.send('global-hotkey-mic-toggle')
      })

      if (success) {
        console.log(
          `[HotkeyManager] Registered microphone toggle hotkey: ${accelerator}`
        )
        currentMicToggleHotkey = accelerator
      } else {
        console.error(
          `[HotkeyManager] Failed to register microphone hotkey: ${accelerator}. It might be in use by another application or an invalid combination.`
        )
        win?.webContents.send('show-notification', {
          type: 'error',
          message: `Failed to register microphone hotkey: ${accelerator}. It may be in use.`,
        })
      }
    } catch (error) {
      console.error(
        `[HotkeyManager] Error registering microphone hotkey: ${accelerator}`,
        error
      )
      win?.webContents.send('show-notification', {
        type: 'error',
        message: `Error registering microphone hotkey: ${accelerator}.`,
      })
    }
  } else {
    console.log(
      '[HotkeyManager] No microphone toggle hotkey provided or it was cleared.'
    )
  }
}

function registerMutePlaybackHotkey(accelerator: string | undefined) {
  if (currentMutePlaybackHotkey) {
    globalShortcut.unregister(currentMutePlaybackHotkey)
    console.log(
      `[HotkeyManager] Unregistered mute playback hotkey: ${currentMutePlaybackHotkey}`
    )
    currentMutePlaybackHotkey = null
  }

  if (accelerator && accelerator.trim() !== '') {
    try {
      const success = globalShortcut.register(accelerator, () => {
        console.log(
          `[HotkeyManager] Mute playback hotkey pressed: ${accelerator}`
        )
        win?.webContents.send('global-hotkey-mute-playback')
      })

      if (success) {
        console.log(
          `[HotkeyManager] Registered mute playback hotkey: ${accelerator}`
        )
        currentMutePlaybackHotkey = accelerator
      } else {
        console.error(
          `[HotkeyManager] Failed to register mute playback hotkey: ${accelerator}. It might be in use by another application or an invalid combination.`
        )
        win?.webContents.send('show-notification', {
          type: 'error',
          message: `Failed to register mute playback hotkey: ${accelerator}. It may be in use.`,
        })
      }
    } catch (error) {
      console.error(
        `[HotkeyManager] Error registering mute playback hotkey: ${accelerator}`,
        error
      )
      win?.webContents.send('show-notification', {
        type: 'error',
        message: `Error registering mute playback hotkey: ${accelerator}.`,
      })
    }
  } else {
    console.log(
      '[HotkeyManager] No mute playback hotkey provided or it was cleared.'
    )
  }
}

function registerTakeScreenshotHotkey(accelerator: string | undefined) {
  if (currentTakeScreenshotHotkey) {
    globalShortcut.unregister(currentTakeScreenshotHotkey)
    console.log(
      `[HotkeyManager] Unregistered take screenshot hotkey: ${currentTakeScreenshotHotkey}`
    )
    currentTakeScreenshotHotkey = null
  }

  if (accelerator && accelerator.trim() !== '') {
    try {
      const success = globalShortcut.register(accelerator, () => {
        console.log(
          `[HotkeyManager] Take screenshot hotkey pressed: ${accelerator}`
        )
        win?.webContents.send('global-hotkey-take-screenshot')
      })

      if (success) {
        console.log(
          `[HotkeyManager] Registered take screenshot hotkey: ${accelerator}`
        )
        currentTakeScreenshotHotkey = accelerator
      } else {
        console.error(
          `[HotkeyManager] Failed to register take screenshot hotkey: ${accelerator}. It might be in use by another application or an invalid combination.`
        )
        win?.webContents.send('show-notification', {
          type: 'error',
          message: `Failed to register take screenshot hotkey: ${accelerator}. It may be in use.`,
        })
      }
    } catch (error) {
      console.error(
        `[HotkeyManager] Error registering take screenshot hotkey: ${accelerator}`,
        error
      )
      win?.webContents.send('show-notification', {
        type: 'error',
        message: `Error registering take screenshot hotkey: ${accelerator}.`,
      })
    }
  } else {
    console.log(
      '[HotkeyManager] No take screenshot hotkey provided or it was cleared.'
    )
  }
}

function closeAuthWindowAndNotify(success: boolean, messageOrError: string) {
  if (success) {
    console.log('[AuthServer] OAuth Success:', messageOrError)
    win?.webContents.send('google-auth-loopback-success', messageOrError)
  } else {
    console.error('[AuthServer] OAuth Error:', messageOrError)
    win?.webContents.send('google-auth-loopback-error', messageOrError)
  }
}

function startAuthServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (authServer && authServer.listening) {
      console.log('[AuthServer] Server already running.')
      resolve()
      return
    }

    authServer = http.createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Bad Request: URL is missing.')
          return
        }
        const requestUrl = new URL(
          req.url,
          `http://127.0.0.1:${OAUTH_SERVER_PORT}`
        )
        const pathName = requestUrl.pathname

        if (pathName === '/oauth2callback') {
          const code = requestUrl.searchParams.get('code')
          const error = requestUrl.searchParams.get('error')

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              `<h1>Authentication Failed</h1><p>${error}</p><p>You can close this window.</p>`
            )
            closeAuthWindowAndNotify(false, `OAuth error: ${error}`)
            stopAuthServer()
          } else if (code) {
            await googleAuthManager.getTokensFromCode(code)
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              '<h1>Authentication Successful!</h1><p>You can close this browser window/tab now and return to Alice.</p>'
            )
            closeAuthWindowAndNotify(
              true,
              'Successfully authenticated with Google.'
            )
            stopAuthServer()
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              '<h1>Authentication Failed</h1><p>No authorization code or error received on callback.</p><p>You can close this window.</p>'
            )
            closeAuthWindowAndNotify(
              false,
              'No authorization code or error received on callback.'
            )
            stopAuthServer()
          }
        } else {
          console.log(`[AuthServer] Ignoring request for path: ${pathName}`)
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not Found')
        }
      } catch (e: any) {
        console.error('[AuthServer] Error processing auth request:', e)
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          '<h1>Internal Server Error</h1><p>An error occurred while processing your authentication. Please try again.</p>'
        )
        closeAuthWindowAndNotify(
          false,
          `Server error during authentication: ${e.message}`
        )
        stopAuthServer()
      }
    })

    authServer.on('error', (e: NodeJS.ErrnoException) => {
      console.error('[AuthServer] Server error:', e)
      if (e.code === 'EADDRINUSE') {
        console.error(
          `[AuthServer] Port ${OAUTH_SERVER_PORT} is already in use. Cannot start auth server.`
        )
        reject(new Error(`Port ${OAUTH_SERVER_PORT} is already in use.`))
      } else {
        reject(e)
      }
      authServer = null
    })

    authServer.listen(OAUTH_SERVER_PORT, '127.0.0.1', () => {
      console.log(
        `[AuthServer] Listening on http://127.0.0.1:${OAUTH_SERVER_PORT}`
      )
      resolve()
    })
  })
}

function stopAuthServer() {
  if (authServer) {
    authServer.close(() => {
      console.log('[AuthServer] Server stopped.')
      authServer = null
    })
  }
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'Alice',
    icon: path.join(process.env.VITE_PUBLIC!, 'app_logo.png'),
    transparent: true,
    frame: false,
    width: 500,
    height: 500,
    resizable: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(indexHtml)
  }

  win.on('closed', () => {
    win = null
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send(
      'main-process-message',
      `Alice ready at ${new Date().toLocaleString()}`
    )
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  ipcMain.on('resize', (event, arg) => {
    if (
      win &&
      arg &&
      typeof arg.width === 'number' &&
      typeof arg.height === 'number'
    ) {
      win.setSize(arg.width, arg.height)
    }
  })

  ipcMain.on('mini', (event, arg) => {
    if (win && arg && typeof arg.minimize === 'boolean') {
      const display = screen.getPrimaryDisplay()
      if (arg.minimize) {
        const x = display.bounds.width - 230
        const y = display.bounds.height - 260
        win.setPosition(x, y)
        win.setSize(210, 210)
      } else {
        const x = Math.round(display.bounds.width / 2 - 250)
        const y = Math.round(display.bounds.height / 2 - 250)
        win.setPosition(x, y)
        win.setSize(500, 500)
      }
    }
  })

  ipcMain.handle(
    'thoughtVector:add',
    async (
      event,
      {
        conversationId,
        role,
        textContent,
        embedding,
      }: {
        conversationId: string
        role: string
        textContent: string
        embedding: number[]
      }
    ) => {
      try {
        await addThoughtVector(conversationId, role, textContent, embedding)
        return { success: true }
      } catch (error) {
        console.error('IPC thoughtVector:add error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'thoughtVector:search',
    async (
      event,
      {
        queryEmbedding,
        topK,
      }: {
        queryEmbedding: number[]
        topK: number
      }
    ) => {
      try {
        const thoughtsMetadatas = await searchSimilarThoughts(
          queryEmbedding,
          topK
        )
        const thoughtTexts = thoughtsMetadatas.map(t => t.textContent)
        return { success: true, data: thoughtTexts }
      } catch (error) {
        console.error('[Main IPC thoughtVector:search] Error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('thoughtVector:delete-all', async () => {
    try {
      await deleteAllThoughtVectors()
      return { success: true }
    } catch (error) {
      console.error('IPC thoughtVector:delete-all error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'memory:save',
    async (
      event,
      {
        content,
        memoryType,
        embedding,
      }: { content: string; memoryType?: string; embedding?: number[] }
    ) => {
      try {
        const savedMemory = await saveMemoryLocal(
          content,
          memoryType,
          embedding
        )
        return { success: true, data: savedMemory }
      } catch (error) {
        console.error('IPC memory:save error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'memory:get',
    async (
      event,
      {
        limit,
        memoryType,
        queryEmbedding,
      }: { limit?: number; memoryType?: string; queryEmbedding?: number[] }
    ) => {
      try {
        const memories = await getRecentMemoriesLocal(
          limit,
          memoryType,
          queryEmbedding
        )
        return { success: true, data: memories }
      } catch (error) {
        console.error('IPC memory:get error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('memory:delete', async (event, { id }: { id: string }) => {
    try {
      const success = await deleteMemoryLocal(id)
      return { success }
    } catch (error) {
      console.error('IPC memory:delete error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'memory:update',
    async (
      event,
      {
        id,
        content,
        memoryType,
        embedding,
      }: {
        id: string
        content: string
        memoryType: string
        embedding?: number[]
      }
    ) => {
      try {
        const updatedMemory = await updateMemoryLocal(
          id,
          content,
          memoryType,
          embedding
        )
        if (updatedMemory) {
          return { success: true, data: updatedMemory }
        } else {
          return { success: false, error: 'Memory not found for update.' }
        }
      } catch (error) {
        console.error('IPC memory:update error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('memory:delete-all', async () => {
    try {
      await deleteAllMemoriesLocal()
      return { success: true }
    } catch (error) {
      console.error('IPC memory:delete-all error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'summaries:get-recent-messages',
    async (
      event,
      { limit, conversationId }: { limit: number; conversationId?: string }
    ) => {
      try {
        const messages = await getRecentMessagesForSummarization(
          limit,
          conversationId
        )
        return { success: true, data: messages }
      } catch (error) {
        console.error('IPC summaries:get-recent-messages error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'summaries:save-summary',
    async (
      event,
      {
        summaryText,
        summarizedMessagesCount,
        conversationId,
      }: {
        summaryText: string
        summarizedMessagesCount: number
        conversationId?: string
      }
    ) => {
      try {
        const summaryRecord = await saveConversationSummary(
          summaryText,
          summarizedMessagesCount,
          conversationId
        )
        return { success: true, data: summaryRecord }
      } catch (error) {
        console.error('IPC summaries:save-summary error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'summaries:get-latest-summary',
    async (event, { conversationId }: { conversationId?: string }) => {
      try {
        const summary = await getLatestConversationSummary(conversationId)
        return { success: true, data: summary }
      } catch (error) {
        console.error('IPC summaries:get-latest-summary error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('get-renderer-dist-path', async () => {
    return RENDERER_DIST
  })

  ipcMain.handle('screenshot', async (event, arg) => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: 1200,
        height: 1200,
      },
    })
    if (sources.length > 0) {
      return sources[0].thumbnail.toDataURL()
    }
    return null
  })

  ipcMain.handle('show-overlay', () => {
    if (!overlayWindow) {
      createOverlayWindow()
    }
    overlayWindow?.show()
    return true
  })

  ipcMain.handle('hide-overlay', () => {
    overlayWindow?.hide()
    win?.webContents.send('overlay-closed')
    return true
  })

  ipcMain.handle('save-screenshot', (event, dataURL: string) => {
    screenshotDataURL = dataURL
    win?.webContents.send('screenshot-captured')
    return true
  })

  ipcMain.handle('get-screenshot', () => {
    return screenshotDataURL
  })

  ipcMain.handle('focus-main-window', () => {
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
      win.moveTop()
      console.log('[Main IPC] Main window focused after screenshot')
    }
    return true
  })

  ipcMain.handle('capture-screen', async () => {
    console.log('[Main IPC] "capture-screen" invoked.')
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      console.log('[Main IPC] "capture-screen" sources found:', sources.length)
      return sources
    } catch (error) {
      console.error('[Main IPC] "capture-screen" error:', error)
      return []
    }
  })

  ipcMain.handle('settings:load', async () => {
    return await loadSettings()
  })

  ipcMain.handle(
    'settings:save',
    async (event, settingsToSave: AppSettings) => {
      try {
        const oldSettings = await loadSettings()
        await saveSettings(settingsToSave)

        if (
          oldSettings?.microphoneToggleHotkey !==
            settingsToSave.microphoneToggleHotkey ||
          (!oldSettings && settingsToSave.microphoneToggleHotkey)
        ) {
          console.log(
            '[Main IPC settings:save] Microphone toggle hotkey changed. Re-registering.'
          )
          registerMicrophoneToggleHotkey(settingsToSave.microphoneToggleHotkey)
        }

        if (
          oldSettings?.mutePlaybackHotkey !==
            settingsToSave.mutePlaybackHotkey ||
          (!oldSettings && settingsToSave.mutePlaybackHotkey)
        ) {
          console.log(
            '[Main IPC settings:save] Mute playback hotkey changed. Re-registering.'
          )
          registerMutePlaybackHotkey(settingsToSave.mutePlaybackHotkey)
        }

        if (
          oldSettings?.takeScreenshotHotkey !==
            settingsToSave.takeScreenshotHotkey ||
          (!oldSettings && settingsToSave.takeScreenshotHotkey)
        ) {
          console.log(
            '[Main IPC settings:save] Take screenshot hotkey changed. Re-registering.'
          )
          registerTakeScreenshotHotkey(settingsToSave.takeScreenshotHotkey)
        }

        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.on('close-app', () => {
    app.quit()
  })

  ipcMain.handle('image:save-generated', async (event, base64Data: string) => {
    try {
      await mkdir(GENERATED_IMAGES_FULL_PATH, { recursive: true })

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `alice_generated_${timestamp}.png`
      const absoluteFilePath = path.join(GENERATED_IMAGES_FULL_PATH, fileName)

      await writeFile(absoluteFilePath, Buffer.from(base64Data, 'base64'))

      console.log(
        '[Main IPC image:save-generated] Image saved to:',
        absoluteFilePath
      )
      return {
        success: true,
        fileName: fileName,
        absolutePathForOpening: absoluteFilePath,
      }
    } catch (error: any) {
      console.error(
        '[Main IPC image:save-generated] RAW ERROR during image save:',
        error
      )
      console.error(
        '[Main IPC image:save-generated] Error message:',
        error.message
      )
      console.error('[Main IPC image:save-generated] Error stack:', error.stack)

      const errorMessage =
        error && typeof error.message === 'string'
          ? error.message
          : 'Unknown error during image save.'
      return {
        success: false,
        error: `Failed to save image in main process: ${errorMessage}`,
      }
    }
  })

  ipcMain.handle(
    'electron:open-path',
    async (event, args: { target: string }) => {
      if (
        !args ||
        typeof args.target !== 'string' ||
        args.target.trim() === ''
      ) {
        console.error('open_path: Invalid target received:', args)
        return {
          success: false,
          message: 'Error: No valid target path, name, or URL provided.',
        }
      }

      const targetPath = args.target.trim()
      console.log(`Main process received request to open: ${targetPath}`)

      try {
        if (
          targetPath.startsWith('http://') ||
          targetPath.startsWith('https://') ||
          targetPath.startsWith('mailto:')
        ) {
          console.log(`Opening external URL: ${targetPath}`)
          await shell.openExternal(targetPath)
          return {
            success: true,
            message: `Successfully initiated opening URL: ${targetPath}`,
          }
        } else {
          console.log(`Opening path/application: ${targetPath}`)
          const errorMessage = await shell.openPath(targetPath)

          if (errorMessage) {
            console.error(
              `Failed to open path "${targetPath}": ${errorMessage}`
            )
            return {
              success: false,
              message: `Error: Could not open "${targetPath}". Reason: ${errorMessage}`,
            }
          } else {
            return {
              success: true,
              message: `Successfully opened path: ${targetPath}`,
            }
          }
        }
      } catch (error: any) {
        console.error(`Unexpected error opening target "${targetPath}":`, error)
        return {
          success: false,
          message: `Error: An unexpected issue occurred while trying to open "${targetPath}". ${error.message || ''}`,
        }
      }
    }
  )

  ipcMain.handle(
    'electron:manage-clipboard',
    async (event, args: { action: 'read' | 'write'; content?: string }) => {
      if (!args || (args.action !== 'read' && args.action !== 'write')) {
        console.error(
          'manage_clipboard: Invalid action received:',
          args?.action
        )
        return {
          success: false,
          message:
            'Error: Invalid action specified. Must be "read" or "write".',
        }
      }

      try {
        if (args.action === 'read') {
          const clipboardText = clipboard.readText()
          console.log(
            'Clipboard read:',
            clipboardText.substring(0, 100) +
              (clipboardText.length > 100 ? '...' : '')
          )
          return {
            success: true,
            message: 'Successfully read text from clipboard.',
            data: clipboardText,
          }
        } else {
          if (typeof args.content !== 'string') {
            if (args.content === undefined || args.content === null) {
              console.error(
                'manage_clipboard: Content is missing for write action.'
              )
              return {
                success: false,
                message:
                  'Error: Text content must be provided for the "write" action (can be an empty string to clear).',
              }
            }
            console.error(
              'manage_clipboard: Content must be a string for write action.'
            )
            return {
              success: false,
              message:
                'Error: Text content must be a string for the "write" action.',
            }
          }

          clipboard.writeText(args.content)
          console.log('Clipboard write successful.')
          return {
            success: true,
            message: 'Successfully wrote text to clipboard.',
          }
        }
      } catch (error: any) {
        console.error(
          `Unexpected error during clipboard action "${args.action}":`,
          error
        )
        return {
          success: false,
          message: `Error: An unexpected issue occurred during the clipboard operation. ${error.message || ''}`,
        }
      }
    }
  )
}

async function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  overlayWindow = new BrowserWindow({
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    fullscreen: false,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload,
    },
  })
  const arg = 'overlay'
  if (VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    overlayWindow.loadFile(indexHtml, { hash: arg })
  }
  overlayWindow.hide()

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
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
  protocol.registerFileProtocol('alice-image', (request, callback) => {
    const url = request.url.substring('alice-image://'.length)
    const decodedUrlPath = decodeURIComponent(url)
    const filePath = path.normalize(
      path.join(GENERATED_IMAGES_FULL_PATH, decodedUrlPath)
    )

    if (filePath.startsWith(path.normalize(GENERATED_IMAGES_FULL_PATH))) {
      callback({ path: filePath })
    } else {
      console.error(
        `[Protocol] Denied access to unsafe path: ${filePath} from URL: ${request.url}`
      )
      callback({ error: -6 })
    }
  })

  const initialSettings = await loadSettings()
  if (initialSettings) {
    console.log('Initial settings loaded in main process:', initialSettings)
    registerMicrophoneToggleHotkey(initialSettings.microphoneToggleHotkey)
    registerMutePlaybackHotkey(initialSettings.mutePlaybackHotkey)
    registerTakeScreenshotHotkey(initialSettings.takeScreenshotHotkey)
  } else {
    console.warn('No initial settings found or settings failed to load.')
    const defaultFallbackSettings = { 
      microphoneToggleHotkey: 'Alt+M',
      mutePlaybackHotkey: 'Alt+S',
      takeScreenshotHotkey: 'Alt+C'
    }
    registerMicrophoneToggleHotkey(
      defaultFallbackSettings.microphoneToggleHotkey
    )
    registerMutePlaybackHotkey(
      defaultFallbackSettings.mutePlaybackHotkey
    )
    registerTakeScreenshotHotkey(
      defaultFallbackSettings.takeScreenshotHotkey
    )
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
  createWindow()
  createOverlayWindow()
})

app.on('before-quit', async event => {
  if (isHandlingQuit) {
    return
  }
  isHandlingQuit = true
  globalShortcut.unregisterAll()
  stopAuthServer()
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
  win = null
  overlayWindow = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', (event, commandLine, workingDirectory) => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

ipcMain.handle('google-calendar:get-auth-url', async () => {
  try {
    await startAuthServer()
    const oAuth2Client = googleAuthManager.getOAuth2Client()
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.readonly',
      ],
    })
    console.log(
      '[IPC get-auth-url] Generated auth URL:',
      authUrl.substring(0, 100) + '...'
    )
    shell.openExternal(authUrl)
    return {
      success: true,
      message:
        'Please authorize in your browser. A browser window/tab has been opened.',
    }
  } catch (error: any) {
    console.error(
      '[IPC get-auth-url] Failed to start auth server or generate URL:',
      error
    )
    return {
      success: false,
      error: `Failed to initiate Google authentication: ${error.message}`,
    }
  }
})

ipcMain.handle('google-calendar:check-auth-status', async () => {
  const tokens = await googleAuthManager.loadTokens()
  return { success: true, isAuthenticated: !!tokens }
})

ipcMain.handle('google-calendar:disconnect', async () => {
  await googleAuthManager.clearTokens()
  stopAuthServer()
  return { success: true, message: 'Disconnected from Google Services.' }
})

async function withAuthenticatedClient<T>(
  operation: (authClient: any) => Promise<T>,
  serviceName: string
): Promise<T | { success: false; error: string; unauthenticated?: boolean }> {
  const authClient = await googleAuthManager.getAuthenticatedClient()
  if (!authClient) {
    return {
      success: false,
      error: `User not authenticated with ${serviceName}. Please authenticate in settings.`,
      unauthenticated: true,
    }
  }
  return operation(authClient)
}

ipcMain.handle('google-calendar:list-events', async (event, args) => {
  return withAuthenticatedClient(
    authClient =>
      googleCalendarManager.listEvents(
        authClient,
        args.calendarId,
        args.timeMin,
        args.timeMax,
        args.q,
        args.maxResults
      ),
    'Google Calendar'
  )
})

ipcMain.handle('google-calendar:create-event', async (event, args) => {
  return withAuthenticatedClient(
    authClient =>
      googleCalendarManager.createEvent(
        authClient,
        args.calendarId,
        args.eventResource
      ),
    'Google Calendar'
  )
})

ipcMain.handle('google-calendar:update-event', async (event, args) => {
  return withAuthenticatedClient(
    authClient =>
      googleCalendarManager.updateEvent(
        authClient,
        args.calendarId,
        args.eventId,
        args.eventResource
      ),
    'Google Calendar'
  )
})

ipcMain.handle('google-calendar:delete-event', async (event, args) => {
  return withAuthenticatedClient(
    authClient =>
      googleCalendarManager.deleteEvent(
        authClient,
        args.calendarId,
        args.eventId
      ),
    'Google Calendar'
  )
})

ipcMain.handle('google-gmail:list-messages', async (event, args) => {
  return withAuthenticatedClient(
    authClient =>
      googleGmailManager.listMessages({
        authClient,
        userId: args.userId,
        maxResults: args.maxResults,
        labelIds: args.labelIds,
        q: args.q,
        includeSpamTrash: args.includeSpamTrash,
      }),
    'Gmail'
  )
})

ipcMain.handle('google-gmail:get-message', async (event, args) => {
  return withAuthenticatedClient(
    authClient =>
      googleGmailManager.getMessage({
        authClient,
        userId: args.userId,
        id: args.id,
        format: args.format,
      }),
    'Gmail'
  )
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
