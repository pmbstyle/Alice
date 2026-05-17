import { app, ipcMain, shell } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { getMainWindow } from './windowManager'

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

interface RpcResponse {
  id?: number | string
  result?: JsonValue
  error?: {
    code?: number
    message?: string
    data?: JsonValue
  }
}

interface RpcNotification {
  method: string
  params?: any
}

interface PendingRequest {
  method: string
  resolve: (value: JsonValue) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export interface CodexAccountStatus {
  available: boolean
  connected: boolean
  accountLabel?: string
  accountType?: string
  requiresOpenAIAuth?: boolean
  error?: string
}

export interface CodexModelInfo {
  id: string
  model: string
  displayName: string
  hidden?: boolean
  inputModalities?: string[]
  supportedReasoningEfforts?: string[]
}

const CODEX_REQUEST_TIMEOUT_MS = 30_000
const CODEX_LOGIN_TIMEOUT_MS = 10 * 60_000

class CodexAppServerClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private lines: readline.Interface | null = null
  private initialized = false
  private closed = false
  private nextId = 1
  private stderrTail = ''
  private readonly pending = new Map<number | string, PendingRequest>()

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly env: NodeJS.ProcessEnv
  ) {
    super()
  }

  async start(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.child = spawn(this.command, this.args, {
      env: this.env,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.child.once('error', error => this.closeWithError(error))
    this.child.once('exit', (code, signal) => {
      this.closeWithError(
        new Error(
          `codex app-server exited with code ${code ?? 'null'} and signal ${
            signal ?? 'null'
          }${this.stderrTail ? `: ${this.stderrTail}` : ''}`
        )
      )
    })
    this.child.stderr.on('data', chunk => {
      const text = chunk.toString('utf8')
      this.stderrTail = `${this.stderrTail}${text}`.slice(-4000)
      const trimmed = text.trim()
      if (trimmed) {
        console.log('[CodexAppServer]', trimmed)
      }
    })

    this.lines = readline.createInterface({ input: this.child.stdout })
    this.lines.on('line', line => this.handleLine(line))

    await this.request('initialize', {
      clientInfo: {
        name: 'alice_electron',
        title: 'Alice',
        version: app.getVersion(),
      },
      capabilities: {
        experimentalApi: true,
      },
    })
    this.notify('initialized', {})
    this.initialized = true
  }

  async request(
    method: string,
    params?: JsonValue,
    timeoutMs = CODEX_REQUEST_TIMEOUT_MS
  ): Promise<JsonValue> {
    if (this.closed) {
      throw new Error('codex app-server client is closed')
    }
    if (!this.child) {
      throw new Error('codex app-server is not running')
    }

    const id = this.nextId++
    const message = { method, id, ...(params === undefined ? {} : { params }) }

    return await new Promise<JsonValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)

      this.pending.set(id, { method, resolve, reject, timer })
      this.child!.stdin.write(`${JSON.stringify(message)}\n`, error => {
        if (error) {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(error)
        }
      })
    })
  }

  notify(method: string, params?: JsonValue): void {
    if (!this.child || this.closed) {
      return
    }
    const message = { method, ...(params === undefined ? {} : { params }) }
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  close(): void {
    this.closed = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('codex app-server client closed'))
    }
    this.pending.clear()
    this.lines?.close()
    this.lines = null
    this.child?.kill()
    this.child = null
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }

    let message: RpcResponse | RpcNotification
    try {
      message = JSON.parse(trimmed)
    } catch (error) {
      console.warn('[CodexAppServer] Failed to parse JSON-RPC line:', trimmed)
      return
    }

    if ('id' in message && message.id !== undefined) {
      const pending = this.pending.get(message.id)
      if (!pending) {
        return
      }
      clearTimeout(pending.timer)
      this.pending.delete(message.id)

      if ('error' in message && message.error) {
        pending.reject(
          new Error(message.error.message || `${pending.method} failed`)
        )
      } else {
        pending.resolve(message.result ?? null)
      }
      return
    }

    if ('method' in message && typeof message.method === 'string') {
      this.emit('notification', message)
    }
  }

  private closeWithError(error: Error): void {
    if (this.closed) {
      return
    }
    this.closed = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.emit('error', error)
  }
}

class CodexAppServerManager {
  private client: CodexAppServerClient | null = null
  private starting: Promise<CodexAppServerClient> | null = null

  async getStatus(): Promise<CodexAccountStatus> {
    try {
      const client = await this.getClient()
      const result = (await client.request('account/read', {
        refreshToken: false,
      })) as any
      return normalizeAccountStatus(result)
    } catch (error: any) {
      return {
        available: false,
        connected: false,
        error: error?.message || String(error),
      }
    }
  }

