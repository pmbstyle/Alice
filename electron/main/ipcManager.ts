import { ipcMain, desktopCapturer, shell, clipboard, app } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadSettings, saveSettings, AppSettings } from './settingsManager'
import {
  getWebSocketServer,
  restartWebSocketServer,
  stopWebSocketServer,
  startWebSocketServer,
} from './index'

function isBrowserContextToolEnabled(settings: any): boolean {
  return settings?.assistantTools?.includes('browser_context') || false
}
import {
  saveMemoryLocal,
  getRecentMemoriesLocal,
  updateMemoryLocal,
  deleteMemoryLocal,
  deleteAllMemoriesLocal,
} from './memoryManager'
import {
  addThoughtVector,
  searchSimilarThoughts,
  deleteAllThoughtVectors,
  getRecentMessagesForSummarization,
  saveConversationSummary,
  getLatestConversationSummary,
} from './thoughtVectorStore'
import * as googleAuthManager from './googleAuthManager'
import * as googleCalendarManager from './googleCalendarManager'
import * as googleGmailManager from './googleGmailManager'
import * as schedulerManager from './schedulerManager'
import {
  getMainWindow,
  resizeMainWindow,
  minimizeMainWindow,
  showOverlay,
  hideOverlay,
  focusMainWindow,
  getRendererDist,
} from './windowManager'
import {
  registerMicrophoneToggleHotkey,
  registerMutePlaybackHotkey,
  registerTakeScreenshotHotkey,
} from './hotkeyManager'
import { pythonManager } from './pythonManager'
import { pythonApi } from '../../src/services/pythonApi'

const USER_DATA_PATH = app.getPath('userData')
const GENERATED_IMAGES_DIR_NAME = 'generated_images'
const GENERATED_IMAGES_FULL_PATH = path.join(
  USER_DATA_PATH,
  GENERATED_IMAGES_DIR_NAME
)

let screenshotDataURL: string | null = null

let ipcHandlersRegistered = false

