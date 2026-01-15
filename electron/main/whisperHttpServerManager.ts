/**
 * Whisper HTTP Server Manager
 * Manages the native whisper-server.exe process for persistent model loading
 */

import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import axios from 'axios'
import { fileURLToPath } from 'node:url'

// ES modules compatibility
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface WhisperHttpServerConfig {
  host: string
  port: number
  timeout: number
  modelPath?: string
  language?: string
}

export class WhisperHttpServerManager {
  private process: ChildProcess | null = null
  private config: WhisperHttpServerConfig
  private isShuttingDown: boolean = false
  private startupPromise: Promise<boolean> | null = null
  private logFilePath: string | null = null
  private logStream: fs.WriteStream | null = null

  constructor(config: Partial<WhisperHttpServerConfig> = {}) {
    this.config = {
      host: '127.0.0.1',
      port: 8082, // Different from main backend (8765) and gRPC (50051)
      timeout: 45000, // 45 seconds - model loading takes time
      modelPath: 'models/whisper-base.bin',
      language: 'auto', // Default to auto-detect
      ...config,
    }

    // Initialize log file
    this.initializeLogFile()
  }

  /**
   * Update the language configuration
   */
  setLanguage(language: string): void {
    this.config.language = language
  }

  /**
   * Initialize log file for service output
   */
  private initializeLogFile(): void {
    try {
      // Get service directory (where the binary resides)
      const servicePath = this.getServerPath()
      if (!servicePath) {
        console.error('[WhisperHTTP] Cannot initialize log file - service path not found')
        return
      }

      const serviceDir = path.dirname(servicePath)
      const logsDir = path.join(serviceDir, 'logs')

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true })
      }

      // Create log file with timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
      this.logFilePath = path.join(logsDir, `whisper-http-server-${timestamp}.log`)

      // Create write stream
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' })

      this.writeLog('='.repeat(80))
      this.writeLog(`Whisper HTTP Server Log Started: ${new Date().toISOString()}`)
      this.writeLog(`Log File: ${this.logFilePath}`)
      this.writeLog('='.repeat(80))

      console.log(`[WhisperHTTP] Logging to: ${this.logFilePath}`)
    } catch (error) {
      console.error('[WhisperHTTP] Failed to initialize log file:', error)
    }
  }

  /**
   * Write a message to the log file
   */
  private writeLog(message: string): void {
    if (this.logStream) {
      const timestamp = new Date().toISOString()
      this.logStream.write(`[${timestamp}] ${message}\n`)
    }
  }

  /**
   * Get the whisper-server executable path based on environment
   */
  private getServerPath(): string | null {
    const isDev = !app.isPackaged
    const isWindows = process.platform === 'win32'
    const binaryName = isWindows ? 'whisper-server.exe' : 'whisper-server'

    let serverPath: string

    if (isDev) {
      // Development: look in resources/backend/bin
      serverPath = path.join(process.cwd(), 'resources', 'backend', 'bin', binaryName)
    } else {
      // Production: look in app.asar.unpacked/resources/backend/bin
      serverPath = path.join(process.resourcesPath, 'backend', 'bin', binaryName)
    }

    if (fs.existsSync(serverPath)) {
      return serverPath
    }

    console.error('[WhisperHTTP] Server executable not found at:', serverPath)
    return null
  }

  /**
   * Start the Whisper HTTP server process
   */
  async start(): Promise<boolean> {
    // If we already have a startup promise, return it
    if (this.startupPromise) {
      return this.startupPromise
    }

    // If we already have a running process, return true
    if (this.process && !this.process.killed) {
      console.log('[WhisperHTTP] Whisper HTTP server already running')
      return true
    }

    this.startupPromise = this._startInternal()
    return this.startupPromise
  }

  private async _startInternal(): Promise<boolean> {
    try {
      console.log('[WhisperHTTP] Starting Whisper HTTP server...')

      // Get server executable path
      const serverPath = this.getServerPath()
      if (!serverPath) {
        console.error('[WhisperHTTP] Server executable not found')
        return false
      }

      console.log('[WhisperHTTP] Using server at:', serverPath)

      // Get absolute model path (relative to backend root, not bin directory)
      // serverPath is: resources/backend/bin/whisper-server.exe
      // modelPath should be: resources/backend/models/whisper-base.bin
      const serverDir = path.dirname(serverPath) // resources/backend/bin
      const backendRoot = path.dirname(serverDir) // resources/backend
      const modelPath = path.join(backendRoot, this.config.modelPath || 'models/whisper-base.bin')

      console.log('[WhisperHTTP] Model path:', modelPath)

      // Prepare command line arguments for whisper-server.exe
      const args = [
        '--host', this.config.host,
        '--port', this.config.port.toString(),
        '--model', modelPath,
        '--language', this.config.language || 'auto',
        '--inference-path', '/inference',
      ]

      console.log(`[WhisperHTTP] Starting with language: ${this.config.language}`)
      this.writeLog(`Language: ${this.config.language}`)
      this.writeLog(`Port: ${this.config.port}`)
      this.writeLog(`Model: ${this.config.modelPath}`)

      // Set environment variables
      const env = {
        ...process.env,
        WHISPER_HTTP_PORT: this.config.port.toString(),
      }

      // Spawn server process
      this.process = spawn(serverPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        detached: false,
      })

      if (!this.process) {
        console.error('[WhisperHTTP] Failed to spawn server process')
        return false
      }

      console.log('[WhisperHTTP] Server process started (PID:', this.process.pid, ')')
      this.writeLog(`Process started with PID: ${this.process.pid}`)

      // Setup process event handlers
      this.setupProcessHandlers()

      // Wait for server to be ready
      const ready = await this.waitForReady()

      if (ready) {
        console.log('[WhisperHTTP] ✓ Whisper HTTP server is ready')
        this.writeLog('Server is ready and accepting requests')
        this.startupPromise = null
        return true
      } else {
        console.error('[WhisperHTTP] Server failed to become ready')
        this.writeLog('ERROR: Server failed to become ready')
        await this.stop()
        this.startupPromise = null
        return false
      }
    } catch (error) {
      console.error('[WhisperHTTP] Failed to start server:', error)
      this.writeLog(`ERROR: ${error}`)
      this.startupPromise = null
      return false
    }
  }

  /**
   * Setup handlers for process events
   */
  private setupProcessHandlers(): void {
    if (!this.process) return

    // Handle stdout
    this.process.stdout?.on('data', (data) => {
      const message = data.toString().trim()
      console.log(`[WhisperHTTP] ${message}`)
      this.writeLog(`STDOUT: ${message}`)
    })

    // Handle stderr
    this.process.stderr?.on('data', (data) => {
      const message = data.toString().trim()
      // whisper-server outputs some info to stderr, not all are errors
      if (message.includes('error') || message.includes('Error')) {
        console.error(`[WhisperHTTP] ERROR: ${message}`)
      } else {
        console.log(`[WhisperHTTP] ${message}`)
      }
      this.writeLog(`STDERR: ${message}`)
    })

    // Handle process exit
    this.process.on('close', (code, signal) => {
      console.log(`[WhisperHTTP] Process exited with code ${code}, signal ${signal}`)
      this.writeLog(`Process exited - Code: ${code}, Signal: ${signal}`)

      if (!this.isShuttingDown && code !== 0) {
        console.error('[WhisperHTTP] Unexpected server exit')
        this.writeLog('ERROR: Unexpected server exit')
      }

      this.process = null
      this.startupPromise = null
    })

    this.process.on('error', (error) => {
      console.error('[WhisperHTTP] Process error:', error)
      this.writeLog(`ERROR: ${error.message}`)
    })
  }

  /**
   * Wait for the server to become ready (health check polling)
   */
  private async waitForReady(): Promise<boolean> {
    const startTime = Date.now()
    const pollInterval = 500 // 500ms
    const serviceUrl = this.getServiceUrl()

    console.log(`[WhisperHTTP] Waiting for server to become ready at ${serviceUrl}...`)
    this.writeLog(`Polling health check at ${serviceUrl}`)

    while (Date.now() - startTime < this.config.timeout) {
      try {
        // Check if process is still alive
        if (!this.process || this.process.killed) {
          console.error('[WhisperHTTP] Process died during startup')
          return false
        }

        // Try to connect to the HTTP server
        const isHealthy = await this.checkHealth()

        if (isHealthy) {
          const elapsed = Date.now() - startTime
          console.log(`[WhisperHTTP] Server ready after ${elapsed}ms`)
          this.writeLog(`Server became ready after ${elapsed}ms`)
          return true
        }
      } catch (error) {
        // Server not ready yet, continue polling
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    const elapsed = Date.now() - startTime
    console.error(`[WhisperHTTP] Server failed to become ready after ${elapsed}ms`)
    this.writeLog(`ERROR: Timeout after ${elapsed}ms`)
    return false
  }

  /**
   * Check if the HTTP server is healthy
   */
  private async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.getServiceUrl()}/`, {
        timeout: 2000,
        validateStatus: (status) => status < 500, // Accept any status < 500
      })
      return response.status === 200
    } catch (error) {
      return false
    }
  }

  /**
   * Get the service URL for HTTP connections
   */
  getServiceUrl(): string {
    return `http://${this.config.host}:${this.config.port}`
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }

  /**
   * Stop the Whisper HTTP server
   */
  async stop(): Promise<void> {
    if (!this.process || this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true

    try {
      console.log('[WhisperHTTP] Stopping Whisper HTTP server...')
      this.writeLog('Shutdown initiated')

      // Send SIGTERM for graceful shutdown
      this.process.kill('SIGTERM')

      // Wait for process to exit (with timeout)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process && !this.process.killed) {
            console.warn('[WhisperHTTP] Force killing server process')
            this.writeLog('WARN: Force killing process')
            this.process.kill('SIGKILL')
          }
          resolve()
        }, 5000)

        if (this.process) {
          this.process.once('close', () => {
            clearTimeout(timeout)
            resolve()
          })
        } else {
          clearTimeout(timeout)
          resolve()
        }
      })

      console.log('[WhisperHTTP] Server stopped')
      this.writeLog('Server stopped successfully')
    } catch (error) {
      console.error('[WhisperHTTP] Error stopping server:', error)
      this.writeLog(`ERROR stopping server: ${error}`)
    } finally {
      this.process = null
      this.isShuttingDown = false
      this.startupPromise = null

      // Close log stream
      if (this.logStream) {
        this.writeLog('='.repeat(80))
        this.writeLog(`Log Ended: ${new Date().toISOString()}`)
        this.writeLog('='.repeat(80))
        this.logStream.end()
        this.logStream = null
      }
    }
  }
}

// Export singleton instance
export const whisperHttpServerManager = new WhisperHttpServerManager()
