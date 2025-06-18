import { ipcMain, desktopCapturer, shell, clipboard, app } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadSettings, saveSettings, AppSettings } from './settingsManager'
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
import { getMainWindow, resizeMainWindow, minimizeMainWindow, showOverlay, hideOverlay, focusMainWindow, getRendererDist } from './windowManager'
import { registerMicrophoneToggleHotkey, registerMutePlaybackHotkey, registerTakeScreenshotHotkey } from './hotkeyManager'

const USER_DATA_PATH = app.getPath('userData')
const GENERATED_IMAGES_DIR_NAME = 'generated_images'
const GENERATED_IMAGES_FULL_PATH = path.join(
  USER_DATA_PATH,
  GENERATED_IMAGES_DIR_NAME
)

let screenshotDataURL: string | null = null

export function registerIPCHandlers(): void {
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
        await addThoughtVector(conversationId, role, textContent, embedding)
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
        const thoughtsMetadatas = await searchSimilarThoughts(
          queryEmbedding,
          topK
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
}

export function registerGoogleIPCHandlers(): void {
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
}