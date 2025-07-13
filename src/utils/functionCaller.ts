import axios from 'axios'
import { useSettingsStore } from '../stores/settingsStore'
import { createEmbedding } from '../services/apiService'
import {
  parseNaturalLanguageToCron,
  validateCronExpression,
} from './cronParser'

interface Crawl4AiArgs {
  url: string
}

interface FunctionResult {
  success: boolean
  data?: any
  error?: string
}

interface OpenPathArgs {
  target: string
}

interface TorrentSearchArgs {
  query: string
}

interface AddTorrentArgs {
  magnet: string
}

interface SaveMemoryArgs {
  content: string
  memoryType?: string
}

interface GetRecentMemoriesArgs {
  query?: string
  memoryType?: string
}

interface DeleteMemoryArgs {
  id: string
}

interface GetUnreadEmailsArgs {
  maxResults?: number
}

interface SearchEmailsArgs {
  query: string
  maxResults?: number
}

interface GetEmailContentArgs {
  messageId: string
}

interface ListDirectoryArgs {
  path: string
}

interface ExecuteCommandArgs {
  command: string
}

interface ScheduleTaskArgs {
  name: string
  schedule: string
  action_type: 'command' | 'reminder'
  details: string
}

interface ManageScheduledTasksArgs {
  action: 'list' | 'delete' | 'toggle'
  task_id?: string
}

