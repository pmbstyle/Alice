import pkg from 'electron-updater'
import { ipcMain } from 'electron'
import log from 'electron-log'
import { getMainWindow } from './windowManager'

const { autoUpdater } = pkg

const IS_DEV = !!process.env.VITE_DEV_SERVER_URL

export function initializeUpdater(): void {
  autoUpdater.logger = log
  autoUpdater.logger.transports.file.level = 'info'
  log.info('App starting...')

  if (IS_DEV) {
    log.info('[AutoUpdater] Forcing dev update config.')
    autoUpdater.forceDevUpdateConfig = true
  }

  setupAutoUpdaterEvents()
  setupUpdaterIPCHandlers()
}

function setupAutoUpdaterEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...')
  })

  autoUpdater.on('update-available', info => {
    console.log('[AutoUpdater] Update available.', info)
    console.log('[AutoUpdater] Starting download...')
    autoUpdater.downloadUpdate().catch(err => {
      console.error('[AutoUpdater] Error during download:', err)
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] Update not available.')
  })

  autoUpdater.on('error', err => {
    console.error('[AutoUpdater] Error:', err)
  })

  autoUpdater.on('download-progress', progressObj => {
    let log_message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent.toFixed(2)}% (${progressObj.transferred}/${progressObj.total})`
    console.log(log_message)
    const win = getMainWindow()
    win?.webContents.send('update-download-progress', progressObj)
  })

  autoUpdater.on('update-downloaded', info => {
    console.log('[AutoUpdater] Update downloaded.', info)
    const win = getMainWindow()
    win?.webContents.send('update-downloaded', info)
  })
}

function setupUpdaterIPCHandlers(): void {
  ipcMain.on('restart-and-install-update', () => {
    console.log('[AutoUpdater] Quitting and installing update...')
    autoUpdater.quitAndInstall()
  })
}

export function checkForUpdates(): void {
  console.log('[AutoUpdater] Checking for updates...')
  autoUpdater.checkForUpdates()
}
