export type CustomToolRuntime = 'node'

export interface CustomToolHandlerConfig {
  type: 'script'
  entry: string
  runtime?: CustomToolRuntime
}

export interface CustomToolDefinition {
  /**
   * Stable identifier for internal lookups. Defaults to name slug if omitted.
   */
  id: string
  /** Name that will be exposed to the LLM for function calling */
  name: string
  description: string
  parameters: Record<string, any>
  strict?: boolean
  enabled: boolean
  handler: CustomToolHandlerConfig
  version?: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}

export interface ValidatedCustomTool extends CustomToolDefinition {
  isValid: boolean
  errors: string[]
  entryAbsolutePath?: string
}

export interface CustomToolsSnapshot {
  tools: ValidatedCustomTool[]
  filePath: string
  lastModified: number | null
  diagnostics: string[]
}

export interface CustomToolExecutionResult {
  success: boolean
  data?: any
  error?: string
  logs?: string[]
}

export interface SaveCustomToolsPayload {
  tools: CustomToolDefinition[]
}

export interface ReplaceCustomToolsJsonPayload {
  rawJson: string
}

export interface UploadCustomToolScriptPayload {
  fileName: string
  buffer: ArrayBuffer | Buffer
}

export interface UploadCustomToolScriptResult {
  relativePath: string
  absolutePath: string
}

export interface CustomToolTogglePayload {
  id: string
  enabled: boolean
}

export interface CustomToolDeletePayload {
  id: string
}

export interface ExecuteCustomToolPayload {
  name: string
  args: Record<string, any>
}
