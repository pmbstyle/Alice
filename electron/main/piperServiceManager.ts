/**
 * Piper gRPC Service Manager
 * Manages the Piper gRPC service process for persistent model loading
 */

import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'node:url'

// ES modules compatibility
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface PiperServiceConfig {
  host: string
  port: number
  timeout: number
  modelDir?: string
}

export class PiperServiceManager {
  private process: ChildProcess | null = null
  private config: PiperServiceConfig
  private isShuttingDown: boolean = false
  private startupPromise: Promise<boolean> | null = null
  private logFilePath: string | null = null
  private logStream: fs.WriteStream | null = null

  constructor(config: Partial<PiperServiceConfig> = {}) {
    this.config = {
      host: '127.0.0.1',
      port: 50052,
      timeout: 30000, // 30 seconds for service startup
      modelDir: 'models/piper',
      ...config,
    }

    // Initialize log file
    this.initializeLogFile()
  }

  /**
   * Initialize log file for service output
   */
  private initializeLogFile(): void {
    try {
      // Get service directory (where the binary resides)
      const servicePath = this.getServicePath()
      if (!servicePath) {
        console.error('[PiperService] Cannot initialize log file - service path not found')
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
      this.logFilePath = path.join(logsDir, `piper-service-${timestamp}.log`)

      // Create write stream
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' })

      this.writeLog('='.repeat(80))
      this.writeLog(`Piper gRPC Service Log Started: ${new Date().toISOString()}`)
      this.writeLog(`Log File: ${this.logFilePath}`)
      this.writeLog('='.repeat(80))

      console.log(`[PiperService] Logging to: ${this.logFilePath}`)
    } catch (error) {
      console.error('[PiperService] Failed to initialize log file:', error)
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
   * Get the service executable path based on environment
   */
  private getServicePath(): string | null {
    const isDev = !app.isPackaged
    const isWindows = process.platform === 'win32'
    const binaryName = isWindows ? 'piper-service.exe' : 'piper-service'

    let servicePath: string

    if (isDev) {
      // Development: look in resources/backend
      servicePath = path.join(process.cwd(), 'resources', 'backend', binaryName)
    } else {
      // Production: look in app.asar.unpacked/resources/backend
      servicePath = path.join(process.resourcesPath, 'backend', binaryName)
    }

    if (fs.existsSync(servicePath)) {
      return servicePath
    }

    console.error('[PiperService] Service executable not found at:', servicePath)
    return null
  }

  /**
   * Start the Piper gRPC service process
   */
  async start(): Promise<boolean> {
    // If we already have a startup promise, return it
    if (this.startupPromise) {
      return this.startupPromise
    }

    // If we already have a running process, return true
    if (this.process && !this.process.killed) {
      console.log('[PiperService] Piper service already running')
      return true
    }

    this.startupPromise = this._startInternal()
    return this.startupPromise
  }

  private async _startInternal(): Promise<boolean> {
    try {
      console.log('[PiperService] Starting Piper gRPC service...')

      // Get service executable path
      const servicePath = this.getServicePath()
      if (!servicePath) {
        console.error('[PiperService] Service executable not found')
        return false
      }

      console.log('[PiperService] Using service at:', servicePath)

      // Prepare command line arguments
      const args = [
        '--port',
        this.config.port.toString(),
        '--model-dir',
        this.config.modelDir || 'models/piper',
        '--log-level',
        'INFO',
      ]

      // Add bin directory to PATH for DLL resolution (ONNX Runtime)
      const serviceDir = path.dirname(servicePath)
      const binDir = path.join(serviceDir, 'bin')
      const pathSeparator = process.platform === 'win32' ? ';' : ':'
      const updatedPath = `${binDir}${pathSeparator}${process.env.PATH || ''}`

      // Set environment variables
      const env = {
        ...process.env,
        PATH: updatedPath,
        PIPER_PORT: this.config.port.toString(),
      }

      // Spawn service process
      this.process = spawn(servicePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        detached: false,
      })

      if (!this.process) {
        console.error('[PiperService] Failed to spawn service process')
        return false
      }

      console.log('[PiperService] Service process started (PID:', this.process.pid, ')')
      this.writeLog(`Process started with PID: ${this.process.pid}`)
      this.writeLog(`Port: ${this.config.port}`)
      this.writeLog(`Model Directory: ${this.config.modelDir}`)

      // Setup process event handlers
      this.setupProcessHandlers()

      // Wait for service to be ready
      const ready = await this.waitForReady()

      if (ready) {
        console.log('[PiperService] ✓ Piper gRPC service is ready')
        this.writeLog('Service is ready and accepting requests')
        this.startupPromise = null
        return true
      } else {
        console.error('[PiperService] Service failed to become ready')
        this.writeLog('ERROR: Service failed to become ready')
        await this.stop()
        this.startupPromise = null
        return false
      }
    } catch (error) {
      console.error('[PiperService] Failed to start service:', error)
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
      console.log(`[PiperService] ${message}`)
      this.writeLog(`STDOUT: ${message}`)
    })

    // Handle stderr (Go may send some logs here despite SetOutput)
    this.process.stderr?.on('data', (data) => {
      const message = data.toString().trim()
      // Only treat as error if it contains actual error keywords
      if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fatal') || message.toLowerCase().includes('panic')) {
        console.error(`[PiperService] ERROR: ${message}`)
        this.writeLog(`STDERR-ERROR: ${message}`)
      } else {
        // Regular logs that ended up in stderr
        console.log(`[PiperService] ${message}`)
        this.writeLog(`STDERR-INFO: ${message}`)
      }
    })

    // Handle process exit
    this.process.on('close', (code, signal) => {
      console.log(`[PiperService] Process exited with code ${code}, signal ${signal}`)
      this.writeLog(`Process exited - Code: ${code}, Signal: ${signal}`)

      if (!this.isShuttingDown && code !== 0) {
        console.error('[PiperService] Unexpected service exit')
        this.writeLog('ERROR: Unexpected service exit')
      }

      this.process = null
      this.startupPromise = null
    })

    this.process.on('error', (error) => {
      console.error('[PiperService] Process error:', error)
      this.writeLog(`ERROR: ${error.message}`)
    })
  }

