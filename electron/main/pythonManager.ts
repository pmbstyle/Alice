/**
 * Python Backend Process Manager
 * Manages the Python AI backend subprocess
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

interface PythonManagerConfig {
  host: string
  port: number
  timeout: number
  maxRestarts: number
  restartDelay: number
}

interface ServiceStatus {
  stt: boolean
  tts: boolean
  embeddings: boolean
}

export class PythonManager {
  private process: ChildProcess | null = null
  private config: PythonManagerConfig
  private restartCount: number = 0
  private isShuttingDown: boolean = false
  private healthCheckInterval: NodeJS.Timeout | null = null
  private lastHealthCheck: number = 0
  private startupPromise: Promise<boolean> | null = null

  constructor(config: Partial<PythonManagerConfig> = {}) {
    this.config = {
      host: '127.0.0.1',
      port: 8765,
      timeout: 120000, // Increased to 2 minutes for AI model loading
      maxRestarts: 3,
      restartDelay: 5000,
      ...config
    }
  }

  /**
   * Start the Python backend process
   */
  async start(): Promise<boolean> {
    if (this.startupPromise) {
      return this.startupPromise
    }

    this.startupPromise = this._startInternal()
    return this.startupPromise
  }

  private async _startInternal(): Promise<boolean> {
    try {
      console.log('[PythonManager] Starting Python AI backend...')
      
      // Get Python executable and script paths
      const pythonInfo = await this.getPythonPaths()
      if (!pythonInfo) {
        console.error('[PythonManager] Failed to locate Python backend')
        return false
      }

      // Kill any existing process
      await this.stop()

      // Spawn Python process
      this.process = spawn(pythonInfo.pythonPath, [pythonInfo.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ALICE_HOST: this.config.host,
          ALICE_PORT: this.config.port.toString(),
          ALICE_LOG_LEVEL: 'INFO',
          PYTHONUNBUFFERED: '1',
          PYTHONDONTWRITEBYTECODE: '1'
        },
        detached: false
      })

      if (!this.process) {
        console.error('[PythonManager] Failed to spawn Python process')
        return false
      }

      console.log(`[PythonManager] Python process started with PID: ${this.process.pid}`)

      // Set up process event handlers
      this.setupProcessHandlers()

      // Wait for the server to be ready
      const isReady = await this.waitForReady()
      
      if (isReady) {
        console.log('[PythonManager] ✅ Python AI backend is ready')
        this.startHealthChecking()
        this.restartCount = 0
        this.startupPromise = null
        return true
      } else {
        console.error('[PythonManager] ❌ Python AI backend failed to start')
        await this.stop()
        this.startupPromise = null
        return false
      }

    } catch (error) {
      console.error('[PythonManager] Error starting Python backend:', error)
      this.startupPromise = null
      return false
    }
  }

  /**
   * Stop the Python backend process
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true
    console.log('[PythonManager] Stopping Python AI backend...')

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }

    // Terminate process if running
    if (this.process && !this.process.killed) {
      try {
        // Try graceful shutdown first
        this.process.kill('SIGTERM')

        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Force kill if still running
        if (!this.process.killed) {
          this.process.kill('SIGKILL')
        }
      } catch (error) {
        console.error('[PythonManager] Error stopping process:', error)
      }
    }

    this.process = null
    this.isShuttingDown = false
    this.startupPromise = null
    console.log('[PythonManager] Python AI backend stopped')
  }

  /**
   * Restart the Python backend process
   */
  async restart(): Promise<boolean> {
    if (this.restartCount >= this.config.maxRestarts) {
      console.error(`[PythonManager] Max restart attempts (${this.config.maxRestarts}) reached`)
      return false
    }

    this.restartCount++
    console.log(`[PythonManager] Restarting Python backend (attempt ${this.restartCount}/${this.config.maxRestarts})`)

    await this.stop()
    await new Promise(resolve => setTimeout(resolve, this.config.restartDelay))
    return this.start()
  }

  /**
   * Check if the Python backend is running and healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await axios.get(`http://${this.config.host}:${this.config.port}/api/health`, {
        timeout: 5000
      })
      
      this.lastHealthCheck = Date.now()
      return response.status === 200 && response.data?.status === 'healthy'
    } catch (error) {
      return false
    }
  }

  /**
   * Get the status of individual AI services
   */
  async getServiceStatus(): Promise<ServiceStatus> {
    try {
      const response = await axios.get(`http://${this.config.host}:${this.config.port}/api/health`, {
        timeout: 5000
      })
      
      if (response.status === 200 && response.data?.services) {
        return {
          stt: response.data.services.stt || false,
          tts: response.data.services.tts || false,
          embeddings: response.data.services.embeddings || false
        }
      }
    } catch (error) {
      console.error('[PythonManager] Failed to get service status:', error)
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
   * Get Python executable and script paths
   */
  private async getPythonPaths(): Promise<{ pythonPath: string; scriptPath: string } | null> {
    const isDev = !app.isPackaged
    
    if (isDev) {
      // Development mode - use source files
      const scriptPath = path.join(__dirname, '../../python/main.py')
      if (!fs.existsSync(scriptPath)) {
        console.error('[PythonManager] Python script not found at:', scriptPath)
        return null
      }

      // Try to find Python executable synchronously
      // On Windows, prioritize 'python' over 'python3'
      const pythonCandidates = process.platform === 'win32' 
        ? ['python', 'python3', 'py'] 
        : ['python3', 'python', 'py']
      for (const candidate of pythonCandidates) {
        try {
          const { execSync } = require('child_process')
          execSync(`${candidate} --version`, { stdio: 'pipe' })
          console.log(`[PythonManager] Found Python executable: ${candidate}`)
          return { pythonPath: candidate, scriptPath }
        } catch (error) {
          // Continue to next candidate
          continue
        }
      }

      // Default fallback
      const defaultPython = process.platform === 'win32' ? 'python' : 'python3'
      console.warn(`[PythonManager] No Python executable found, defaulting to ${defaultPython}`)
      return { pythonPath: defaultPython, scriptPath }
    } else {
      // Production mode - use bundled executable
      const resourcesPath = process.resourcesPath
      const pythonDir = path.join(resourcesPath, 'python')
      
      let pythonPath: string
      let scriptPath: string

      if (process.platform === 'win32') {
        pythonPath = path.join(pythonDir, 'alice-ai-backend.exe')
        scriptPath = '' // Not needed for bundled executable
      } else if (process.platform === 'darwin') {
        pythonPath = path.join(pythonDir, 'alice-ai-backend')
        scriptPath = '' // Not needed for bundled executable
      } else {
        pythonPath = path.join(pythonDir, 'alice-ai-backend')
        scriptPath = '' // Not needed for bundled executable
      }

      if (!fs.existsSync(pythonPath)) {
        console.error('[PythonManager] Bundled Python executable not found at:', pythonPath)
        return null
      }

      return { pythonPath, scriptPath }
    }
  }

  /**
   * Wait for the Python server to be ready
   */
  private async waitForReady(): Promise<boolean> {
    const startTime = Date.now()
    const checkInterval = 1000

    while (Date.now() - startTime < this.config.timeout) {
      if (await this.isHealthy()) {
        return true
      }

      // Check if process died
      if (!this.process || this.process.killed) {
        console.error('[PythonManager] Process died while waiting for ready')
        return false
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }

    console.error(`[PythonManager] Timeout waiting for Python backend (${this.config.timeout}ms)`)
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
        console.log(`[Python Backend] ${output}`)
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      const error = data.toString().trim()
      if (error) {
        console.error(`[Python Backend] ${error}`)
      }
    })

    this.process.on('close', (code: number | null, signal: string | null) => {
      console.log(`[PythonManager] Process exited with code ${code}, signal ${signal}`)
      
      if (!this.isShuttingDown && code !== 0) {
        console.warn('[PythonManager] Unexpected process termination, attempting restart...')
        setTimeout(() => {
          this.restart().catch(error => {
            console.error('[PythonManager] Failed to restart:', error)
          })
        }, this.config.restartDelay)
      }
    })

    this.process.on('error', (error: Error) => {
      console.error('[PythonManager] Process error:', error)
    })
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    const healthCheckInterval = 30000 // 30 seconds

    this.healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) return

      const isHealthy = await this.isHealthy()
      
      if (!isHealthy) {
        console.warn('[PythonManager] Health check failed, attempting restart...')
        this.restart().catch(error => {
          console.error('[PythonManager] Failed to restart after health check failure:', error)
        })
      }
    }, healthCheckInterval)
  }
}

// Global instance
export const pythonManager = new PythonManager()