export function registerIPCHandlers(): void {
  if (ipcHandlersRegistered) {
    return
  }
  ipcHandlersRegistered = true

  // Window management
  ipcMain.on('resize', (event, arg) => {
    if (
      arg &&
      typeof arg.width === 'number' &&
      typeof arg.height === 'number'
    ) {
      resizeMainWindow(arg.width, arg.height)
    }
  })

  ipcMain.on('mini', (event, arg) => {
    if (arg && typeof arg.minimize === 'boolean') {
      minimizeMainWindow(arg.minimize)
    }
  })

  ipcMain.on('close-app', () => {
    app.quit()
  })

  // Thought vector operations
  ipcMain.handle(
    'thoughtVector:add',
    async (
      event,
      {
        conversationId,
        role,
        textContent,
        embedding,
      }: {
        conversationId: string
        role: string
        textContent: string
        embedding: number[]
      }
    ) => {
      try {
        const provider: 'openai' | 'local' = embedding.length === 1024 ? 'local' : 'openai'
        
        await addThoughtVector(conversationId, role, textContent, embedding, provider)
        return { success: true }
      } catch (error) {
        console.error('IPC thoughtVector:add error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'thoughtVector:search',
    async (
      event,
      {
        queryEmbedding,
        topK,
      }: {
        queryEmbedding: number[]
        topK: number
      }
    ) => {
      try {
        const provider: 'openai' | 'local' | 'both' = 
          queryEmbedding.length === 1024 ? 'local' :
          queryEmbedding.length === 1536 ? 'openai' : 'both'
        
        const thoughtsMetadatas = await searchSimilarThoughts(
          queryEmbedding,
          topK,
          provider
        )
        const thoughtTexts = thoughtsMetadatas.map(t => t.textContent)
        return { success: true, data: thoughtTexts }
      } catch (error) {
        console.error('[Main IPC thoughtVector:search] Error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('thoughtVector:delete-all', async () => {
    try {
      await deleteAllThoughtVectors()
      return { success: true }
    } catch (error) {
      console.error('IPC thoughtVector:delete-all error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Memory operations
  ipcMain.handle(
    'memory:save',
    async (
      event,
      {
        content,
        memoryType,
        embedding,
      }: { content: string; memoryType?: string; embedding?: number[] }
    ) => {
      try {
        const savedMemory = await saveMemoryLocal(
          content,
          memoryType,
          embedding
        )
        return { success: true, data: savedMemory }
      } catch (error) {
        console.error('IPC memory:save error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'memory:get',
    async (
      event,
      {
        limit,
        memoryType,
        queryEmbedding,
      }: { limit?: number; memoryType?: string; queryEmbedding?: number[] }
    ) => {
      try {
        const memories = await getRecentMemoriesLocal(
          limit,
          memoryType,
          queryEmbedding
        )
        return { success: true, data: memories }
      } catch (error) {
        console.error('IPC memory:get error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('memory:delete', async (event, { id }: { id: string }) => {
    try {
      const success = await deleteMemoryLocal(id)
      return { success }
    } catch (error) {
      console.error('IPC memory:delete error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'memory:update',
    async (
      event,
      {
        id,
        content,
        memoryType,
        embedding,
      }: {
        id: string
        content: string
        memoryType: string
        embedding?: number[]
      }
    ) => {
      try {
        const updatedMemory = await updateMemoryLocal(
          id,
          content,
          memoryType,
          embedding
        )
        if (updatedMemory) {
          return { success: true, data: updatedMemory }
        } else {
          return { success: false, error: 'Memory not found for update.' }
        }
      } catch (error) {
        console.error('IPC memory:update error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('memory:delete-all', async () => {
    try {
      await deleteAllMemoriesLocal()
      return { success: true }
    } catch (error) {
      console.error('IPC memory:delete-all error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // Summary operations
  ipcMain.handle(
    'summaries:get-recent-messages',
    async (
      event,
      { limit, conversationId }: { limit: number; conversationId?: string }
    ) => {
      try {
        const messages = await getRecentMessagesForSummarization(
          limit,
          conversationId
        )
        return { success: true, data: messages }
      } catch (error) {
        console.error('IPC summaries:get-recent-messages error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'summaries:save-summary',
    async (
      event,
      {
        summaryText,
        summarizedMessagesCount,
        conversationId,
      }: {
        summaryText: string
        summarizedMessagesCount: number
        conversationId?: string
      }
    ) => {
      try {
        const summaryRecord = await saveConversationSummary(
          summaryText,
          summarizedMessagesCount,
          conversationId
        )
        return { success: true, data: summaryRecord }
      } catch (error) {
        console.error('IPC summaries:save-summary error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'summaries:get-latest-summary',
    async (event, { conversationId }: { conversationId?: string }) => {
      try {
        const summary = await getLatestConversationSummary(conversationId)
        return { success: true, data: summary }
      } catch (error) {
        console.error('IPC summaries:get-latest-summary error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // System utilities
  ipcMain.handle('get-renderer-dist-path', async () => {
    return getRendererDist()
  })

  ipcMain.handle('screenshot', async (event, arg) => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: 1200,
        height: 1200,
      },
    })
    if (sources.length > 0) {
      return sources[0].thumbnail.toDataURL()
    }
    return null
  })

  ipcMain.handle('capture-screen', async () => {
    console.log('[Main IPC] "capture-screen" invoked.')
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      console.log('[Main IPC] "capture-screen" sources found:', sources.length)
      return sources
    } catch (error) {
      console.error('[Main IPC] "capture-screen" error:', error)
      return []
    }
  })

  // Overlay management
  ipcMain.handle('show-overlay', () => {
    return showOverlay()
  })

  ipcMain.handle('hide-overlay', () => {
    return hideOverlay()
  })

  // Screenshot management
  ipcMain.handle('save-screenshot', (event, dataURL: string) => {
    screenshotDataURL = dataURL
    const win = getMainWindow()
    win?.webContents.send('screenshot-captured')
    return true
  })

  ipcMain.handle('get-screenshot', () => {
    return screenshotDataURL
  })

  ipcMain.handle('focus-main-window', () => {
    return focusMainWindow()
  })


  // Settings management
  ipcMain.handle('settings:load', async () => {
    return await loadSettings()
  })

  ipcMain.handle(
    'settings:save',
    async (event, settingsToSave: AppSettings) => {
      try {
        const oldSettings = await loadSettings()
        await saveSettings(settingsToSave)

        // Handle hotkey changes
        if (
          oldSettings?.microphoneToggleHotkey !==
            settingsToSave.microphoneToggleHotkey ||
          (!oldSettings && settingsToSave.microphoneToggleHotkey)
        ) {
          console.log(
            '[Main IPC settings:save] Microphone toggle hotkey changed. Re-registering.'
          )
          registerMicrophoneToggleHotkey(settingsToSave.microphoneToggleHotkey)
        }

        if (
          oldSettings?.mutePlaybackHotkey !==
            settingsToSave.mutePlaybackHotkey ||
          (!oldSettings && settingsToSave.mutePlaybackHotkey)
        ) {
          console.log(
            '[Main IPC settings:save] Mute playback hotkey changed. Re-registering.'
          )
          registerMutePlaybackHotkey(settingsToSave.mutePlaybackHotkey)
        }

        if (
          oldSettings?.takeScreenshotHotkey !==
            settingsToSave.takeScreenshotHotkey ||
          (!oldSettings && settingsToSave.takeScreenshotHotkey)
        ) {
          console.log(
            '[Main IPC settings:save] Take screenshot hotkey changed. Re-registering.'
          )
          registerTakeScreenshotHotkey(settingsToSave.takeScreenshotHotkey)
        }

        // Handle WebSocket port changes
        if (
          oldSettings?.websocketPort !== settingsToSave.websocketPort ||
          (!oldSettings && settingsToSave.websocketPort)
        ) {
          console.log(
            '[Main IPC settings:save] WebSocket port changed. Restarting WebSocket server.'
          )
          restartWebSocketServer()
        }

        // Handle browser_context tool changes
        const oldBrowserContextEnabled =
          isBrowserContextToolEnabled(oldSettings)
        const newBrowserContextEnabled =
          isBrowserContextToolEnabled(settingsToSave)

        if (oldBrowserContextEnabled !== newBrowserContextEnabled) {
          if (newBrowserContextEnabled) {
            console.log(
              '[Main IPC settings:save] browser_context tool enabled. Starting WebSocket server.'
            )
            startWebSocketServer()
          } else {
            console.log(
              '[Main IPC settings:save] browser_context tool disabled. Stopping WebSocket server.'
            )
            stopWebSocketServer()
          }
        }

        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // Image management
  ipcMain.handle('image:save-generated', async (event, base64Data: string) => {
    try {
      await mkdir(GENERATED_IMAGES_FULL_PATH, { recursive: true })

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `alice_generated_${timestamp}.png`
      const absoluteFilePath = path.join(GENERATED_IMAGES_FULL_PATH, fileName)

      await writeFile(absoluteFilePath, Buffer.from(base64Data, 'base64'))

      console.log(
        '[Main IPC image:save-generated] Image saved to:',
        absoluteFilePath
      )
      return {
        success: true,
        fileName: fileName,
        absolutePathForOpening: absoluteFilePath,
      }
    } catch (error: any) {
      console.error(
        '[Main IPC image:save-generated] RAW ERROR during image save:',
        error
      )
      console.error(
        '[Main IPC image:save-generated] Error message:',
        error.message
      )
      console.error('[Main IPC image:save-generated] Error stack:', error.stack)

      const errorMessage =
        error && typeof error.message === 'string'
          ? error.message
          : 'Unknown error during image save.'
      return {
        success: false,
        error: `Failed to save image in main process: ${errorMessage}`,
      }
    }
  })

  // Save image from base64 for streaming image generation
  ipcMain.handle(
    'save-image-from-base64',
    async (
      event,
      args: {
        base64Data: string
        fileName: string
        isPartial: boolean
      }
    ) => {
      try {
        await mkdir(GENERATED_IMAGES_FULL_PATH, { recursive: true })

        const absoluteFilePath = path.join(
          GENERATED_IMAGES_FULL_PATH,
          args.fileName
        )
        const relativeImagePath = args.fileName

        await writeFile(
          absoluteFilePath,
          Buffer.from(args.base64Data, 'base64')
        )

        console.log(
          `[Main IPC save-image-from-base64] ${args.isPartial ? 'Partial' : 'Final'} image saved to:`,
          absoluteFilePath
        )

        return {
          success: true,
          fileName: args.fileName,
          absolutePath: absoluteFilePath,
          relativePath: relativeImagePath,
        }
      } catch (error: any) {
        console.error(
          '[Main IPC save-image-from-base64] Error saving image:',
          error.message
        )
        return {
          success: false,
          error: `Failed to save image: ${error.message}`,
        }
      }
    }
  )

  // System integration
  ipcMain.handle(
    'electron:open-path',
    async (event, args: { target: string }) => {
      if (
        !args ||
        typeof args.target !== 'string' ||
        args.target.trim() === ''
      ) {
        console.error('open_path: Invalid target received:', args)
        return {
          success: false,
          message: 'Error: No valid target path, name, or URL provided.',
        }
      }

      const targetPath = args.target.trim()
      console.log(`Main process received request to open: ${targetPath}`)

      try {
        if (
          targetPath.startsWith('http://') ||
          targetPath.startsWith('https://') ||
          targetPath.startsWith('mailto:')
        ) {
          console.log(`Opening external URL: ${targetPath}`)
          await shell.openExternal(targetPath)
          return {
            success: true,
            message: `Successfully initiated opening URL: ${targetPath}`,
          }
        } else {
          console.log(`Opening path/application: ${targetPath}`)
          const errorMessage = await shell.openPath(targetPath)

          if (errorMessage) {
            console.error(
              `Failed to open path "${targetPath}": ${errorMessage}`
            )
            return {
              success: false,
              message: `Error: Could not open "${targetPath}". Reason: ${errorMessage}`,
            }
          } else {
            return {
              success: true,
              message: `Successfully opened path: ${targetPath}`,
            }
          }
        }
      } catch (error: any) {
        console.error(`Unexpected error opening target "${targetPath}":`, error)
        return {
          success: false,
          message: `Error: An unexpected issue occurred while trying to open "${targetPath}". ${error.message || ''}`,
        }
      }
    }
  )

  ipcMain.handle(
    'electron:manage-clipboard',
    async (event, args: { action: 'read' | 'write'; content?: string }) => {
      if (!args || (args.action !== 'read' && args.action !== 'write')) {
        console.error(
          'manage_clipboard: Invalid action received:',
          args?.action
        )
        return {
          success: false,
          message:
            'Error: Invalid action specified. Must be "read" or "write".',
        }
      }

      try {
        if (args.action === 'read') {
          const clipboardText = clipboard.readText()
          console.log(
            'Clipboard read:',
            clipboardText.substring(0, 100) +
              (clipboardText.length > 100 ? '...' : '')
          )
          return {
            success: true,
            message: 'Successfully read text from clipboard.',
            data: clipboardText,
          }
        } else {
          if (typeof args.content !== 'string') {
            if (args.content === undefined || args.content === null) {
              console.error(
                'manage_clipboard: Content is missing for write action.'
              )
              return {
                success: false,
                message:
                  'Error: Text content must be provided for the "write" action (can be an empty string to clear).',
              }
            }
            console.error(
              'manage_clipboard: Content must be a string for write action.'
            )
            return {
              success: false,
              message:
                'Error: Text content must be a string for the "write" action.',
            }
          }

          clipboard.writeText(args.content)
          console.log('Clipboard write successful.')
          return {
            success: true,
            message: 'Successfully wrote text to clipboard.',
          }
        }
      } catch (error: any) {
        console.error(
          `Unexpected error during clipboard action "${args.action}":`,
          error
        )
        return {
          success: false,
          message: `Error: An unexpected issue occurred during the clipboard operation. ${error.message || ''}`,
        }
      }
    }
  )

  // Python Backend Management
  ipcMain.handle('python:start', async () => {
    try {
      const success = await pythonManager.start()
      return { success }
    } catch (error: any) {
      console.error('[IPC python:start] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:stop', async () => {
    try {
      await pythonManager.stop()
      return { success: true }
    } catch (error: any) {
      console.error('[IPC python:stop] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:restart', async () => {
    try {
      const success = await pythonManager.restart()
      return { success }
    } catch (error: any) {
      console.error('[IPC python:restart] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:health', async () => {
    try {
      const isHealthy = await pythonManager.isHealthy()
      return { success: true, healthy: isHealthy }
    } catch (error: any) {
      console.error('[IPC python:health] Error:', error)
      return { success: false, error: error.message, healthy: false }
    }
  })

  ipcMain.handle('python:service-status', async () => {
    try {
      const serviceStatus = await pythonManager.getServiceStatus()
      return { success: true, data: serviceStatus }
    } catch (error: any) {
      console.error('[IPC python:service-status] Error:', error)
      return { success: false, error: error.message }
    }
  })

  // Python STT (Speech-to-Text)
  ipcMain.handle('python:stt:transcribe-audio', async (event, { audioData, sampleRate, language }: { audioData: number[], sampleRate?: number, language?: string }) => {
    try {
      const result = await pythonApi.transcribeAudio(new Float32Array(audioData), sampleRate, language)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC python:stt:transcribe-audio] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:stt:transcribe-file', async (event, { file, language }: { file: Blob, language?: string }) => {
    try {
      const result = await pythonApi.transcribeFile(file, language)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC python:stt:transcribe-file] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:stt:ready', async () => {
    try {
      const ready = await pythonApi.isSTTReady()
      return { success: true, ready }
    } catch (error: any) {
      console.error('[IPC python:stt:ready] Error:', error)
      return { success: false, error: error.message, ready: false }
    }
  })

  ipcMain.handle('python:stt:info', async () => {
    try {
      const info = await pythonApi.getSTTInfo()
      return { success: true, data: info }
    } catch (error: any) {
      console.error('[IPC python:stt:info] Error:', error)
      return { success: false, error: error.message }
    }
  })

  // Python TTS (Text-to-Speech)
  ipcMain.handle('python:tts:synthesize', async (event, { text, voice }: { text: string, voice?: string }) => {
    try {
      const result = await pythonApi.synthesizeSpeech(text, voice)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC python:tts:synthesize] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:tts:voices', async () => {
    try {
      const voices = await pythonApi.getAvailableVoices()
      return { success: true, data: voices }
    } catch (error: any) {
      console.error('[IPC python:tts:voices] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:tts:test', async () => {
    try {
      const result = await pythonApi.testTTS()
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC python:tts:test] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:tts:ready', async () => {
    try {
      const ready = await pythonApi.isTTSReady()
      return { success: true, ready }
    } catch (error: any) {
      console.error('[IPC python:tts:ready] Error:', error)
      return { success: false, error: error.message, ready: false }
    }
  })

  ipcMain.handle('python:tts:info', async () => {
    try {
      const info = await pythonApi.getTTSInfo()
      return { success: true, data: info }
    } catch (error: any) {
      console.error('[IPC python:tts:info] Error:', error)
      return { success: false, error: error.message }
    }
  })

  // Python Embeddings
  ipcMain.handle('python:embeddings:generate', async (event, { text }: { text: string }) => {
    try {
      const result = await pythonApi.generateEmbedding(text)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC python:embeddings:generate] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:embeddings:generate-batch', async (event, { texts }: { texts: string[] }) => {
    try {
      const result = await pythonApi.generateEmbeddings(texts)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC python:embeddings:generate-batch] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:embeddings:similarity', async (event, { embedding1, embedding2 }: { embedding1: number[], embedding2: number[] }) => {
    try {
      const result = await pythonApi.computeSimilarity(embedding1, embedding2)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC python:embeddings:similarity] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:embeddings:search', async (event, { queryEmbedding, candidateEmbeddings, topK }: { queryEmbedding: number[], candidateEmbeddings: number[][], topK?: number }) => {
    try {
      const result = await pythonApi.searchSimilar(queryEmbedding, candidateEmbeddings, topK)
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC python:embeddings:search] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:embeddings:test', async () => {
    try {
      const result = await pythonApi.testEmbeddings()
      return { success: true, data: result }
    } catch (error: any) {
      console.error('[IPC python:embeddings:test] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('python:embeddings:ready', async () => {
    try {
      const ready = await pythonApi.isEmbeddingsReady()
      return { success: true, ready }
    } catch (error: any) {
      console.error('[IPC python:embeddings:ready] Error:', error)
      return { success: false, error: error.message, ready: false }
    }
  })

  ipcMain.handle('python:embeddings:info', async () => {
    try {
      const info = await pythonApi.getEmbeddingsInfo()
      return { success: true, data: info }
    } catch (error: any) {
      console.error('[IPC python:embeddings:info] Error:', error)
      return { success: false, error: error.message }
    }
  })
}

let googleIPCHandlersRegistered = false

export function registerGoogleIPCHandlers(): void {
  if (googleIPCHandlersRegistered) {
    return
  }
  googleIPCHandlersRegistered = true
  async function withAuthenticatedClient<T>(
    operation: (authClient: any) => Promise<T>,
    serviceName: string
  ): Promise<T | { success: false; error: string; unauthenticated?: boolean }> {
    const authClient = await googleAuthManager.getAuthenticatedClient()
    if (!authClient) {
      return {
        success: false,
        error: `User not authenticated with ${serviceName}. Please authenticate in settings.`,
        unauthenticated: true,
      }
    }
    return operation(authClient)
  }

  // Google Calendar handlers
  ipcMain.handle('google-calendar:list-events', async (event, args) => {
    return withAuthenticatedClient(
      authClient =>
        googleCalendarManager.listEvents(
          authClient,
          args.calendarId,
          args.timeMin,
          args.timeMax,
          args.q,
          args.maxResults
        ),
      'Google Calendar'
    )
  })

  ipcMain.handle('google-calendar:create-event', async (event, args) => {
    return withAuthenticatedClient(
      authClient =>
        googleCalendarManager.createEvent(
          authClient,
          args.calendarId,
          args.eventResource
        ),
      'Google Calendar'
    )
  })

  ipcMain.handle('google-calendar:update-event', async (event, args) => {
    return withAuthenticatedClient(
      authClient =>
        googleCalendarManager.updateEvent(
          authClient,
          args.calendarId,
          args.eventId,
          args.eventResource
        ),
      'Google Calendar'
    )
  })

  ipcMain.handle('google-calendar:delete-event', async (event, args) => {
    return withAuthenticatedClient(
      authClient =>
        googleCalendarManager.deleteEvent(
          authClient,
          args.calendarId,
          args.eventId
        ),
      'Google Calendar'
    )
  })

  // Gmail handlers
  ipcMain.handle('google-gmail:list-messages', async (event, args) => {
    return withAuthenticatedClient(
      authClient =>
        googleGmailManager.listMessages({
          authClient,
          userId: args.userId,
          maxResults: args.maxResults,
          labelIds: args.labelIds,
          q: args.q,
          includeSpamTrash: args.includeSpamTrash,
        }),
      'Gmail'
    )
  })

  ipcMain.handle('google-gmail:get-message', async (event, args) => {
    return withAuthenticatedClient(
      authClient =>
        googleGmailManager.getMessage({
          authClient,
          userId: args.userId,
          id: args.id,
          format: args.format,
        }),
      'Gmail'
    )
  })

  // Scheduler management
  ipcMain.handle('scheduler:create-task', async (event, args) => {
    try {
      const result = await schedulerManager.createScheduledTask(
        args.name,
        args.cronExpression,
        args.actionType,
        args.details
      )
      return result
    } catch (error: any) {
      console.error('[IPC scheduler:create-task] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('scheduler:get-all-tasks', async () => {
    try {
      const tasks = schedulerManager.getAllScheduledTasks()
      return { success: true, tasks }
    } catch (error: any) {
      console.error('[IPC scheduler:get-all-tasks] Error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(
    'scheduler:delete-task',
    async (event, { taskId }: { taskId: string }) => {
      try {
        const success = await schedulerManager.deleteScheduledTask(taskId)
        return { success }
      } catch (error: any) {
        console.error('[IPC scheduler:delete-task] Error:', error)
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle(
    'scheduler:toggle-task',
    async (event, { taskId }: { taskId: string }) => {
      try {
        const success = await schedulerManager.toggleTaskStatus(taskId)
        return { success }
      } catch (error: any) {
        console.error('[IPC scheduler:toggle-task] Error:', error)
        return { success: false, error: error.message }
      }
    }
  )

  // WebSocket communication for browser context
  ipcMain.handle('websocket:send-request', async (event, requestData: any) => {
    console.log(
      '[IPC websocket:send-request] Starting request with data:',
      requestData
    )

    try {
      const wss = getWebSocketServer()
      console.log(
        '[IPC websocket:send-request] WebSocket server status:',
        wss ? 'available' : 'null'
      )
      console.log(
        '[IPC websocket:send-request] Connected clients:',
        wss ? wss.clients.size : 0
      )

      if (!wss || wss.clients.size === 0) {
        console.error(
          '[IPC websocket:send-request] No WebSocket clients connected'
        )
        return {
          success: false,
          error:
            'No WebSocket clients connected. Ensure the Chrome extension is running.',
        }
      }

      return new Promise(resolve => {
        let resolved = false
        const timeout = setTimeout(() => {
          if (!resolved) {
            console.error(
              '[IPC websocket:send-request] Request timed out after 10 seconds'
            )
            resolved = true
            resolve({
              success: false,
              error:
                'WebSocket request timed out. Chrome extension may not be responding.',
            })
          }
        }, 10000)

        console.log(
          '[IPC websocket:send-request] Sending request to',
          wss.clients.size,
          'client(s)'
        )

        wss.clients.forEach((client: any) => {
          if (client.readyState === 1) {
            console.log(
              '[IPC websocket:send-request] Sending message to client:',
              requestData
            )
            client.send(JSON.stringify(requestData))

            const onMessage = (data: any) => {
              if (!resolved) {
                try {
                  const response = JSON.parse(data.toString())
                  console.log(
                    '[IPC websocket:send-request] Received message from client:',
                    response
                  )

                  if (
                    response.type === 'context_response' &&
                    response.requestId === requestData.requestId
                  ) {
                    console.log(
                      '[IPC websocket:send-request] Matching response received, resolving promise'
                    )
                    resolved = true
                    clearTimeout(timeout)
                    resolve({ success: true, data: response })
                    client.removeListener('message', onMessage)
                  } else {
                    console.log(
                      '[IPC websocket:send-request] Ignoring non-matching response:',
                      response.type,
                      'expected requestId:',
                      requestData.requestId,
                      'got:',
                      response.requestId
                    )
                  }
                } catch (error) {
                  console.error(
                    '[IPC websocket:send-request] Error parsing message:',
                    error
                  )
                }
              }
            }

            client.on('message', onMessage)
          } else {
            console.log(
              '[IPC websocket:send-request] Client not ready, state:',
              client.readyState
            )
          }
        })

        if (!resolved && wss.clients.size === 0) {
          console.error(
            '[IPC websocket:send-request] No clients to send message to'
          )
          clearTimeout(timeout)
          resolve({
            success: false,
            error: 'No active WebSocket connections',
          })
        }
      })
    } catch (error: any) {
      console.error('[IPC websocket:send-request] Error:', error)
      return {
        success: false,
        error: `WebSocket communication error: ${error.message}`,
      }
    }
  })

}