  /**
   * Wait for the service to become ready (health check polling)
   */
  private async waitForReady(): Promise<boolean> {
    const startTime = Date.now()
    const pollInterval = 500 // 500ms
    const serviceUrl = this.getServiceUrl()

    console.log(`[PiperService] Waiting for service to become ready at ${serviceUrl}...`)
    this.writeLog(`Polling health check at ${serviceUrl}`)

    while (Date.now() - startTime < this.config.timeout) {
      try {
        // Check if process is still alive
        if (!this.process || this.process.killed) {
          console.error('[PiperService] Process died during startup')
          return false
        }

        // Simple health check - just verify process is alive
        // The Go backend will do the actual gRPC health check
        const isHealthy = await this.checkHealth()

        if (isHealthy) {
          const elapsed = Date.now() - startTime
          console.log(`[PiperService] Service ready after ${elapsed}ms`)
          this.writeLog(`Service became ready after ${elapsed}ms`)
          return true
        }
      } catch (error) {
        // Service not ready yet, continue polling
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    const elapsed = Date.now() - startTime
    console.error(`[PiperService] Service failed to become ready after ${elapsed}ms`)
    this.writeLog(`ERROR: Timeout after ${elapsed}ms`)
    return false
  }

  /**
   * Check if the service is healthy
   */
  private async checkHealth(): Promise<boolean> {
    try {
      // For gRPC, we can't use HTTP directly
      // Just check if the process is alive and give it some time
      // The Go backend will do the actual health check via gRPC
      return this.process !== null && !this.process.killed
    } catch (error) {
      return false
    }
  }

  /**
   * Get the service URL for gRPC connections
   */
  getServiceUrl(): string {
    return `${this.config.host}:${this.config.port}`
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }

  /**
   * Stop the Piper gRPC service
   */
  async stop(): Promise<void> {
    if (!this.process || this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true

    try {
      console.log('[PiperService] Stopping Piper gRPC service...')
      this.writeLog('Shutdown initiated')

      // Send SIGTERM for graceful shutdown
      this.process.kill('SIGTERM')

      // Wait for process to exit (with timeout)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process && !this.process.killed) {
            console.warn('[PiperService] Force killing service process')
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

      console.log('[PiperService] Service stopped')
      this.writeLog('Service stopped successfully')
    } catch (error) {
      console.error('[PiperService] Error stopping service:', error)
      this.writeLog(`ERROR stopping service: ${error}`)
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
export const piperServiceManager = new PiperServiceManager()
