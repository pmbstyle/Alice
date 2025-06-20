import pkg from 'electron-updater'
import { ipcMain } from 'electron'
import log from 'electron-log'
import { app } from 'electron'
import { getMainWindow } from './windowManager'
import packageJson from '../../package.json' with { type: 'json' }
import fs from 'fs'
import path from 'path'

const { autoUpdater } = pkg

const IS_DEV = !!process.env.VITE_DEV_SERVER_URL

export function initializeUpdater(): void {
  autoUpdater.logger = log
  autoUpdater.logger.transports.file.level = 'info'
  log.info('App starting...')

  log.info(`[AutoUpdater] Environment - IS_DEV: ${IS_DEV}`)
  log.info(
    `[AutoUpdater] VITE_DEV_SERVER_URL: ${process.env.VITE_DEV_SERVER_URL || 'undefined'}`
  )
  log.info(`[AutoUpdater] App version: ${packageJson.version}`)
  log.info(`[AutoUpdater] App user data path: ${app.getPath('userData')}`)

  if (IS_DEV) {
    log.info(
      '[AutoUpdater] Running in development mode - forcing dev update config.'
    )
    autoUpdater.forceDevUpdateConfig = true
  } else {
    log.info(
      '[AutoUpdater] Running in production mode - using normal update config.'
    )

    const updaterCacheDir = path.join(app.getPath('userData'), 'updater')
    log.info(`[AutoUpdater] Updater cache directory: ${updaterCacheDir}`)

    if (fs.existsSync(updaterCacheDir)) {
      try {
        const cacheFiles = fs.readdirSync(updaterCacheDir)
        log.info(
          `[AutoUpdater] Updater cache files: ${JSON.stringify(cacheFiles)}`
        )
      } catch (error) {
        log.error(`[AutoUpdater] Error reading updater cache: ${error}`)
      }
    } else {
      log.info('[AutoUpdater] No updater cache directory found')
    }

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    log.info(
      `[AutoUpdater] Update feed URL will be constructed from electron-builder config`
    )
  }

  setupAutoUpdaterEvents()
  setupUpdaterIPCHandlers()
}

function setupAutoUpdaterEvents(): void {
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...')
    log.info('[AutoUpdater] Update check initiated')
  })

  autoUpdater.on('update-available', info => {
    console.log('[AutoUpdater] Update available.', info)
    log.info('[AutoUpdater] Update available:', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName,
    })
    console.log('[AutoUpdater] Starting download...')

    const downloadTimeout = setTimeout(
      () => {
        log.error('[AutoUpdater] Download timeout - no progress for 5 minutes')
        console.error('[AutoUpdater] Download appears to be stuck')
      },
      5 * 60 * 1000
    )

    autoUpdater
      .downloadUpdate()
      .then(() => {
        clearTimeout(downloadTimeout)
        log.info('[AutoUpdater] Download promise resolved')
      })
      .catch(err => {
        clearTimeout(downloadTimeout)
        console.error('[AutoUpdater] Error during download:', err)
        log.error('[AutoUpdater] Download error:', err)
      })
  })

  autoUpdater.on('update-not-available', info => {
    console.log('[AutoUpdater] Update not available.')
    log.info(
      '[AutoUpdater] No update available. Current version is up to date.'
    )
    if (info) {
      log.info('[AutoUpdater] Update info:', info)
    }
  })

  autoUpdater.on('error', err => {
    console.error('[AutoUpdater] Error:', err)
    log.error('[AutoUpdater] Error details:', err)
    const win = getMainWindow()
    win?.webContents.send('update-error', {
      error: err.message || err.toString(),
    })
  })

  autoUpdater.on('download-progress', progressObj => {
    let log_message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent.toFixed(2)}% (${progressObj.transferred}/${progressObj.total})`
    console.log(log_message)
    log.info(
      `[AutoUpdater] Download progress: ${progressObj.percent.toFixed(2)}% - ${(progressObj.transferred / 1024 / 1024).toFixed(2)}MB / ${(progressObj.total / 1024 / 1024).toFixed(2)}MB`
    )
    const win = getMainWindow()
    win?.webContents.send('update-download-progress', progressObj)
  })

  autoUpdater.on('update-downloaded', info => {
    console.log('[AutoUpdater] Update downloaded.', info)
    log.info(
      `[AutoUpdater] Update downloaded successfully. Version: ${info.version}, Release date: ${info.releaseDate}`
    )
    const win = getMainWindow()
    win?.webContents.send('update-downloaded', info)
  })
}

function setupUpdaterIPCHandlers(): void {
  ipcMain.on('restart-and-install-update', () => {
    console.log('[AutoUpdater] Quitting and installing update...')
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('check-for-updates-manual', async () => {
    try {
      console.log('[AutoUpdater] Manual update check requested')
      log.info('[AutoUpdater] Manual update check initiated')
      const result = await autoUpdater.checkForUpdates()
      return { success: true, updateInfo: result?.updateInfo }
    } catch (error: any) {
      console.error('[AutoUpdater] Manual update check failed:', error)
      log.error('[AutoUpdater] Manual update check error:', error)
      return { success: false, error: error.message || error.toString() }
    }
  })

  ipcMain.handle('clear-updater-cache', async () => {
    try {
      const result = await clearUpdaterCache()
      return { success: true, message: result }
    } catch (error: any) {
      log.error('[AutoUpdater] Error clearing cache:', error)
      return { success: false, error: error.message || error.toString() }
    }
  })
}

async function clearUpdaterCache(): Promise<string> {
  const updaterCacheDir = path.join(app.getPath('userData'), 'updater')

  try {
    if (fs.existsSync(updaterCacheDir)) {
      const files = fs.readdirSync(updaterCacheDir)
      for (const file of files) {
        const filePath = path.join(updaterCacheDir, file)
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true })
        } else {
          fs.unlinkSync(filePath)
        }
      }
      log.info(
        `[AutoUpdater] Cleared updater cache: ${files.length} items removed`
      )
      return `Cleared updater cache: ${files.length} items removed`
    } else {
      log.info('[AutoUpdater] No updater cache directory found to clear')
      return 'No updater cache directory found'
    }
  } catch (error: any) {
    log.error(`[AutoUpdater] Error clearing updater cache: ${error}`)
    throw error
  }
}

export function checkForUpdates(): void {
  console.log('[AutoUpdater] Checking for updates...')
  log.info('[AutoUpdater] Initiating update check...')

  if (IS_DEV) {
    log.info('[AutoUpdater] Development mode - using dev update config')
  } else {
    log.info('[AutoUpdater] Production mode - checking GitHub releases')
  }

  autoUpdater.checkForUpdates().catch(err => {
    console.error('[AutoUpdater] Error during update check:', err)
    log.error('[AutoUpdater] Update check failed:', err)
  })
}