async function save_memory(args: SaveMemoryArgs) {
  if (!args.content) {
    return { success: false, error: 'Content is required.' }
  }
  try {
    let generatedEmbedding: number[] | undefined = undefined
    try {
      generatedEmbedding = await createEmbedding(args.content)
      if (generatedEmbedding.length === 0) {
        console.warn(
          '[FunctionCaller save_memory] Generated empty embedding for content:',
          args.content
        )
        generatedEmbedding = undefined
      }
    } catch (embedError) {
      console.error(
        '[FunctionCaller save_memory] Error generating embedding for memory:',
        embedError
      )
    }

    const result = await window.ipcRenderer.invoke('memory:save', {
      content: args.content,
      memoryType: args.memoryType,
      embedding: generatedEmbedding,
    })
    if (result.success) {
      console.log('Memory saved via IPC:', result.data)
      return { success: true, data: result.data }
    } else {
      return {
        success: false,
        error: result.error || 'Error saving memory via IPC.',
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function delete_memory(args: DeleteMemoryArgs) {
  try {
    const result = await window.ipcRenderer.invoke('memory:delete', {
      id: args.id,
    })
    if (result.success) {
      console.log('Memory deleted via IPC:', args.id)
      return {
        success: true,
        data: { message: 'Memory deleted successfully.' },
      }
    } else {
      return {
        success: false,
        error: result.error || 'Error deleting memory via IPC.',
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function recall_memories(args: GetRecentMemoriesArgs) {
  try {
    let queryEmbedding: number[] | undefined = undefined
    if (args.query && args.query.trim()) {
      try {
        queryEmbedding = await createEmbedding(args.query)
        if (queryEmbedding.length === 0) {
          console.warn(
            '[FunctionCaller recall_memories] Generated empty embedding for query:',
            args.query
          )
          queryEmbedding = undefined
        }
      } catch (embedError) {
        console.error(
          '[FunctionCaller recall_memories] Error generating embedding for query:',
          embedError
        )
      }
    }

    const result = await window.ipcRenderer.invoke('memory:get', {
      limit: 20,
      memoryType: args.memoryType,
      queryEmbedding: queryEmbedding,
    })

    if (result.success) {
      console.log('Memories fetched via IPC:', result.data)
      return { success: true, data: result.data }
    } else {
      return {
        success: false,
        error: result.error || 'Error fetching memories via IPC.',
      }
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Error fetching memories.',
    }
  }
}

/**
 * Gets the current date and time information.
 */
async function get_current_datetime(args: {
  format?: 'full' | 'date_only' | 'time_only' | 'year_only'
}): Promise<FunctionResult> {
  try {
    const now = new Date()
    const format = args.format || 'full'

    let result: any = {
      unix_timestamp: Math.floor(now.getTime() / 1000),
      utc_iso_string: now.toISOString(),
    }

    switch (format) {
      case 'date_only':
        result.formatted = now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        break

      case 'time_only':
        result.formatted = now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        })
        break

      case 'year_only':
        result.formatted = now.getFullYear().toString()
        break

      default:
        result.formatted = now.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        })
        result.date = {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
        }
        result.time = {
          hour: now.getHours(),
          minute: now.getMinutes(),
          second: now.getSeconds(),
        }
    }

    console.log('Current datetime fetch successful.')
    return { success: true, data: result }
  } catch (error: any) {
    console.error('Error getting current datetime:', error.message)
    return {
      success: false,
      error: `Failed to get current datetime: ${error.message}`,
    }
  }
}

/**
 * Opens a file, folder, application, or URL using the system's default handler.
 */
async function open_path(args: OpenPathArgs): Promise<FunctionResult> {
  console.log(`Invoking open_path with target: ${args.target}`)

  try {
    if (typeof window === 'undefined' || !window.ipcRenderer?.invoke) {
      return {
        success: false,
        error:
          'Electron IPC bridge not available. This function only works in the desktop app.',
      }
    }

    const result = await window.ipcRenderer.invoke('electron:open-path', args)
    console.log('Main process response for open_path:', result)

    if (result.success) {
      return { success: true, data: { message: result.message } }
    } else {
      return { success: false, error: result.message }
    }
  } catch (error) {
    console.error('Error invoking electron:open-path:', error)
    return {
      success: false,
      error: `Failed to execute open_path: ${error.message || 'Unknown error'}`,
    }
  }
}

/**
 * Manages the system clipboard by reading or writing text content.
 */
async function manage_clipboard(args: {
  action: 'read' | 'write'
  content?: string
}): Promise<FunctionResult> {
  console.log(`Invoking clipboard action: ${args.action}`)

  try {
    if (typeof window === 'undefined' || !window.ipcRenderer?.invoke) {
      return {
        success: false,
        error:
          'Electron IPC bridge not available. This function only works in the desktop app.',
      }
    }

    if (args.action !== 'read' && args.action !== 'write') {
      return {
        success: false,
        error: 'Invalid clipboard action. Must be "read" or "write".',
      }
    }

    if (
      args.action === 'write' &&
      (args.content === undefined || args.content === null)
    ) {
      return {
        success: false,
        error: 'Content is required for clipboard write operations.',
      }
    }

    const result = await window.ipcRenderer.invoke(
      'electron:manage-clipboard',
      args
    )
    console.log('Main process response for clipboard operation:', result)

    if (result.success) {
      if (args.action === 'read' && result.data !== undefined) {
        return {
          success: true,
          data: result.data,
        }
      }

      return {
        success: true,
        data: { message: result.message },
      }
    } else {
      return {
        success: false,
        error: result.message,
      }
    }
  } catch (error) {
    console.error('Error during clipboard operation:', error)
    return {
      success: false,
      error: `Failed to perform clipboard operation: ${error.message || 'Unknown error'}`,
    }
  }
}

/**
 * Searches for torrents using the Torrent Search API.
 */

async function search_torrents(
  args: TorrentSearchArgs
): Promise<FunctionResult> {
  const settings = useSettingsStore().config
  const JACKETT_API_KEY = settings.VITE_JACKETT_API_KEY
  const JACKETT_URL = settings.VITE_JACKETT_URL

  if (!JACKETT_API_KEY || !JACKETT_URL || !args.query) {
    return { success: false, error: 'Missing Jackett configuration or query.' }
  }

  try {
    const url = `${JACKETT_URL}/api/v2.0/indexers/all/results/torznab/api?apikey=${JACKETT_API_KEY}&t=search&q=${encodeURIComponent(args.query)}`
    const response = await axios.get(url, { responseType: 'text' })

    const parser = new DOMParser()
    const xml = parser.parseFromString(response.data, 'application/xml')
    const items = Array.from(xml.querySelectorAll('item'))

    const results = items
      .map(item => ({
        title: item.querySelector('title')?.textContent ?? 'No title',
        magnet: getMagnetLink(item),
        seeders: getAttributeValue(item, 'seeders'),
        size: formatFileSize(item.querySelector('size')?.textContent ?? ''),
      }))
      .filter(item => item.magnet.startsWith('magnet:'))
      .sort((a, b) => parseInt(b.seeders ?? '0') - parseInt(a.seeders ?? '0'))
      .slice(0, 8)

    console.log('Torrent search results:', results)

    return { success: true, data: results }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to parse XML' }
  }
}

interface CalendarEventResource {
  summary?: string
  description?: string
  start?: { dateTime?: string; timeZone?: string; date?: string }
  end?: { dateTime?: string; timeZone?: string; date?: string }
  location?: string
  attendees?: { email: string }[]
}

/**
 * Retrieves a list of events from the user's Google Calendar.
 */

async function get_calendar_events(args: {
  calendarId?: string
  timeMin?: string
  timeMax?: string
  q?: string
  maxResults?: number
}): Promise<FunctionResult> {
  try {
    const result = await window.ipcRenderer.invoke(
      'google-calendar:list-events',
      {
        calendarId: args.calendarId || 'primary',
        timeMin: args.timeMin,
        timeMax: args.timeMax,
        q: args.q,
        maxResults: args.maxResults || 10,
      }
    )
    if (result.success) {
      return { success: true, data: result.data || 'No events found.' }
    }
    return {
      success: false,
      error: result.error || 'Failed to list calendar events.',
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}

/**
 * Creates a new event in the user's Google Calendar.
 */

async function create_calendar_event(args: {
  calendarId?: string
  summary: string
  description?: string
  startDateTime: string
  endDateTime: string
  location?: string
  attendees?: string[]
}): Promise<FunctionResult> {
  try {
    const eventResource: CalendarEventResource = {
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.startDateTime },
      end: { dateTime: args.endDateTime },
      location: args.location,
    }
    if (args.attendees && args.attendees.length > 0) {
      eventResource.attendees = args.attendees.map(email => ({ email }))
    }

    const result = await window.ipcRenderer.invoke(
      'google-calendar:create-event',
      {
        calendarId: args.calendarId || 'primary',
        eventResource,
      }
    )
    if (result.success) {
      return { success: true, data: result.data }
    }
    return {
      success: false,
      error: result.error || 'Failed to create calendar event.',
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}

/**
 * Updates an existing event in the user's Google Calendar.
 */

async function update_calendar_event(args: {
  calendarId?: string
  eventId: string
  summary?: string
  description?: string
  startDateTime?: string
  endDateTime?: string
  location?: string
  attendees?: string[]
}): Promise<FunctionResult> {
  try {
    const eventResource: CalendarEventResource = {}
    if (args.summary) eventResource.summary = args.summary
    if (args.description) eventResource.description = args.description
    if (args.startDateTime)
      eventResource.start = { dateTime: args.startDateTime }
    if (args.endDateTime) eventResource.end = { dateTime: args.endDateTime }
    if (args.location) eventResource.location = args.location
    if (args.attendees && args.attendees.length > 0) {
      eventResource.attendees = args.attendees.map(email => ({ email }))
    }

    if (Object.keys(eventResource).length === 0) {
      return {
        success: false,
        error: 'No fields provided to update for the event.',
      }
    }

    const result = await window.ipcRenderer.invoke(
      'google-calendar:update-event',
      {
        calendarId: args.calendarId || 'primary',
        eventId: args.eventId,
        eventResource,
      }
    )
    if (result.success) {
      return { success: true, data: result.data }
    }
    return {
      success: false,
      error: result.error || 'Failed to update calendar event.',
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}

/**
 * Deletes an event from the user's Google Calendar.
 */

async function delete_calendar_event(args: {
  calendarId?: string
  eventId: string
}): Promise<FunctionResult> {
  try {
    const result = await window.ipcRenderer.invoke(
      'google-calendar:delete-event',
      {
        calendarId: args.calendarId || 'primary',
        eventId: args.eventId,
      }
    )
    if (result.success) {
      return { success: true, data: result.data }
    }
    return {
      success: false,
      error: result.error || 'Failed to delete calendar event.',
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}

/**
 * Helper function to process email details for AI
 */

function processEmailForAI(
  emailData: any,
  isRequestingFullContent: boolean = false
) {
  if (!emailData) return 'Email data not found.'
  const headers = emailData.payload?.headers || []
  const subject =
    headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject'
  const from =
    headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender'
  const date =
    headers.find((h: any) => h.name === 'Date')?.value || 'Unknown Date'

  let mainContentOutput: string

  if (isRequestingFullContent) {
    mainContentOutput =
      emailData.decodedPlainTextBody ||
      emailData.snippet ||
      'No detailed content available.'
  } else {
    mainContentOutput = emailData.snippet || 'No snippet available.'
  }

  const returnedObject: any = {
    id: emailData.id,
    threadId: emailData.threadId,
    subject,
    from,
    date,
  }

  if (isRequestingFullContent) {
    returnedObject.content = mainContentOutput
  } else {
    returnedObject.snippet =
      mainContentOutput.substring(0, 250) +
      (mainContentOutput.length > 250 ? '...' : '')
  }

  return returnedObject
}

/**
 * Fetches unread emails from the user's Gmail account.
 */

async function get_unread_emails(
  args: GetUnreadEmailsArgs
): Promise<FunctionResult> {
  try {
    const listResult = await window.ipcRenderer.invoke(
      'google-gmail:list-messages',
      {
        maxResults: args.maxResults || 5,
        labelIds: ['UNREAD'],
        q: 'is:unread',
      }
    )

    if (
      listResult.success &&
      listResult.data &&
      Array.isArray(listResult.data)
    ) {
      if (listResult.data.length === 0) {
        return { success: true, data: 'No unread emails found.' }
      }
      const emailDetailsPromises = listResult.data.map(msg =>
        window.ipcRenderer.invoke('google-gmail:get-message', {
          id: msg.id,
          format: 'metadata',
        })
      )
      const emailDetailsResults = await Promise.all(emailDetailsPromises)
      const processedEmails = emailDetailsResults
        .filter(res => res.success && res.data)
        .map(res => processEmailForAI(res.data, false))
      return { success: true, data: processedEmails }
    }
    return {
      success: false,
      error: listResult.error || 'Failed to fetch unread emails.',
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}

/**
 * Searches emails in the user's Gmail account based on a query.
 */

async function search_emails(args: SearchEmailsArgs): Promise<FunctionResult> {
  if (!args.query) {
    return { success: false, error: 'Search query is required.' }
  }
  try {
    const listResult = await window.ipcRenderer.invoke(
      'google-gmail:list-messages',
      {
        q: args.query,
        maxResults: args.maxResults || 10,
      }
    )
    if (
      listResult.success &&
      listResult.data &&
      Array.isArray(listResult.data)
    ) {
      if (listResult.data.length === 0) {
        return {
          success: true,
          data: `No emails found for query: "${args.query}"`,
        }
      }
      const emailDetailsPromises = listResult.data.map(msg =>
        window.ipcRenderer.invoke('google-gmail:get-message', {
          id: msg.id,
          format: 'metadata',
        })
      )
      const emailDetailsResults = await Promise.all(emailDetailsPromises)
      const processedEmails = emailDetailsResults
        .filter(res => res.success && res.data)
        .map(res => processEmailForAI(res.data, false))
      return { success: true, data: processedEmails }
    }
    return {
      success: false,
      error:
        listResult.error ||
        `Failed to search emails for query: "${args.query}"`,
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}

/**
 * Fetches the content of an email using its message ID.
 */

async function get_email_content(
  args: GetEmailContentArgs
): Promise<FunctionResult> {
  if (!args.messageId) {
    return {
      success: false,
      error: 'Message ID is required to get email content.',
    }
  }
  try {
    const result = await window.ipcRenderer.invoke('google-gmail:get-message', {
      id: args.messageId,
      format: 'full',
    })
    if (result.success && result.data) {
      const processedData = processEmailForAI(result.data, true)
      return { success: true, data: processedData }
    }
    return {
      success: false,
      error: result.error || 'Failed to fetch email content.',
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}

async function list_directory(
  args: ListDirectoryArgs
): Promise<FunctionResult> {
  try {
    const result = await window.ipcRenderer.invoke(
      'desktop:listDirectory',
      args.path
    )
    if (result.success) {
      return { success: true, data: result.files }
    } else {
      return { success: false, error: result.error }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function execute_command(
  args: ExecuteCommandArgs
): Promise<FunctionResult> {
  try {
    const settingsStore = useSettingsStore()
    const commandName = args.command.split(' ')[0]

    if (!settingsStore.isCommandApproved(args.command)) {
      const approvalResult = await (window as any).requestCommandApproval(
        args.command
      )

      if (!approvalResult.approved) {
        return { success: false, error: 'Command execution denied by user' }
      }
    }

    const result = await window.ipcRenderer.invoke(
      'desktop:executeCommand',
      args.command
    )
    if (result.success) {
      return { success: true, data: result.output }
    } else {
      return { success: false, error: result.error }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function schedule_task(args: ScheduleTaskArgs): Promise<FunctionResult> {
  try {
    let cronExpression = parseNaturalLanguageToCron(args.schedule)

    if (!cronExpression) {
      if (validateCronExpression(args.schedule)) {
        cronExpression = args.schedule
      } else {
        return {
          success: false,
          error: `Unable to parse schedule "${args.schedule}". Try formats like "every morning at 8 AM", "every hour", "daily at 6 PM", or use cron format like "0 8 * * *".`,
        }
      }
    }

    if (!validateCronExpression(cronExpression)) {
      return {
        success: false,
        error: `Generated cron expression "${cronExpression}" is invalid.`,
      }
    }

    const result = await window.ipcRenderer.invoke('scheduler:create-task', {
      name: args.name,
      cronExpression,
      actionType: args.action_type,
      details: args.details,
    })

    if (result.success) {
      return {
        success: true,
        data: {
          message: `Task "${args.name}" scheduled successfully.`,
          taskId: result.taskId,
          cronExpression,
          schedule: args.schedule,
        },
      }
    } else {
      return {
        success: false,
        error: result.error || 'Failed to create scheduled task.',
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function manage_scheduled_tasks(
  args: ManageScheduledTasksArgs
): Promise<FunctionResult> {
  try {
    switch (args.action) {
      case 'list': {
        const result = await window.ipcRenderer.invoke(
          'scheduler:get-all-tasks'
        )
        if (result.success) {
          const tasks = result.tasks.map((task: any) => ({
            id: task.id,
            name: task.name,
            schedule: task.cronExpression,
            actionType: task.actionType,
            details: task.details,
            isActive: task.isActive,
            createdAt: task.createdAt,
            lastRun: task.lastRun,
            nextRun: task.nextRun,
          }))
          return {
            success: true,
            data: {
              message: `Found ${tasks.length} scheduled tasks.`,
              tasks,
            },
          }
        } else {
          return {
            success: false,
            error: result.error || 'Failed to get scheduled tasks.',
          }
        }
      }

      case 'delete': {
        if (!args.task_id) {
          return {
            success: false,
            error: 'Task ID is required for delete action.',
          }
        }

        const result = await window.ipcRenderer.invoke(
          'scheduler:delete-task',
          {
            taskId: args.task_id,
          }
        )

        if (result.success) {
          return {
            success: true,
            data: { message: `Task ${args.task_id} deleted successfully.` },
          }
        } else {
          return {
            success: false,
            error: result.error || 'Failed to delete task.',
          }
        }
      }

      case 'toggle': {
        if (!args.task_id) {
          return {
            success: false,
            error: 'Task ID is required for toggle action.',
          }
        }

        const result = await window.ipcRenderer.invoke(
          'scheduler:toggle-task',
          {
            taskId: args.task_id,
          }
        )

        if (result.success) {
          return {
            success: true,
            data: {
              message: `Task ${args.task_id} status toggled successfully.`,
            },
          }
        } else {
          return {
            success: false,
            error: result.error || 'Failed to toggle task status.',
          }
        }
      }

      default:
        return { success: false, error: `Unknown action: ${args.action}` }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Helpers for parsing torrent data.
 */

function formatFileSize(bytes: string): string {
  const b = parseInt(bytes, 10)
  if (isNaN(b)) return 'unknown'
  const kb = b / 1024
  const mb = kb / 1024
  const gb = mb / 1024
  if (gb > 1) return `${gb.toFixed(1)} GB`
  if (mb > 1) return `${mb.toFixed(1)} MB`
  return `${kb.toFixed(1)} KB`
}

function getAttributeValue(item: Element, attrName: string): string {
  const attrs = item.getElementsByTagName('torznab:attr')
  for (const attr of Array.from(attrs)) {
    if (attr.getAttribute('name') === attrName) {
      return attr.getAttribute('value') ?? ''
    }
  }
  return ''
}

function getMagnetLink(item: Element): string {
  const guid = item.querySelector('guid')?.textContent
  if (guid?.startsWith('magnet:')) return guid

  const attrs = item.getElementsByTagName('torznab:attr')
  for (const attr of Array.from(attrs)) {
    if (attr.getAttribute('name') === 'magneturl') {
      return attr.getAttribute('value') ?? ''
    }
  }

  return ''
}

/**
 * Adds a torrent to qBittorrent using the provided magnet link.
 */
async function add_torrent_to_qb(
  args: AddTorrentArgs
): Promise<FunctionResult> {
  const settings = useSettingsStore().config
  const isDev = import.meta.env.DEV
  const QB_BASE_URL = isDev ? '' : settings.VITE_QB_URL
  const QB_USERNAME = settings.VITE_QB_USERNAME
  const QB_PASSWORD = settings.VITE_QB_PASSWORD

  if (!QB_USERNAME || !QB_PASSWORD) {
    return { success: false, error: 'qBittorrent credentials not configured.' }
  }
  if (!args.magnet) {
    return { success: false, error: 'Magnet link is missing.' }
  }

  console.log('Adding torrent to qBittorrent:', args.magnet)

  try {
    const loginRes = await axios.post(
      `${QB_BASE_URL}/api/v2/auth/login`,
      new URLSearchParams({ username: QB_USERNAME, password: QB_PASSWORD }),
      { withCredentials: true }
    )

    if (loginRes.data !== 'Ok.') {
      return { success: false, error: 'Login failed' }
    }

    await axios.post(
      `${QB_BASE_URL}/api/v2/torrents/add`,
      new URLSearchParams({ urls: args.magnet }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        withCredentials: true,
      }
    )

    return { success: true, data: 'Torrent added successfully.' }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to add torrent.' }
  }
}

const functionRegistry: {
  [key: string]: (args: any) => Promise<FunctionResult>
} = {
  save_memory: save_memory,
  delete_memory: delete_memory,
  recall_memories: recall_memories,
  get_current_datetime: get_current_datetime,
  open_path: open_path,
  manage_clipboard: manage_clipboard,
  search_torrents: search_torrents,
  add_torrent_to_qb: add_torrent_to_qb,
  get_calendar_events,
  create_calendar_event,
  update_calendar_event,
  delete_calendar_event,
  get_unread_emails,
  search_emails,
  get_email_content,
  list_directory,
  execute_command,
  schedule_task,
  manage_scheduled_tasks,
}

const functionSchemas = {
  save_memory: { required: ['content'] },
  delete_memory: { required: ['id'] },
  recall_memories: { required: [] },
  get_current_datetime: { required: ['format'] },
  open_path: { required: ['target'] },
  manage_clipboard: { required: ['action'] },
  search_torrents: { required: ['query'] },
  add_torrent_to_qb: { required: ['magnet'] },
  get_calendar_events: { required: [] },
  create_calendar_event: {
    required: ['summary', 'startDateTime', 'endDateTime'],
  },
  update_calendar_event: { required: ['eventId'] },
  delete_calendar_event: { required: ['eventId'] },
  get_unread_emails: { required: [] },
  search_emails: { required: ['query'] },
  get_email_content: { required: ['messageId'] },
  list_directory: { required: ['path'] },
  execute_command: { required: ['command'] },
  schedule_task: { required: ['name', 'schedule', 'action_type', 'details'] },
  manage_scheduled_tasks: { required: ['action'] },
}

/**
 * Executes the appropriate local function based on the name provided by the AI.
 * Parses arguments string and returns the result as a plain string suitable for OpenAI tool output.
 */
export async function executeFunction(
  name: string,
  argsString: any
): Promise<string> {
  const func = functionRegistry[name]
  const schema = functionSchemas[name as keyof typeof functionSchemas]

  if (!func) {
    console.error(`Function ${name} not found in registry.`)
    return `Error: Function ${name} not found.`
  }

  try {
    let args: any
    if (typeof argsString === 'string') {
      args = argsString.trim() === '' ? {} : JSON.parse(argsString)
    } else if (typeof argsString === 'object' && argsString !== null) {
      args = argsString
    } else {
      args = {}
    }
    console.log(`Executing function "${name}" with args:`, args)

    if (schema?.required) {
      for (const requiredParam of schema.required) {
        if (
          !(requiredParam in args) ||
          args[requiredParam] === null ||
          args[requiredParam] === undefined ||
          (typeof args[requiredParam] === 'string' &&
            args[requiredParam].trim() === '' &&
            !(
              name === 'manage_clipboard' &&
              args.action === 'write' &&
              requiredParam === 'content'
            ))
        ) {
          console.warn(
            `Pre-computation validation failed: Missing required parameter "${requiredParam}" for function "${name}".`
          )
          return `Error: Cannot execute ${name}: Missing required parameter '${requiredParam}'. Please provide it.`
        }
      }
    }

    const result: FunctionResult = await func(args)

    console.log(`Function "${name}" executed. Result:`, result)

    if (
      name === 'manage_clipboard' &&
      args.action === 'read' &&
      result.success &&
      result.data !== undefined
    ) {
      return typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data)
    }

    if (result.success) {
      return JSON.stringify(
        result.data || { message: 'Action completed successfully.' }
      )
    } else {
      return `Error executing ${name}: ${result.error || 'Unknown error'}`
    }
  } catch (error: any) {
    console.error(
      `Error parsing arguments or executing function ${name}:`,
      error
    )
    if (error instanceof SyntaxError && typeof argsString === 'string') {
      return `Error processing function ${name}: Invalid JSON arguments provided: "${argsString}"`
    }
    return `Error processing function ${name}: ${error.message || 'Unknown error'}`
  }
}
