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
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

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
    //win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  win.on('closed', () => {
    win = null
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
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

  ipcMain.on('show-overlay', () => {
    if (!overlayWindow) {
      createOverlayWindow()
    }
    overlayWindow?.show()
  })

  ipcMain.handle('hide-overlay', () => {
    overlayWindow?.hide()
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
    } catch (error) {
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
        // action === 'write'
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
    } catch (error) {
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

app.whenReady().then(() => {
  createWindow()
  createOverlayWindow()
})

app.on('window-all-closed', () => {
  win = null
  overlayWindow = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
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

ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

app.on('certificate-error', (event, webContents, url, err, certificate, cb) => {
  if (err) console.error(err)

  if (url === 'https://192.168.4.39:5000/chat') {
    event.preventDefault()
    cb(true)
  } else {
    cb(false)
  }
})
