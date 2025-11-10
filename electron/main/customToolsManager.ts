import { app } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type {
  CustomToolDefinition,
  ValidatedCustomTool,
  CustomToolsSnapshot,
  UploadCustomToolScriptResult,
  CustomToolExecutionResult,
} from '../../types/customTools'

const CUSTOMIZATION_DIR_NAME = 'user-customization'
const CUSTOM_TOOL_FILE_NAME = 'custom-tools.json'
const CUSTOM_TOOL_SCRIPT_DIR = 'custom-tool-scripts'
const SUPPORTED_SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])
const DEMO_TOOL_SCRIPT_NAME = 'demo-greet-user.js'
const DEMO_TOOL_RELATIVE_ENTRY = path.join(
  CUSTOM_TOOL_SCRIPT_DIR,
  DEMO_TOOL_SCRIPT_NAME
).replace(/\\/g, '/')

function getCustomizationRoot(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), CUSTOMIZATION_DIR_NAME)
  }
  return path.join(process.cwd(), CUSTOMIZATION_DIR_NAME)
}

function getScriptsRoot(): string {
  return path.join(getCustomizationRoot(), CUSTOM_TOOL_SCRIPT_DIR)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

async function ensureCustomToolsFile(): Promise<string> {
  const customizationRoot = getCustomizationRoot()
  await ensureDirectoryExists(customizationRoot)
  await ensureCustomizationPackage(customizationRoot)
  await ensureDirectoryExists(getScriptsRoot())
  const filePath = path.join(customizationRoot, CUSTOM_TOOL_FILE_NAME)
  if (!existsSync(filePath)) {
    await bootstrapDemoTool(filePath)
  }
  return filePath
}

async function ensureCustomizationPackage(customizationRoot: string) {
  const packageJsonPath = path.join(customizationRoot, 'package.json')
  try {
    const contents = await fs.readFile(packageJsonPath, 'utf-8')
    const parsed = JSON.parse(contents)
    if (parsed?.type !== 'module') {
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ ...parsed, type: 'module' }, null, 2),
        'utf-8'
      )
    }
  } catch {
    await fs.writeFile(
      packageJsonPath,
      JSON.stringify({ name: 'alice-custom-tools', type: 'module' }, null, 2),
      'utf-8'
    )
  }
}

async function bootstrapDemoTool(filePath: string) {
  const customizationRoot = getCustomizationRoot()
  const scriptAbsolute = path.join(customizationRoot, DEMO_TOOL_RELATIVE_ENTRY)
  await ensureDirectoryExists(path.dirname(scriptAbsolute))
  const scriptContents = `export async function run(args, context) {
  const subject =
    typeof args?.name === 'string' && args.name.trim()
      ? args.name.trim()
      : 'friend'

  return {
    success: true,
    data: {
      message: \`Hello \${subject}! Alice demo tool at your service.\`,
      providedName: subject,
      timestamp: new Date().toISOString(),
      contextInfo: {
        customizationRoot: context?.customizationRoot,
        version: context?.appVersion,
      },
    },
  }
}
`

  await fs.writeFile(scriptAbsolute, scriptContents, 'utf-8')

  const demoTool: CustomToolDefinition = {
    id: 'demo_greet_user',
    name: 'demo_greet_user',
    description:
      'Greets the user and returns a friendly message. Use to verify custom tools.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Optional name to greet. Defaults to \"friend\".',
        },
      },
      additionalProperties: false,
    },
    strict: false,
    enabled: false,
    handler: {
      type: 'script',
      entry: DEMO_TOOL_RELATIVE_ENTRY,
      runtime: 'node',
    },
  }

  await fs.writeFile(filePath, JSON.stringify([demoTool], null, 2), 'utf-8')
}

