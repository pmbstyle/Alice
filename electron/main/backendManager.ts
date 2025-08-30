/**
 * Go Backend Manager
 * Manages the Go AI backend process with simplified lifecycle management
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

interface BackendManagerConfig {
  host: string
  port: number
  timeout: number
}

interface ServiceStatus {
  stt: boolean
  tts: boolean
  embeddings: boolean
}

export class BackendManager {
  private process: ChildProcess | null = null
  private config: BackendManagerConfig
  private isShuttingDown: boolean = false
  private startupPromise: Promise<boolean> | null = null

  constructor(config: Partial<BackendManagerConfig> = {}) {
    this.config = {
      host: '127.0.0.1',
      port: 8765,
      timeout: 30000, // 30 seconds - Go starts much faster than Python
      ...config,
    }
  }

  /**
   * Start the Go backend process
   */
  async start(): Promise<boolean> {
    // If we already have a startup promise, return it
    if (this.startupPromise) {
      return this.startupPromise
    }

    // If we already have a running process, return true
    if (this.process && !this.process.killed) {
      console.log('[BackendManager] Go backend already running')
      return true
    }

    this.startupPromise = this._startInternal()
    return this.startupPromise
  }

  private async _startInternal(): Promise<boolean> {
    try {
      console.log('[BackendManager] Starting Go AI backend...')

      // Get backend executable path
      const backendPath = this.getBackendPath()
      if (!backendPath) {
        console.error('[BackendManager] Go backend executable not found')
        return false
      }

      console.log('[BackendManager] Using backend at:', backendPath)

      // Set environment variables for Go backend
      const env = {
        ...process.env,
        ALICE_HOST: this.config.host,
        ALICE_PORT: this.config.port.toString(),
        ALICE_LOG_LEVEL: 'INFO',
        ALICE_ENABLE_STT: 'true',
        ALICE_ENABLE_TTS: 'true', // Enable TTS
        ALICE_ENABLE_EMBEDDINGS: 'true',
      }

      // Spawn Go process
      this.process = spawn(backendPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        detached: false,
      })

      if (!this.process) {
        console.error('[BackendManager] Failed to spawn Go process')
        return false
      }

      console.log(
        `[BackendManager] Go backend started with PID: ${this.process.pid}`
      )

      // Set up process event handlers
      this.setupProcessHandlers()

      // Wait for the server to be ready
      const isReady = await this.waitForReady()

      if (isReady) {
        console.log('[BackendManager] ✅ Go AI backend is ready')
        this.startupPromise = null
        return true
      } else {
        console.error('[BackendManager] ❌ Go AI backend failed to start')
        await this.stop()
        this.startupPromise = null
        return false
      }
    } catch (error) {
      console.error('[BackendManager] Error starting Go backend:', error)
      this.startupPromise = null
      return false
    }
  }

  /**
   * Stop the Go backend process
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true
    console.log('[BackendManager] Stopping Go AI backend...')

    // Terminate process if running
    if (this.process && !this.process.killed) {
      try {
        console.log(
          `[BackendManager] Terminating Go process PID: ${this.process.pid}`
        )

        if (process.platform === 'win32') {
          // On Windows, try graceful termination first
          this.process.kill('SIGTERM')

          // Wait briefly for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 2000))

          // Force kill if still running
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL')
          }
        } else {
          // Unix-like systems - graceful then forceful
          this.process.kill('SIGTERM')

          await new Promise(resolve => setTimeout(resolve, 1000))

          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL')
          }
        }
      } catch (error) {
        console.error('[BackendManager] Error stopping process:', error)
      }
    }

    this.process = null
    this.isShuttingDown = false
    this.startupPromise = null
    console.log('[BackendManager] Go AI backend stopped')
  }

  /**
   * Check if the Go backend is running and healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await axios.get(
        `http://${this.config.host}:${this.config.port}/api/health`,
        {
          timeout: 5000,
        }
      )

      return (
        response.status === 200 &&
        response.data?.success === true &&
        response.data?.data?.status === 'healthy'
      )
    } catch (error: any) {
      return false
    }
  }

  /**
   * Get the status of individual AI services
   */
  async getServiceStatus(): Promise<ServiceStatus> {
    try {
      const response = await axios.get(
        `http://${this.config.host}:${this.config.port}/api/health`,
        {
          timeout: 5000,
        }
      )

      if (
        response.status === 200 &&
        response.data?.success &&
        response.data?.data?.services
      ) {
        return {
          stt: response.data.data.services.stt || false,
          tts: response.data.data.services.tts || false,
          embeddings: response.data.data.services.embeddings || false,
        }
      }
    } catch (error) {
      console.error('[BackendManager] Failed to get service status:', error)
    }

    return { stt: false, tts: false, embeddings: false }
  }

  /**
   * Get the base URL for API requests
   */
  getApiUrl(): string {
    return `http://${this.config.host}:${this.config.port}`
  }

  /**
   * Check if the manager is ready to handle requests
   */
  isReady(): boolean {
    return this.process !== null && !this.process.killed && !this.isShuttingDown
  }

  /**
   * Get Go backend executable path
   */
  private getBackendPath(): string | null {
    const isDev = !app.isPackaged

    if (isDev) {
      // Development mode - look for compiled Go binary in resources/backend/
      const devPath = path.join(
        __dirname,
        '../../resources/backend/alice-backend'
      )
      const devPathWin = devPath + '.exe'

      if (process.platform === 'win32') {
        if (fs.existsSync(devPathWin)) return devPathWin
      } else {
        if (fs.existsSync(devPath)) return devPath
      }

      console.warn(
        '[BackendManager] Go backend not built. Run: npm run build:go'
      )
      return null
    } else {
      // Production mode - use bundled executable
      const resourcesPath = process.resourcesPath
      const backendDir = path.join(resourcesPath, 'backend')

      let backendPath: string
      if (process.platform === 'win32') {
        backendPath = path.join(backendDir, 'alice-backend.exe')
      } else {
        backendPath = path.join(backendDir, 'alice-backend')
      }

      if (fs.existsSync(backendPath)) {
        return backendPath
      }

      console.error(
        '[BackendManager] Bundled Go backend not found at:',
        backendPath
      )
      return null
    }
  }

  /**
   * Wait for the Go server to be ready
   */
  private async waitForReady(): Promise<boolean> {
    const startTime = Date.now()
    const checkInterval = 500 // Check every 500ms

    while (Date.now() - startTime < this.config.timeout) {
      // Check if process died
      if (!this.process || this.process.killed) {
        console.error('[BackendManager] Process died while waiting for ready')
        return false
      }

      if (await this.isHealthy()) {
        return true
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    console.error(
      `[BackendManager] Timeout waiting for Go backend (${this.config.timeout}ms)`
    )
    return false
  }

  /**
   * Set up process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return

    this.process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim()
      if (output) {
        console.log(`[Go Backend] ${output}`)
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      const error = data.toString().trim()
      if (error) {
        console.error(`[Go Backend] ${error}`)
      }
    })

    this.process.on('close', (code: number | null, signal: string | null) => {
      console.log(
        `[BackendManager] Process exited with code ${code}, signal ${signal}`
      )

      if (code !== 0 && code !== null && !this.isShuttingDown) {
        console.error('[BackendManager] Go backend crashed unexpectedly')
      }
    })

    this.process.on('error', (error: Error) => {
      console.error('[BackendManager] Process error:', error)

      if (error.message.includes('ENOENT')) {
        console.error(
          '[BackendManager] Go backend executable not found. Run: npm run build:go'
        )
      }
    })
  }
}

// Global instance
export const backendManager = new BackendManager()
