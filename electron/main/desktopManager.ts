import { ipcMain } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'

class DesktopManager {
  private static instance: DesktopManager | null = null

  constructor() {
    if (DesktopManager.instance) {
      return DesktopManager.instance
    }
    DesktopManager.instance = this
    this.registerIpcHandlers()
  }

  static getInstance(): DesktopManager {
    if (!DesktopManager.instance) {
      DesktopManager.instance = new DesktopManager()
    }
    return DesktopManager.instance
  }

  private registerIpcHandlers() {
    // Remove existing handlers if they exist
    if (ipcMain.listenerCount('desktop:listDirectory') > 0) {
      ipcMain.removeAllListeners('desktop:listDirectory')
    }
    if (ipcMain.listenerCount('desktop:executeCommand') > 0) {
      ipcMain.removeAllListeners('desktop:executeCommand')
    }
    if (ipcMain.listenerCount('desktop:requestCommandApproval') > 0) {
      ipcMain.removeAllListeners('desktop:requestCommandApproval')
    }

    ipcMain.handle('desktop:listDirectory', async (event, dirPath) => {
      try {
        const files = await fs.readdir(dirPath)
        return { success: true, files }
      } catch (error) {
        return { success: false, error: error.message }
      }
    })

    ipcMain.handle('desktop:executeCommand', async (event, command) => {
      return new Promise(resolve => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: error.message })
            return
          }
          if (stderr) {
            resolve({ success: false, error: stderr })
            return
          }
          resolve({ success: true, output: stdout })
        })
      })
    })

    ipcMain.handle('desktop:requestCommandApproval', async (event, command) => {
      return { needsApproval: true, command }
    })
  }
}

export default DesktopManager