function ensureToolDefaults(
  rawTool: Partial<CustomToolDefinition> | undefined,
  fallbackIndex: number
): CustomToolDefinition {
  const name =
    (typeof rawTool?.name === 'string' && rawTool.name.trim()) ||
    `custom_tool_${fallbackIndex}`

  const providedId =
    typeof rawTool?.id === 'string' && rawTool.id.trim()
      ? rawTool.id.trim()
      : undefined

  const handlerConfig = rawTool?.handler || { type: 'script', entry: '' }

  const derivedIdBase = slugify(
    `${name}-${handlerConfig && typeof handlerConfig.entry === 'string' ? handlerConfig.entry : fallbackIndex}`
  )
  const fallbackId =
    derivedIdBase || `${slugify(name) || 'custom-tool'}-${fallbackIndex}`
  const id = providedId || fallbackId

  const description =
    (typeof rawTool?.description === 'string' &&
      rawTool.description.trim()) ||
    'User provided custom tool.'

  const parameters =
    rawTool?.parameters && typeof rawTool.parameters === 'object'
      ? rawTool.parameters
      : { type: 'object', properties: {}, additionalProperties: false }

  if (
    !parameters ||
    typeof parameters !== 'object' ||
    parameters.type !== 'object'
  ) {
    parameters.type = 'object'
  }
  if (typeof parameters.properties !== 'object') {
    parameters.properties = {}
  }
  if (parameters.additionalProperties === undefined) {
    parameters.additionalProperties = false
  }

  return {
    id,
    name,
    description,
    parameters,
    strict: typeof rawTool?.strict === 'boolean' ? rawTool.strict : false,
    enabled: typeof rawTool?.enabled === 'boolean' ? rawTool.enabled : false,
    handler: {
      type:
        handlerConfig && typeof handlerConfig.type === 'string'
          ? handlerConfig.type
          : 'script',
      entry:
        handlerConfig && typeof handlerConfig.entry === 'string'
          ? handlerConfig.entry
          : '',
      runtime:
        handlerConfig && typeof handlerConfig.runtime === 'string'
          ? (handlerConfig.runtime as 'node')
          : 'node',
    },
    version:
      typeof rawTool?.version === 'string' ? rawTool.version.trim() : undefined,
    tags: Array.isArray(rawTool?.tags) ? rawTool?.tags : undefined,
    createdAt:
      typeof rawTool?.createdAt === 'string' ? rawTool.createdAt : undefined,
    updatedAt:
      typeof rawTool?.updatedAt === 'string' ? rawTool.updatedAt : undefined,
  }
}

function resolveEntryAbsolutePath(entry: string): string | null {
  if (!entry) return null
  if (path.isAbsolute(entry)) {
    return null
  }
  const customizationRoot = getCustomizationRoot()
  const candidatePath = path.resolve(customizationRoot, entry)
  const relative = path.relative(customizationRoot, candidatePath)
  if (relative.startsWith('..')) {
    return null
  }
  return candidatePath
}

async function validateTool(
  tool: CustomToolDefinition
): Promise<ValidatedCustomTool> {
  const errors: string[] = []
  let entryAbsolutePath: string | undefined

  if (!tool.name) {
    errors.push('Tool name is required.')
  }

  if (!tool.handler || tool.handler.type !== 'script') {
    errors.push('Only script-based handlers are supported for now.')
  }

  if (!tool.handler?.entry) {
    errors.push('Handler entry path is required.')
  } else {
    const absolute = resolveEntryAbsolutePath(tool.handler.entry)
    if (!absolute) {
      errors.push('Handler entry must be inside the user customization directory.')
    } else {
      entryAbsolutePath = absolute
      try {
        await fs.access(absolute)
        const extension = path.extname(absolute)
        if (!SUPPORTED_SCRIPT_EXTENSIONS.has(extension)) {
          errors.push(
            `Unsupported script extension "${extension}". Supported extensions: ${Array.from(SUPPORTED_SCRIPT_EXTENSIONS).join(', ')}`
          )
        }
      } catch {
        errors.push('Handler entry file does not exist.')
      }
    }
  }

  return {
    ...tool,
    errors,
    isValid: errors.length === 0,
    entryAbsolutePath,
  }
}

async function readToolsArray(): Promise<any[]> {
  const filePath = await ensureCustomToolsFile()
  const fileContents = await fs.readFile(filePath, 'utf-8').catch(() => '[]')
  if (!fileContents.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(fileContents)
    if (Array.isArray(parsed)) {
      return parsed
    }
    return []
  } catch (error) {
    throw new Error((error as Error).message)
  }
}

async function writeToolsArray(tools: CustomToolDefinition[]): Promise<void> {
  const filePath = await ensureCustomToolsFile()
  const payload = JSON.stringify(tools, null, 2)
  await fs.writeFile(filePath, payload, 'utf-8')
}

export async function loadCustomToolsFromDisk(): Promise<CustomToolsSnapshot> {
  const filePath = await ensureCustomToolsFile()
  const diagnostics: string[] = []
  let rawTools: any[] = []

  let fileContents = '[]'
  try {
    fileContents = await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    diagnostics.push(
      `Failed to read custom tools file: ${(error as Error).message}`
    )
  }

  if (fileContents.trim()) {
    try {
      const parsed = JSON.parse(fileContents)
      if (Array.isArray(parsed)) {
        rawTools = parsed
      } else {
        diagnostics.push('Custom tools file must be an array.')
      }
    } catch (error) {
      diagnostics.push(`Custom tools JSON is invalid: ${(error as Error).message}`)
    }
  }

  const hydratedTools = rawTools.map((raw, index) =>
    ensureToolDefaults(raw, index)
  )

  const validatedTools = await Promise.all(
    hydratedTools.map(tool => validateTool(tool))
  )

  const stats = await fs.stat(filePath).catch(() => null)
  return {
    tools: validatedTools,
    filePath,
    lastModified: stats?.mtimeMs ?? null,
    diagnostics,
  }
}