  async startLogin(): Promise<{
    success: boolean
    authUrl?: string
    loginId?: string
    error?: string
  }> {
    try {
      const client = await this.getClient()
      const response = (await client.request('account/login/start', {
        type: 'chatgpt',
        codexStreamlinedLogin: true,
      })) as any

      if (response?.type !== 'chatgpt' || !response.authUrl) {
        return {
          success: false,
          error: 'Codex did not return a ChatGPT authorization URL.',
        }
      }

      void shell.openExternal(response.authUrl)
      this.waitForLoginCompletion(client, response.loginId)
      return {
        success: true,
        authUrl: response.authUrl,
        loginId: response.loginId,
      }
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) }
    }
  }

  async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await this.getClient()
      await client.request('account/logout')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) }
    }
  }

  async listModels(): Promise<{
    success: boolean
    models?: CodexModelInfo[]
    error?: string
  }> {
    try {
      const client = await this.getClient()
      const response = (await client.request('model/list', {
        cursor: null,
        limit: 100,
        includeHidden: false,
      })) as any
      const models = Array.isArray(response?.data)
        ? response.data.map(normalizeModelInfo)
        : []
      return { success: true, models }
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) }
    }
  }

  async getClient(): Promise<CodexAppServerClient> {
    if (this.client) {
      return this.client
    }
    if (!this.starting) {
      this.starting = this.createClient()
    }
    this.client = await this.starting
    this.starting = null
    return this.client
  }

  stop(): void {
    this.client?.close()
    this.client = null
    this.starting = null
  }

  private async createClient(): Promise<CodexAppServerClient> {
    const codexHome = path.join(app.getPath('userData'), 'codex-home')
    const nativeHome = path.join(codexHome, 'home')
    await fs.mkdir(nativeHome, { recursive: true })

    const command = process.env.ALICE_CODEX_COMMAND || 'codex'
    const args = (process.env.ALICE_CODEX_ARGS || 'app-server')
      .split(/\s+/)
      .map(part => part.trim())
      .filter(Boolean)
    const env = {
      ...process.env,
      CODEX_HOME: codexHome,
      HOME: nativeHome,
    }
    delete env.OPENAI_API_KEY
    delete env.CODEX_API_KEY

    const client = new CodexAppServerClient(command, args, env)
    client.on('notification', notification => {
      this.handleNotification(notification as RpcNotification)
    })
    client.on('error', error => {
      console.error('[CodexAppServer] Client error:', error)
      if (this.client === client) {
        this.client = null
      }
    })
    await client.start()
    return client
  }

  private handleNotification(notification: RpcNotification): void {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) {
      return
    }

    if (notification.method === 'account/login/completed') {
      win.webContents.send('codex-auth-login-completed', notification.params)
    } else if (notification.method === 'account/updated') {
      win.webContents.send('codex-auth-updated', notification.params)
    }
  }

  private waitForLoginCompletion(
    client: CodexAppServerClient,
    loginId: string | undefined
  ): void {
    const timer = setTimeout(() => {
      client.off('notification', onNotification)
    }, CODEX_LOGIN_TIMEOUT_MS)

    const onNotification = (notification: RpcNotification) => {
      if (notification.method !== 'account/login/completed') {
        return
      }
      const params = notification.params || {}
      if (loginId && params.loginId && params.loginId !== loginId) {
        return
      }
      clearTimeout(timer)
      client.off('notification', onNotification)
      void this.getStatus().then(status => {
        const win = getMainWindow()
        win?.webContents.send('codex-auth-status-changed', status)
      })
    }

    client.on('notification', onNotification)
  }
}

function normalizeAccountStatus(response: any): CodexAccountStatus {
  const account = response?.account
  if (!account) {
    return {
      available: true,
      connected: false,
      requiresOpenAIAuth: Boolean(response?.requiresOpenAIAuth),
    }
  }

  if (account.type === 'chatgpt') {
    const plan = account.planType ? ` (${account.planType})` : ''
    return {
      available: true,
      connected: true,
      accountType: 'chatgpt',
      accountLabel: `${account.email || 'ChatGPT'}${plan}`,
      requiresOpenAIAuth: false,
    }
  }

  if (account.type === 'apiKey') {
    return {
      available: true,
      connected: true,
      accountType: 'apiKey',
      accountLabel: 'OpenAI API key',
      requiresOpenAIAuth: false,
    }
  }

  return {
    available: true,
    connected: true,
    accountType: account.type,
    accountLabel: account.type || 'Connected',
    requiresOpenAIAuth: false,
  }
}

function normalizeModelInfo(model: any): CodexModelInfo {
  return {
    id: model.id || model.model,
    model: model.model || model.id,
    displayName: model.displayName || model.id || model.model,
    hidden: Boolean(model.hidden),
    inputModalities: Array.isArray(model.inputModalities)
      ? model.inputModalities
      : [],
    supportedReasoningEfforts: Array.isArray(model.supportedReasoningEfforts)
      ? model.supportedReasoningEfforts.map((effort: any) =>
          typeof effort === 'string' ? effort : effort?.reasoningEffort
        )
      : [],
  }
}

export const codexAppServerManager = new CodexAppServerManager()

let codexIPCHandlersRegistered = false

export function registerCodexIPCHandlers(): void {
  if (codexIPCHandlersRegistered) {
    return
  }
  codexIPCHandlersRegistered = true

  ipcMain.handle('codex-auth:status', async () => {
    return codexAppServerManager.getStatus()
  })

  ipcMain.handle('codex-auth:start-login', async () => {
    return codexAppServerManager.startLogin()
  })

  ipcMain.handle('codex-auth:disconnect', async () => {
    return codexAppServerManager.logout()
  })

  ipcMain.handle('codex-models:list', async () => {
    return codexAppServerManager.listModels()
  })
}

export function stopCodexAppServer(): void {
  codexAppServerManager.stop()
}
