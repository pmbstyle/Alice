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
  private lastRestartTime: number = 0
  private consecutiveFailures: number = 0
  private maxConsecutiveFailures: number = 3
  private emergencyStopActivated: boolean = false

  constructor(config: Partial<PythonManagerConfig> = {}) {
    this.config = {
      host: '127.0.0.1',
      port: 8765,
      timeout: 120000,
      maxRestarts: 3,
      restartDelay: 5000,
      ...config
    }
  }

  /**
   * Check for existing alice-ai-backend processes to prevent spawning loops
   */
  private async checkExistingProcesses(): Promise<number> {
    try {
      const { exec } = await import('child_process')
      return new Promise<number>((resolve) => {
        if (process.platform === 'win32') {
          exec('tasklist | findstr /i alice-ai-backend', (error: any, stdout: string) => {
            if (error) {
              resolve(0)
              return
            }
            const lines = stdout.trim().split('\n').filter(line => line.includes('alice-ai-backend'))
            const count = lines.length
            console.log(`[PythonManager] Found ${count} existing alice-ai-backend processes`)
            resolve(count)
          })
        } else {
          exec('ps aux | grep alice-ai-backend | grep -v grep | wc -l', (error: any, stdout: string) => {
            const count = parseInt(stdout.trim()) || 0
            console.log(`[PythonManager] Found ${count} existing alice-ai-backend processes`)
            resolve(count)
          })
        }
      })
    } catch (error) {
      console.error('[PythonManager] Error checking existing processes:', error)
      return 0
    }
  }

  /**
   * Kill all alice-ai-backend processes to prevent accumulation
   */
  private async killAllBackendProcesses(): Promise<void> {
    try {
      const { exec } = await import('child_process')
      console.log('[PythonManager] Killing all alice-ai-backend processes...')
      
      if (process.platform === 'win32') {
        exec('taskkill /f /im alice-ai-backend.exe', (error: any) => {
          if (error && !error.message.includes('not found')) {
            console.error('[PythonManager] Error killing processes:', error.message)
          }
        })
      } else {
        exec('pkill -f alice-ai-backend', (error: any) => {
          if (error && error.code !== 1) {
            console.error('[PythonManager] Error killing processes:', error.message)
          }
        })
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (error) {
      console.error('[PythonManager] Error in killAllBackendProcesses:', error)
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
      // Emergency stop check
      if (this.emergencyStopActivated) {
        console.error('[PythonManager] Emergency stop activated - refusing to start')
        return false
      }

      // Check for existing processes first
      const existingCount = await this.checkExistingProcesses()
      if (existingCount > 5) {
        console.error(`[PythonManager] CRITICAL: Found ${existingCount} existing processes - activating emergency stop`)
        this.emergencyStopActivated = true
        await this.killAllBackendProcesses()
        return false
      }

      // Check consecutive failures
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        console.error(`[PythonManager] Too many consecutive failures (${this.consecutiveFailures}) - refusing to start`)
        return false
      }

      // Exponential backoff
      const now = Date.now()
      const timeSinceLastRestart = now - this.lastRestartTime
      const minDelay = Math.min(this.config.restartDelay * Math.pow(2, this.consecutiveFailures), 30000)
      
      if (timeSinceLastRestart < minDelay) {
        console.log(`[PythonManager] Too soon to restart (${timeSinceLastRestart}ms < ${minDelay}ms) - backing off`)
        return false
      }

      console.log('[PythonManager] Starting Python AI backend...')
      
      // Get Python executable and script paths
      const pythonInfo = await this.getPythonPaths()
      if (!pythonInfo) {
        console.error('[PythonManager] Failed to locate Python backend')
        this.consecutiveFailures++
        return false
      }

      // Kill any existing process and clean up system
      await this.stop()
      await this.killAllBackendProcesses()
      this.lastRestartTime = now

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
        this.consecutiveFailures = 0
        this.startupPromise = null
        return true
      } else {
        console.error('[PythonManager] ❌ Python AI backend failed to start')
        this.consecutiveFailures++
        await this.stop()
        this.startupPromise = null
        return false
      }

    } catch (error) {
      console.error('[PythonManager] Error starting Python backend:', error)
      this.consecutiveFailures++
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
        console.log(`[PythonManager] Attempting to kill Python process PID: ${this.process.pid}`)
        
        // On Windows, use taskkill for more reliable termination
        if (process.platform === 'win32' && this.process.pid) {
          const { exec } = await import('child_process')
          
          // First try to kill just this process
          exec(`taskkill /f /pid ${this.process.pid}`, (error) => {
            if (error) {
              console.warn(`[PythonManager] taskkill failed for PID ${this.process.pid}:`, error.message)
            } else {
              console.log(`[PythonManager] Successfully killed Python process PID: ${this.process.pid}`)
            }
          })
          
          // Wait briefly
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // If still running, kill all alice-ai-backend processes
          if (!this.process.killed) {
            console.log('[PythonManager] Process still running, killing all alice-ai-backend processes')
            await this.killAllBackendProcesses()
          }
        } else {
          // Unix-like systems
          this.process.kill('SIGTERM')
          
          // Wait a bit for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Force kill if still running
          if (!this.process.killed) {
            this.process.kill('SIGKILL')
          }
        }
      } catch (error) {
        console.error('[PythonManager] Error stopping process:', error)
        // Emergency cleanup - kill all backend processes
        await this.killAllBackendProcesses()
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

      // Try to find Python executable asynchronously
      // On Windows, prioritize 'python' over 'python3'
      const pythonCandidates = process.platform === 'win32' 
        ? ['python', 'python3', 'py'] 
        : ['python3', 'python', 'py']
      
      // Import execSync once
      const { execSync } = await import('child_process')
      
      for (const candidate of pythonCandidates) {
        try {
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
        scriptPath = ''
      } else if (process.platform === 'darwin') {
        pythonPath = path.join(pythonDir, 'alice-ai-backend')
        scriptPath = ''
      } else {
        pythonPath = path.join(pythonDir, 'alice-ai-backend')
        scriptPath = ''
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
      
      // Safeguards before restarting
      if (!this.isShuttingDown && code !== 0) {
        // Check if emergency stop is activated
        if (this.emergencyStopActivated) {
          console.error('[PythonManager] Emergency stop activated - NOT restarting process')
          return
        }

        // Check consecutive failures
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          console.error(`[PythonManager] Too many consecutive failures (${this.consecutiveFailures}) - NOT restarting`)
          return
        }

        // Check restart count
        if (this.restartCount >= this.config.maxRestarts) {
          console.error(`[PythonManager] Max restart attempts reached (${this.restartCount}) - NOT restarting`)
          return
        }

        console.warn('[PythonManager] Unexpected process termination, attempting restart...')
        
        // Use exponential backoff delay
        const backoffDelay = Math.min(this.config.restartDelay * Math.pow(2, this.consecutiveFailures), 30000)
        
        setTimeout(() => {
          this.restart().catch(error => {
            console.error('[PythonManager] Failed to restart:', error)
          })
        }, backoffDelay)
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
    const healthCheckInterval = 30000

    this.healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) return

      const isHealthy = await this.isHealthy()
      
      if (!isHealthy) {
        // Safeguards to health check restarts
        if (this.emergencyStopActivated || 
            this.consecutiveFailures >= this.maxConsecutiveFailures ||
            this.restartCount >= this.config.maxRestarts) {
          console.warn('[PythonManager] Health check failed but restart prevented by safeguards')
          return
        }

        console.warn('[PythonManager] Health check failed, attempting restart...')
        this.restart().catch(error => {
          console.error('[PythonManager] Failed to restart after health check failure:', error)
        })
      }
    }, healthCheckInterval)
  }

  /**
   * EMERGENCY: Reset emergency stop and consecutive failures
   * Only use this if you're sure the runaway process issue is resolved
   */
  resetEmergencyStop(): void {
    console.log('[PythonManager] Resetting emergency stop state')
    this.emergencyStopActivated = false
    this.consecutiveFailures = 0
    this.restartCount = 0
    this.lastRestartTime = 0
  }

  /**
   * Get current safeguard status for debugging
   */
  getSafeguardStatus() {
    return {
      emergencyStopActivated: this.emergencyStopActivated,
      consecutiveFailures: this.consecutiveFailures,
      restartCount: this.restartCount,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
      maxRestarts: this.config.maxRestarts,
      lastRestartTime: this.lastRestartTime
    }
  }
}

// Global instance
export const pythonManager = new PythonManager()