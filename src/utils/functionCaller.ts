import { createEmbedding } from '../services/apiService'
import { manage_clipboard } from './functions/clipboard'
import {
  open_path,
  list_directory,
  execute_command,
} from './functions/filesystem'
import {
  schedule_task,
  manage_scheduled_tasks,
  get_calendar_events,
  create_calendar_event,
  update_calendar_event,
  delete_calendar_event,
} from './functions/calendar'
import { search_torrents, add_torrent_to_qb } from './functions/torrent'
import axios from 'axios'

interface FunctionResult {
  success: boolean
  data?: any
  error?: string
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

interface BrowserContextArgs {
  focus?: 'content' | 'selection' | 'links' | 'all'
  maxLength?: number
}

interface WebSearchArgs {
  query: string
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
      const emailDetailsPromises = listResult.data.map((msg: any) =>
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
      const emailDetailsPromises = listResult.data.map((msg: any) =>
        window.ipcRenderer.invoke('google-gmail:get-message', {
          id: msg.id,
          format: 'metadata',
        })
      )
      const emailDetailsResults = await Promise.all(emailDetailsPromises)
      const processedEmails = emailDetailsResults
        .filter((res: any) => res.success && res.data)
        .map((res: any) => processEmailForAI(res.data, false))
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

async function browser_context(
  args: BrowserContextArgs = {}
): Promise<FunctionResult> {
  try {
    const requestData = {
      type: 'get_context',
      requestId: `browser_context_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      options: {
        focus: args.focus || 'all',
        maxLength: args.maxLength || 4000,
        aggressiveMode: true,
        enableSummarization: true,
      },
    }

    console.log('Requesting browser context via WebSocket:', requestData)

    const result = await window.ipcRenderer.invoke(
      'websocket:send-request',
      requestData
    )

    if (result.success && result.data) {
      console.log('Browser context received:', result.data)

      let formattedResponse = 'Browser Context:\n'

      if (result.data.url) {
        formattedResponse += `\nURL: ${result.data.url}`
      }

      if (result.data.title) {
        formattedResponse += `\nTitle: ${result.data.title}`
      }

      if (
        result.data.content &&
        (args.focus === 'content' || args.focus === 'all')
      ) {
        formattedResponse += `\n\nContent:\n${result.data.content}`
      }

      if (
        result.data.selection &&
        (args.focus === 'selection' || args.focus === 'all')
      ) {
        formattedResponse += `\n\nSelected Text:\n"${result.data.selection}"`
      }

      if (
        result.data.links &&
        (args.focus === 'links' || args.focus === 'all') &&
        result.data.links.length > 0
      ) {
        formattedResponse += `\n\nLinks (${result.data.links.length}):`
        result.data.links.slice(0, 10).forEach((link: any, index: number) => {
          formattedResponse += `\n${index + 1}. ${link.text} → ${link.href}`
        })
        if (result.data.links.length > 10) {
          formattedResponse += `\n... and ${result.data.links.length - 10} more`
        }
      }

      if (result.data.metadata) {
        const metadata = result.data.metadata
        if (metadata.quality) {
          formattedResponse += `\n\nContent Quality: ${metadata.quality.level} (${Math.round(metadata.quality.overall * 100)}%)`
        }
      }

      return {
        success: true,
        data: {
          raw: result.data,
          formatted: formattedResponse,
        },
      }
    } else {
      return {
        success: false,
        error: result.error || 'Failed to retrieve browser context',
      }
    }
  } catch (error: any) {
    console.error('Error in browser_context:', error)
    return {
      success: false,
      error: `Failed to get browser context: ${error.message}`,
    }
  }
}

/**
 * Performs a web search using the Tavily API.
 */
async function perform_web_search(
  args: WebSearchArgs
): Promise<FunctionResult> {
  const settings = useSettingsStore().config
  const TAVILY_API_KEY = settings.VITE_TAVILY_API_KEY
  if (!TAVILY_API_KEY) {
    return { success: false, error: 'Tavily API key is not configured.' }
  }
  if (!args.query) {
    return { success: false, error: 'Search query is missing.' }
  }

  console.log(`Performing web search for: ${args.query}`)
  try {
    const response = await axios.post(
      'https://api.tavily.com/search',
      {
        api_key: TAVILY_API_KEY,
        query: args.query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5,
      },
      { timeout: 10000 }
    )

    const answer = response.data.answer
    const results = response.data.results?.map((res: any) => ({
      title: res.title,
      url: res.url,
      snippet: res.content,
    }))

    const responseData = answer
      ? { answer: answer, sources: results }
      : { results: results || 'No results found.' }

    console.log('Web search successful.')
    return { success: true, data: responseData }
  } catch (error: any) {
    console.error('Tavily API error:', error.response?.data || error.message)
    return {
      success: false,
      error: `Failed to perform web search: ${error.response?.data?.error || error.message}`,
    }
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
  browser_context: browser_context,
  perform_web_search: perform_web_search,
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
  browser_context: { required: [] },
  perform_web_search: { required: ['query'] },
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
