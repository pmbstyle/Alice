/**
 * Logging Manager
 * Captures all console output and writes to log files
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

class LoggingManager {
  private logStream: fs.WriteStream | null = null
  private logFilePath: string | null = null
  private originalConsoleLog: typeof console.log
  private originalConsoleError: typeof console.error
  private originalConsoleWarn: typeof console.warn
  private originalConsoleInfo: typeof console.info

  constructor() {
    // Save original console methods
    this.originalConsoleLog = console.log
    this.originalConsoleError = console.error
    this.originalConsoleWarn = console.warn
    this.originalConsoleInfo = console.info
  }

  /**
   * Initialize logging to file
   */
  initialize(): void {
    try {
      // Get user data directory
      const userDataPath = app.getPath('userData')
      const logsDir = path.join(userDataPath, 'logs')

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true })
      }

      // Create log file with timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
      this.logFilePath = path.join(logsDir, `electron-${timestamp}.log`)

      // Create write stream
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' })

      this.writeLog('='.repeat(80))
      this.writeLog(`Electron Main Process Log Started: ${new Date().toISOString()}`)
      this.writeLog(`Log File: ${this.logFilePath}`)
      this.writeLog(`App Version: ${app.getVersion()}`)
      this.writeLog(`Electron Version: ${process.versions.electron}`)
      this.writeLog(`Node Version: ${process.versions.node}`)
      this.writeLog(`Platform: ${process.platform} ${process.arch}`)
      this.writeLog('='.repeat(80))

      // Override console methods
      this.overrideConsoleMethods()

      console.log(`[LoggingManager] Logging to: ${this.logFilePath}`)
    } catch (error) {
      this.originalConsoleError('[LoggingManager] Failed to initialize logging:', error)
    }
  }

  /**
   * Write directly to log file (without console output)
   */
  private writeLog(message: string): void {
    if (this.logStream) {
      const timestamp = new Date().toISOString()
      this.logStream.write(`[${timestamp}] ${message}\n`)
    }
  }

  /**
   * Override console methods to capture output
   */
  private overrideConsoleMethods(): void {
    // Override console.log
    console.log = (...args: any[]) => {
      const message = args.map(arg => this.formatArg(arg)).join(' ')
      this.writeLog(`LOG: ${message}`)
      this.originalConsoleLog(...args)
    }

    // Override console.error
    console.error = (...args: any[]) => {
      const message = args.map(arg => this.formatArg(arg)).join(' ')
      this.writeLog(`ERROR: ${message}`)
      this.originalConsoleError(...args)
    }

    // Override console.warn
    console.warn = (...args: any[]) => {
      const message = args.map(arg => this.formatArg(arg)).join(' ')
      this.writeLog(`WARN: ${message}`)
      this.originalConsoleWarn(...args)
    }

    // Override console.info
    console.info = (...args: any[]) => {
      const message = args.map(arg => this.formatArg(arg)).join(' ')
      this.writeLog(`INFO: ${message}`)
      this.originalConsoleInfo(...args)
    }
  }

  /**
   * Format argument for logging
   */
  private formatArg(arg: any): string {
    if (typeof arg === 'string') {
      return arg
    } else if (arg instanceof Error) {
      return `${arg.message}\n${arg.stack}`
    } else if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2)
      } catch {
        return String(arg)
      }
    } else {
      return String(arg)
    }
  }

  /**
   * Restore original console methods
   */
  private restoreConsoleMethods(): void {
    console.log = this.originalConsoleLog
    console.error = this.originalConsoleError
    console.warn = this.originalConsoleWarn
    console.info = this.originalConsoleInfo
  }

  /**
   * Shutdown logging
   */
  shutdown(): void {
    try {
      if (this.logStream) {
        this.writeLog('='.repeat(80))
        this.writeLog(`Electron Main Process Log Ended: ${new Date().toISOString()}`)
        this.writeLog('='.repeat(80))

        // Restore original console methods
        this.restoreConsoleMethods()

        // Close log stream
        this.logStream.end()
        this.logStream = null

        this.originalConsoleLog('[LoggingManager] Logging shutdown complete')
      }
    } catch (error) {
      this.originalConsoleError('[LoggingManager] Error during shutdown:', error)
    }
  }

  /**
   * Get the current log file path
   */
  getLogFilePath(): string | null {
    return this.logFilePath
  }
}

// Export singleton instance
export const loggingManager = new LoggingManager()
