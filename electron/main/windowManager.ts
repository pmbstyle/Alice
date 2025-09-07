import { BrowserWindow, screen, shell, protocol } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (!process.env.APP_ROOT) {
  process.env.APP_ROOT = path.join(__dirname, '../..')
}

export function getMainDist(): string {
  return path.join(process.env.APP_ROOT!, 'dist-electron')
}

export function getRendererDist(): string {
  return path.join(process.env.APP_ROOT!, 'dist')
}

export function getVitePublic(): string {
  return process.env.VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT!, 'public')
    : getRendererDist()
}

export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const IS_DEV = !!VITE_DEV_SERVER_URL

function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.mjs')
}

function getIndexHtmlPath(): string {
  return path.join(getRendererDist(), 'index.html')
}

let win: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return win
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export async function createMainWindow(): Promise<BrowserWindow> {
  win = new BrowserWindow({
    title: 'Alice',
    icon: path.join(getVitePublic(), 'app_logo.png'),
    transparent: true,
    frame: false,
    width: 500,
    height: 500,
    resizable: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: getPreloadPath(),
      offscreen: false,
      backgroundThrottling: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(getIndexHtmlPath())
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

  return win
}

export async function createOverlayWindow(): Promise<BrowserWindow> {
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
      preload: getPreloadPath(),
      offscreen: false,
      backgroundThrottling: false,
    },
  })

  const arg = 'overlay'
  if (VITE_DEV_SERVER_URL) {
    await overlayWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    await overlayWindow.loadFile(getIndexHtmlPath(), { hash: arg })
  }
  
  overlayWindow.hide()

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

export async function showOverlay(): Promise<boolean> {
  if (!overlayWindow) {
    await createOverlayWindow()
  }
  
  overlayWindow.setOpacity(1.0)
  overlayWindow.show()
  
  return true
}

export function hideOverlay(): boolean {
  overlayWindow?.hide()
  win?.webContents.send('overlay-closed')
  return true
}

export function resizeMainWindow(width: number, height: number): void {
  if (win) {
    win.setSize(width, height)
  }
}

export function minimizeMainWindow(minimize: boolean): void {
  if (!win) return

  const display = screen.getPrimaryDisplay()
  if (minimize) {
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

export function focusMainWindow(): boolean {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    win.moveTop()
    console.log('[WindowManager] Main window focused')
    return true
  }
  return false
}

export function cleanupWindows(): void {
  win = null
  overlayWindow = null
}

export function registerCustomProtocol(generatedImagesPath: string): void {
  protocol.registerFileProtocol('alice-image', (request, callback) => {
    const url = request.url.substring('alice-image://'.length)
    const decodedUrlPath = decodeURIComponent(url)
    const filePath = path.normalize(
      path.join(generatedImagesPath, decodedUrlPath)
    )

    if (filePath.startsWith(path.normalize(generatedImagesPath))) {
      callback({ path: filePath })
    } else {
      console.error(
        `[Protocol] Denied access to unsafe path: ${filePath} from URL: ${request.url}`
      )
      callback({ error: -6 })
    }
  })
}
