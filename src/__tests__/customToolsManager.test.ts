import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest'
import path from 'node:path'
import fs from 'node:fs/promises'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const testRoot = mkdtempSync(path.join(os.tmpdir(), 'alice-custom-tools-'))
const userDataDir = path.join(testRoot, 'user-data')
mkdirSync(userDataDir, { recursive: true })
let cwdSpy: ReturnType<typeof vi.spyOn> | null = null

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: (key: string) => (key === 'userData' ? userDataDir : testRoot),
    getVersion: () => '0.0.0-test',
  },
}))

import {
  loadCustomToolsFromDisk,
  replaceCustomToolsJson,
  uploadCustomToolScript,
  executeCustomTool,
  deleteCustomTool,
} from '../../electron/main/customToolsManager'

const customizationRoot = path.join(testRoot, 'user-customization')
const toolsFilePath = path.join(customizationRoot, 'custom-tools.json')
const packageJsonPath = path.join(customizationRoot, 'package.json')

async function resetCustomizationDir() {
  await fs.rm(customizationRoot, { recursive: true, force: true })
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true })
}

describe('customToolsManager', () => {
  beforeAll(async () => {
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(testRoot)
    await resetCustomizationDir()
  })

  afterAll(() => {
    cwdSpy?.mockRestore()
    rmSync(testRoot, { recursive: true, force: true })
  })

  beforeEach(async () => {
    await resetCustomizationDir()
  })

  it('creates default file with demo tool on first load', async () => {
    const snapshot = await loadCustomToolsFromDisk()
    expect(snapshot.tools).toHaveLength(1)
    expect(snapshot.tools[0].name).toBe('demo_greet_user')
    expect(snapshot.diagnostics).toEqual([])
    const fileExists = await fs
      .access(toolsFilePath)
      .then(() => true)
      .catch(() => false)
    expect(fileExists).toBe(true)
    const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    expect(pkg.type).toBe('module')
  })

  it('reports validation errors for invalid entries', async () => {
    await fs.mkdir(customizationRoot, { recursive: true })
    await fs.writeFile(
      toolsFilePath,
      JSON.stringify(
        [
          {
            name: 'bad_tool',
            description: 'bad',
            enabled: true,
            handler: { type: 'script', entry: '../escape.js' },
            parameters: { type: 'object', properties: {} },
          },
        ],
        null,
        2
      )
    )

    const snapshot = await loadCustomToolsFromDisk()
    expect(snapshot.tools).toHaveLength(1)
    const [tool] = snapshot.tools
    expect(tool.isValid).toBe(false)
    expect(tool.errors.some(error => error.includes('customization directory'))).toBe(
      true
    )
  })

  it('normalizes parameters when missing type', async () => {
    await ensureDir(path.join(customizationRoot, 'custom-tool-scripts'))
    await fs.writeFile(
      path.join(customizationRoot, 'custom-tool-scripts/sample.js'),
      'export const run = () => ({ success: true })'
    )
    await fs.writeFile(
      toolsFilePath,
      JSON.stringify(
        [
          {
            name: 'paramless_tool',
            description: 'test',
            enabled: true,
            handler: { type: 'script', entry: 'custom-tool-scripts/sample.js' },
            parameters: { properties: {} },
          },
        ],
        null,
        2
      )
    )
    const snapshot = await loadCustomToolsFromDisk()
    expect(snapshot.tools[0].parameters.type).toBe('object')
  })

  it('clones parameter schemas so edits do not leak across tools', async () => {
    await ensureDir(path.join(customizationRoot, 'custom-tool-scripts'))
    await fs.writeFile(
      path.join(customizationRoot, 'custom-tool-scripts/sample.js'),
      'export const run = () => ({ success: true })'
    )
    const sharedParameters = { type: 'object', properties: {} }
    await fs.writeFile(
      toolsFilePath,
      JSON.stringify(
        [
          {
            id: 'shared-tool',
            name: 'shared-tool',
            description: 'test',
            enabled: true,
            handler: { type: 'script', entry: 'custom-tool-scripts/sample.js' },
            parameters: sharedParameters,
          },
        ],
        null,
        2
      )
    )

    const snapshot = await loadCustomToolsFromDisk()
    expect(snapshot.tools[0].parameters).not.toBe(sharedParameters)
    snapshot.tools[0].parameters.properties.foo = { type: 'string' }
    expect(sharedParameters.properties).toEqual({})
  })

  it('uploads, registers, and executes a custom tool script', async () => {
    const uploadResult = await uploadCustomToolScript(
      'weather.js',
      Buffer.from(
        `export async function run(args) {
          return { success: true, data: { echo: args.city } }
        }`
      )
    )

    const toolDefinition = [
      {
        name: 'fetch_weather',
        description: 'Fetches weather',
        enabled: true,
        handler: { type: 'script', entry: uploadResult.relativePath },
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
      },
    ]

    await replaceCustomToolsJson(JSON.stringify(toolDefinition))

    const result = await executeCustomTool('fetch_weather', { city: 'Lisbon' })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ echo: 'Lisbon' })

    const snapshot = await loadCustomToolsFromDisk()
    expect(snapshot.tools).toHaveLength(1)
    const toolId = snapshot.tools[0].id

    const snapshotAfterDelete = await deleteCustomTool(toolId)
    expect(snapshotAfterDelete.tools).toHaveLength(0)
  })

})
