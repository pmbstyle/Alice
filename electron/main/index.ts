import {
  app,
  BrowserWindow,
  screen,
  shell,
  ipcMain,
  session,
  desktopCapturer,
  clipboard,
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
} from './thoughtVectorStore'
import * as googleAuthManager from './googleAuthManager'
import * as googleCalendarManager from './googleCalendarManager'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { URL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const IS_DEV = !!VITE_DEV_SERVER_URL
const OAUTH_SERVER_PORT = 9876
let authServer: http.Server | null = null

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

function closeAuthWindowAndNotify(
  winInstance: BrowserWindow | null,
  success: boolean,
  messageOrError: string
) {
  if (success) {
    console.log('[AuthServer] OAuth Success:', messageOrError)
    winInstance?.webContents.send(
      'google-auth-loopback-success',
      messageOrError
    )
  } else {
    console.error('[AuthServer] OAuth Error:', messageOrError)
    winInstance?.webContents.send('google-auth-loopback-error', messageOrError)
  }
}

function startAuthServer(mainWindow: BrowserWindow | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (authServer && authServer.listening) {
      console.log('[AuthServer] Server already running.')
      resolve()
      return
    }

    authServer = http.createServer(async (req, res) => {
      try {
        const requestUrl = new URL(
          req.url!,
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
            closeAuthWindowAndNotify(win, false, `OAuth error: ${error}`)
            stopAuthServer()
          } else if (code) {
            await googleAuthManager.getTokensFromCode(code)
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              '<h1>Authentication Successful!</h1><p>You can close this browser window/tab now and return to Alice.</p>'
            )
            closeAuthWindowAndNotify(
              win,
              true,
              'Successfully authenticated with Google Calendar.'
            )
            stopAuthServer()
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              '<h1>Authentication Failed</h1><p>No authorization code or error received on callback.</p><p>You can close this window.</p>'
            )
            closeAuthWindowAndNotify(
              win,
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
          win,
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
    icon: path.join(process.env.VITE_PUBLIC, 'app_logo.png'),
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
    // win.webContents.openDevTools() // Uncomment for debugging renderer
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
    if (win) {
      win.setSize(arg.width, arg.height)
    }
  })
  ipcMain.on('mini', (event, arg) => {
    if (win) {
      let display = screen.getPrimaryDisplay()
      if (arg.minimize) {
        let x = display.bounds.width - 230
        let y = display.bounds.height - 260
        win.setPosition(x, y)
        win.setSize(210, 210)
      } else {
        let x = display.bounds.width / 2 - 250
        let y = display.bounds.height / 2 - 250
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
      { content, memoryType }: { content: string; memoryType?: string }
    ) => {
      try {
        const savedMemory = await saveMemoryLocal(content, memoryType)
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
      { limit, memoryType }: { limit?: number; memoryType?: string }
    ) => {
      try {
        const memories = await getRecentMemoriesLocal(limit, memoryType)
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
      }: { id: string; content: string; memoryType: string }
    ) => {
      try {
        const updatedMemory = await updateMemoryLocal(id, content, memoryType)
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

  ipcMain.handle('get-renderer-dist-path', async () => {
    return RENDERER_DIST
  })

  ipcMain.handle('screenshot', async (event, arg) => {
    const source = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: 1200,
        height: 1200,
      },
    })
    return source[0].thumbnail.toDataURL()
  })

  ipcMain.handle('show-overlay', () => {
    if (!overlayWindow) {
      createOverlayWindow()
    }
    overlayWindow?.show()
  })

  ipcMain.handle('hide-overlay', () => {
    overlayWindow?.hide()
    win?.webContents.send('overlay-closed')
    return true
  })
  ipcMain.handle('save-screenshot', (event, dataURL) => {
    screenshotDataURL = dataURL
    win?.webContents.send('screenshot-captured')
    return true
  })

  ipcMain.handle('get-screenshot', () => {
    return screenshotDataURL
  })

  ipcMain.handle('settings:load', async () => {
    return await loadSettings()
  })

  ipcMain.handle('settings:save', async (event, settings: AppSettings) => {
    try {
      await saveSettings(settings)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.on('close-app', () => {
    app.quit()
  })

  ipcMain.handle('electron:open-path', async (event, args) => {
    if (!args || typeof args.target !== 'string' || args.target.trim() === '') {
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
          console.error(`Failed to open path "${targetPath}": ${errorMessage}`)
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
  })

  ipcMain.handle('electron:manage-clipboard', async (event, args) => {
    if (!args || (args.action !== 'read' && args.action !== 'write')) {
      console.error('manage_clipboard: Invalid action received:', args?.action)
      return {
        success: false,
        message: 'Error: Invalid action specified. Must be "read" or "write".',
      }
    }

    try {
      if (args.action === 'read') {
        const clipboardText = clipboard.readText()
        console.log('Clipboard read:', clipboardText)
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
                'Error: Text content must be provided for the "write" action.',
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
  })
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

  ipcMain.handle('capture-screen', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    return sources
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
  const initialSettings = await loadSettings()
  if (initialSettings) {
    console.log('Initial settings loaded in main process:', initialSettings)
  } else {
    console.warn('No initial settings found or settings failed to load.')
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
    await startAuthServer(win)
    const oAuth2Client = googleAuthManager.getOAuth2Client()
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
    })
    console.log('[IPC get-auth-url] Generated auth URL:', authUrl)
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
  return { success: true, message: 'Disconnected from Google Calendar.' }
})

async function withAuthenticatedCalendarClient<T>(
  operation: (authClient: any) => Promise<T>
): Promise<T | { success: false; error: string }> {
  const authClient = await googleAuthManager.getAuthenticatedClient()
  if (!authClient) {
    return {
      success: false,
      error:
        'User not authenticated with Google Calendar. Please authenticate in settings.',
    }
  }
  return operation(authClient)
}

ipcMain.handle('google-calendar:list-events', async (event, args) => {
  return withAuthenticatedCalendarClient(authClient =>
    googleCalendarManager.listEvents(
      authClient,
      args.calendarId,
      args.timeMin,
      args.timeMax,
      args.q,
      args.maxResults
    )
  )
})

ipcMain.handle('google-calendar:create-event', async (event, args) => {
  return withAuthenticatedCalendarClient(authClient =>
    googleCalendarManager.createEvent(
      authClient,
      args.calendarId,
      args.eventResource
    )
  )
})

ipcMain.handle('google-calendar:update-event', async (event, args) => {
  return withAuthenticatedCalendarClient(authClient =>
    googleCalendarManager.updateEvent(
      authClient,
      args.calendarId,
      args.eventId,
      args.eventResource
    )
  )
})

ipcMain.handle('google-calendar:delete-event', async (event, args) => {
  return withAuthenticatedCalendarClient(authClient =>
    googleCalendarManager.deleteEvent(authClient, args.calendarId, args.eventId)
  )
})

ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

app.on('certificate-error', (event, webContents, url, err, certificate, cb) => {
  if (err) console.error('Certificate error for URL:', url, err.message)

  if (url.startsWith('https://192.168.')) {
    console.warn(`Bypassing certificate error for local URL: ${url}`)
    event.preventDefault()
    cb(true)
  } else {
    cb(false)
  }
})