async function mutateTools(
  mutator: (tools: CustomToolDefinition[]) => CustomToolDefinition[]
): Promise<CustomToolsSnapshot> {
  const currentRaw = await readToolsArray()
  const hydrated = currentRaw.map((raw, index) =>
    ensureToolDefaults(raw, index)
  )
  const next = mutator(hydrated)
  await writeToolsArray(next)
  return await loadCustomToolsFromDisk()
}

export async function saveCustomTools(
  tools: CustomToolDefinition[]
): Promise<CustomToolsSnapshot> {
  await writeToolsArray(tools)
  return loadCustomToolsFromDisk()
}

export async function replaceCustomToolsJson(rawJson: string): Promise<CustomToolsSnapshot> {
  let parsed: any
  try {
    parsed = JSON.parse(rawJson)
  } catch (error) {
    throw new Error(`Invalid JSON: ${(error as Error).message}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Custom tools JSON must be an array of tool definitions.')
  }

  const normalized = parsed.map((raw: any, index: number) =>
    ensureToolDefaults(raw, index)
  )
  await writeToolsArray(normalized)
  return loadCustomToolsFromDisk()
}

export async function upsertCustomTool(
  tool: Partial<CustomToolDefinition>
): Promise<CustomToolsSnapshot> {
  return mutateTools(current => {
    const normalized = ensureToolDefaults(tool, current.length + 1)
    const existingIndex = current.findIndex(t => t.id === normalized.id)
    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], ...normalized }
    } else {
      current.push(normalized)
    }
    return current
  })
}

export async function toggleCustomTool(
  id: string,
  enabled: boolean
): Promise<CustomToolsSnapshot> {
  return mutateTools(current => {
    return current.map(tool =>
      tool.id === id ? { ...tool, enabled } : tool
    )
  })
}

export async function deleteCustomTool(id: string): Promise<CustomToolsSnapshot> {
  return mutateTools(current => current.filter(tool => tool.id !== id))
}

export async function uploadCustomToolScript(
  fileName: string,
  buffer: Buffer
): Promise<UploadCustomToolScriptResult> {
  if (!fileName) {
    throw new Error('File name is required.')
  }
  const sanitizedBase = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
  const providedExtension = path.extname(sanitizedBase)
  const extensionToUse = providedExtension || '.js'
  if (!SUPPORTED_SCRIPT_EXTENSIONS.has(extensionToUse)) {
    throw new Error(
      `Unsupported file extension ${extensionToUse}. Allowed extensions: ${Array.from(SUPPORTED_SCRIPT_EXTENSIONS).join(', ')}`
    )
  }
  const baseName = providedExtension
    ? sanitizedBase.slice(0, -providedExtension.length)
    : sanitizedBase
  const finalName = `${baseName}${extensionToUse}`
  const scriptsRoot = getScriptsRoot()
  await ensureDirectoryExists(scriptsRoot)
  const destinationPath = path.join(scriptsRoot, finalName)
  await fs.writeFile(destinationPath, buffer)
  return {
    relativePath: path
      .relative(getCustomizationRoot(), destinationPath)
      .replace(/\\/g, '/'),
    absolutePath: destinationPath,
  }
}

export async function executeCustomTool(
  name: string,
  args: Record<string, any>
): Promise<CustomToolExecutionResult> {
  const snapshot = await loadCustomToolsFromDisk()
  const tool = snapshot.tools.find(t => t.name === name)

  if (!tool) {
    return { success: false, error: `Custom tool "${name}" not found.` }
  }

  if (!tool.enabled) {
    return { success: false, error: `Custom tool "${name}" is disabled.` }
  }

  if (!tool.isValid || !tool.entryAbsolutePath) {
    return {
      success: false,
      error: `Custom tool "${name}" is invalid. Resolve validation errors in settings before using it.`,
    }
  }

  try {
    const moduleUrl = `${pathToFileURL(tool.entryAbsolutePath).href}?update=${Date.now()}`
    const importedModule = await import(moduleUrl)
    const handler =
      typeof importedModule?.run === 'function'
        ? importedModule.run
        : typeof importedModule?.default === 'function'
          ? importedModule.default
          : typeof importedModule?.execute === 'function'
            ? importedModule.execute
            : null

    if (!handler) {
      return {
        success: false,
        error: 'Custom tool script must export a function named run, execute, or a default function.',
      }
    }

    const context = {
      appVersion: app.getVersion(),
      customizationRoot: getCustomizationRoot(),
      scriptsRoot: getScriptsRoot(),
      userDataPath: app.getPath('userData'),
      log: (...messages: unknown[]) => {
        console.log(`[Custom Tool:${tool.name}]`, ...messages)
      },
    }

    const result = await handler(args || {}, context)

    if (typeof result === 'object' && result && 'success' in result) {
      return result as CustomToolExecutionResult
    }

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    console.error(`[Custom Tools] Failed to execute ${name}:`, error)
    return {
      success: false,
      error: (error as Error).message || 'Unknown error executing custom tool.',
    }
  }
}
