import axios from 'axios'
import { useSettingsStore } from '../stores/settingsStore'
import { embedTextForThoughts } from '../api/openAI/assistant'

interface WebSearchArgs {
  query: string
}

interface Crawl4AiArgs {
  url: string
}

interface WeatherArgs {
  location: string
  unit?: 'metric' | 'imperial'
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

async function save_memory(args: SaveMemoryArgs) {
  if (!args.content) {
    return { success: false, error: 'Content is required.' }
  }
  try {
    let generatedEmbedding: number[] | undefined = undefined
    try {
      generatedEmbedding = await embedTextForThoughts(args.content)
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
        queryEmbedding = await embedTextForThoughts(args.query)
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

/**
 * Gets context from a website using the Tavily Extract API.
 */
async function get_website_context(
  args: Crawl4AiArgs
): Promise<FunctionResult> {
  const settings = useSettingsStore().config
  const TAVILY_API_KEY = settings.VITE_TAVILY_API_KEY

  if (!TAVILY_API_KEY) {
    return {
      success: false,
      error: 'Tavily API key is not configured.',
    }
  }

  if (!args.url) {
    return { success: false, error: 'URL is missing.' }
  }

  console.log(`Fetching data from: ${args.url}`)
  try {
    const response = await axios.post(
      'https://api.tavily.com/extract',
      {
        urls: args.url,
        include_images: false,
        extract_depth: 'basic',
      },
      {
        headers: {
          Authorization: `Bearer ${TAVILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    )

    if (
      !response.data ||
      !response.data.results ||
      response.data.results.length === 0
    ) {
      return {
        success: false,
        error: 'No content was extracted from the URL',
      }
    }

    const result = response.data.results[0]
    const content = result.raw_content

    if (!content) {
      return {
        success: false,
        error: 'Extraction completed but no content was returned',
      }
    }

    console.log(`Successfully extracted ${content.length} chars of content`)

    return {
      success: true,
      data: content,
    }
  } catch (error: any) {
    console.error(
      'Error fetching website context:',
      error.response?.data || error.message
    )
    return {
      success: false,
      error: `Failed to fetch website context: ${error.response?.data?.error || error.message}`,
    }
  }
}

/**
 * Gets the current weather forecast using the OpenWeatherMap API.
 */
async function get_weather_forecast(
  args: WeatherArgs
): Promise<FunctionResult> {
  const settings = useSettingsStore().config
  const OPENWEATHERMAP_API_KEY = settings.VITE_OPENWEATHERMAP_API_KEY

  if (!OPENWEATHERMAP_API_KEY) {
    return {
      success: false,
      error: 'OpenWeatherMap API key is not configured.',
    }
  }
  if (!args.location) {
    return {
      success: false,
      error: 'Location is missing for weather forecast.',
    }
  }

  const units = args.unit === 'imperial' ? 'imperial' : 'metric'
  const unitSymbol = units === 'metric' ? '°C' : '°F'

  console.log(`Fetching weather for: ${args.location} (Units: ${units})`)
  try {
    const response = await axios.get(
      'https://api.openweathermap.org/data/2.5/weather',
      {
        params: {
          q: args.location,
          appid: OPENWEATHERMAP_API_KEY,
          units: units,
        },
        timeout: 5000,
      }
    )

    const weatherData = response.data
    const result = {
      location: weatherData.name,
      country: weatherData.sys?.country,
      description: weatherData.weather[0]?.description || 'N/A',
      temperature: `${Math.round(weatherData.main?.temp)}${unitSymbol}`,
      feels_like: `${Math.round(weatherData.main?.feels_like)}${unitSymbol}`,
      humidity: `${weatherData.main?.humidity}%`,
      wind_speed: weatherData.wind?.speed,
    }

    console.log('Weather fetch successful.')
    return { success: true, data: result }
  } catch (error: any) {
    console.error(
      'OpenWeatherMap API error:',
      error.response?.data || error.message
    )
    let errorMessage = `Failed to get weather for ${args.location}`
    if (error.response?.status === 404) {
      errorMessage = `Could not find location: ${args.location}`
    } else if (error.response?.data?.message) {
      errorMessage += `: ${error.response.data.message}`
    } else {
      errorMessage += `: ${error.message}`
    }
    return {
      success: false,
      error: errorMessage,
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
  perform_web_search: perform_web_search,
  get_weather_forecast: get_weather_forecast,
  get_current_datetime: get_current_datetime,
  open_path: open_path,
  manage_clipboard: manage_clipboard,
  get_website_context: get_website_context,
  search_torrents: search_torrents,
  add_torrent_to_qb: add_torrent_to_qb,
  get_calendar_events,
  create_calendar_event,
  update_calendar_event,
  delete_calendar_event,
  get_unread_emails,
  search_emails,
  get_email_content,
}

const functionSchemas = {
  save_memory: { required: ['content'] },
  delete_memory: { required: ['id'] },
  recall_memories: { required: [] },
  perform_web_search: { required: ['query'] },
  get_weather_forecast: { required: ['location'] },
  get_current_datetime: { required: ['format'] },
  open_path: { required: ['target'] },
  manage_clipboard: { required: ['action'] },
  get_website_context: { required: ['url'] },
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
