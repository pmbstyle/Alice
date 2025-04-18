import axios from 'axios'

const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY
const OPENWEATHERMAP_API_KEY = import.meta.env.VITE_OPENWEATHERMAP_API_KEY
const CRAWL4AI_API_KEY = import.meta.env.VITE_CRAWL4AI_API_KEY
const CRAWL4AI_API_URL = import.meta.env.VITE_CRAWL4AI_API_URL

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

export interface FunctionResult {
  success: boolean
  data?: any
  error?: string
}

/**
 * Performs a web search using the Tavily API.
 * Returns a structured FunctionResult object.
 */
async function perform_web_search(
  args: WebSearchArgs
): Promise<FunctionResult> {
  if (!TAVILY_API_KEY) {
    console.error('[Function Caller] Tavily API key is missing.')
    return { success: false, error: 'Tavily API key is not configured.' }
  }
  if (!args.query) {
    console.error('[Function Caller] Search query is missing in args:', args)
    return { success: false, error: 'Search query is missing.' }
  }

  const requestPayload = {
    api_key: TAVILY_API_KEY,
    query: args.query,
    search_depth: 'basic',
    include_answer: true,
    max_results: 5,
  }

  console.log(
    '[Function Caller] Performing web search with payload:',
    requestPayload
  )
  try {
    const response = await axios.post(
      'https://api.tavily.com/search',
      requestPayload,
      { timeout: 15000 }
    )

    console.log(
      '[Function Caller] Tavily API response status:',
      response.status
    )
    console.log(
      '[Function Caller] Tavily API response data:',
      JSON.stringify(response.data, null, 2)
    )

    const answer = response.data?.answer
    const results = response.data?.results?.map((res: any) => ({
      title: res.title,
      url: res.url,
      snippet: res.content,
    }))

    const responseData = answer
      ? { answer: answer, sources: results }
      : { results: results || 'No results found.' }

    console.log(
      '[Function Caller] Web search successful. Returning data:',
      JSON.stringify(responseData, null, 2)
    )
    return { success: true, data: responseData }
  } catch (error: any) {
    let errorMessage = 'Unknown Tavily API error'
    let errorDetails: any = {}

    if (axios.isAxiosError(error)) {
      errorMessage = error.message
      errorDetails = {
        status: error.response?.status,
        data: error.response?.data,
        code: error.code,
      }
      console.error(
        '[Function Caller] Axios error during Tavily search:',
        error.message,
        'Details:',
        JSON.stringify(errorDetails, null, 2)
      )
    } else {
      errorMessage = error.message || errorMessage
      console.error(
        '[Function Caller] Non-Axios error during Tavily search:',
        error
      )
    }

    return {
      success: false,
      error: `Failed to perform web search: ${errorMessage}${errorDetails.status ? ` (Status: ${errorDetails.status})` : ''}`,
    }
  }
}

/**
 * Gets context from a website using the custom scraper API.
 * Returns a structured FunctionResult object.
 */
async function get_website_context(
  args: Crawl4AiArgs
): Promise<FunctionResult> {
  if (!CRAWL4AI_API_KEY || !CRAWL4AI_API_URL) {
    console.error('[Function Caller] Crawl4AI API key or URL is missing.')
    return {
      success: false,
      error: 'Crawl4AI API key or URL is not configured.',
    }
  }
  if (!args.url) {
    console.error(
      '[Function Caller] URL missing for get_website_context:',
      args
    )
    return { success: false, error: 'URL is missing for website context.' }
  }

  console.log(`[Function Caller] Fetching website context from: ${args.url}`)
  try {
    const submitResponse = await axios.post(
      `${CRAWL4AI_API_URL}/crawl`,
      {
        urls: [args.url],
        priority: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${CRAWL4AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    )

    if (!submitResponse.data || !submitResponse.data.task_id) {
      console.error(
        '[Function Caller] Invalid response from crawler API - no task ID:',
        submitResponse.data
      )
      return {
        success: false,
        error: 'Invalid response from crawler API - no task ID returned.',
      }
    }

    const taskId = submitResponse.data.task_id
    console.log(`[Function Caller] Crawl job submitted, task ID: ${taskId}`)

    let taskCompleted = false
    let taskResultData: any = null
    let pollCount = 0
    const maxPolls = 30
    const pollInterval = 2000

    while (!taskCompleted && pollCount < maxPolls) {
      pollCount++
      await new Promise(resolve => setTimeout(resolve, pollInterval))

      try {
        const statusResponse = await axios.get(
          `${CRAWL4AI_API_URL}/task/${taskId}`,
          {
            headers: {
              Authorization: `Bearer ${CRAWL4AI_API_KEY}`,
            },
            timeout: 5000,
          }
        )

        const taskStatus = statusResponse.data?.status
        console.log(
          `[Function Caller] Poll #${pollCount} for task ${taskId} - Status: ${taskStatus}`
        )

        if (taskStatus === 'completed') {
          taskCompleted = true
          taskResultData = statusResponse.data
        } else if (taskStatus === 'failed') {
          const errorMsg = statusResponse.data?.error || 'Unknown crawl error'
          console.error(
            `[Function Caller] Crawl job failed for task ${taskId}: ${errorMsg}`
          )
          return { success: false, error: `Crawl job failed: ${errorMsg}` }
        }
      } catch (pollError: any) {
        console.error(
          `[Function Caller] Error polling task status for ${taskId}:`,
          pollError.message
        )
        return {
          success: false,
          error: `Error polling crawl status: ${pollError.message}`,
        }
      }
    }

    if (!taskCompleted) {
      console.error(
        `[Function Caller] Crawl job timed out for task ID: ${taskId}`
      )
      return {
        success: false,
        error: `Crawl job timed out after ${(maxPolls * pollInterval) / 1000} seconds.`,
      }
    }

    const markdownContent = taskResultData?.result?.markdown

    if (!markdownContent) {
      console.warn(
        `[Function Caller] Crawl completed for ${taskId} but no markdown content found. Result:`,
        taskResultData
      )
      return {
        success: false,
        error: 'Crawl completed but no markdown content was returned.',
      }
    }

    console.log(
      `[Function Caller] Successfully extracted ${markdownContent.length} chars of markdown content for ${args.url}`
    )
    return { success: true, data: markdownContent }
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.error ||
      error.message ||
      'Unknown error fetching website context'
    console.error(
      '[Function Caller] Error fetching website context:',
      errorMessage,
      error
    )
    return {
      success: false,
      error: `Failed to fetch website context: ${errorMessage}`,
    }
  }
}

/**
 * Gets the current weather forecast using the OpenWeatherMap API.
 * Returns a structured FunctionResult object.
 */
async function get_weather_forecast(
  args: WeatherArgs
): Promise<FunctionResult> {
  if (!OPENWEATHERMAP_API_KEY) {
    console.error('[Function Caller] OpenWeatherMap API key missing.')
    return {
      success: false,
      error: 'OpenWeatherMap API key is not configured.',
    }
  }
  if (!args.location) {
    console.error(
      '[Function Caller] Location missing for weather forecast:',
      args
    )
    return {
      success: false,
      error: 'Location is missing for weather forecast.',
    }
  }

  const units = args.unit === 'imperial' ? 'imperial' : 'metric'
  const unitSymbol = units === 'metric' ? '°C' : '°F'

  console.log(
    `[Function Caller] Fetching weather for: ${args.location} (Units: ${units})`
  )
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

    console.log(
      '[Function Caller] OpenWeatherMap response status:',
      response.status
    )
    console.log(
      '[Function Caller] OpenWeatherMap response data:',
      JSON.stringify(response.data, null, 2)
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

    console.log(
      '[Function Caller] Weather fetch successful. Returning data:',
      JSON.stringify(result, null, 2)
    )
    return { success: true, data: result }
  } catch (error: any) {
    let errorMessage = `Failed to get weather for ${args.location}`
    let errorDetails: any = {}
    if (axios.isAxiosError(error)) {
      errorMessage = error.message
      errorDetails = {
        status: error.response?.status,
        data: error.response?.data,
        code: error.code,
      }
      if (error.response?.status === 404) {
        errorMessage = `Could not find location: ${args.location}`
      } else if (error.response?.data?.message) {
        errorMessage += `: ${error.response.data.message}`
      }
      console.error(
        '[Function Caller] Axios error during OpenWeatherMap call:',
        errorMessage,
        'Details:',
        JSON.stringify(errorDetails, null, 2)
      )
    } else {
      errorMessage = error.message || 'Unknown OpenWeatherMap API error'
      console.error(
        '[Function Caller] Non-Axios error during OpenWeatherMap call:',
        error
      )
    }

    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Gets the current date and time information.
 * Returns a structured FunctionResult object.
 */
async function get_current_datetime(args: {
  format?: 'full' | 'date_only' | 'time_only' | 'year_only'
}): Promise<FunctionResult> {
  try {
    const now = new Date()

    const format = ['full', 'date_only', 'time_only', 'year_only'].includes(
      args.format || ''
    )
      ? args.format || 'full'
      : 'full'

    let formattedResult: string

    switch (format) {
      case 'date_only':
        formattedResult = now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        break
      case 'time_only':
        formattedResult = now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        })
        break
      case 'year_only':
        formattedResult = now.getFullYear().toString()
        break
      case 'full':
      default:
        formattedResult = now.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        })
        break
    }

    const resultData = {
      formatted: formattedResult,
      unix_timestamp: Math.floor(now.getTime() / 1000),
      utc_iso_string: now.toISOString(),
      ...(format === 'full' && {
        date_components: {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
        },
        time_components: {
          hour: now.getHours(),
          minute: now.getMinutes(),
          second: now.getSeconds(),
        },
      }),
    }

    console.log(
      `[Function Caller] Current datetime fetch successful (format: ${format}). Returning:`,
      JSON.stringify(resultData, null, 2)
    )
    return { success: true, data: resultData }
  } catch (error: any) {
    const errorMessage =
      error.message || 'Unknown error getting current datetime'
    console.error(
      '[Function Caller] Error getting current datetime:',
      errorMessage,
      error
    )
    return {
      success: false,
      error: `Failed to get current datetime: ${errorMessage}`,
    }
  }
}

interface OpenPathArgs {
  target: string
}

/**
 * Opens a file, folder, application, or URL using the system's default handler (Electron only).
 * Returns a structured FunctionResult object.
 */
async function open_path(args: OpenPathArgs): Promise<FunctionResult> {
  if (typeof window === 'undefined' || !(window as any).ipcRenderer?.invoke) {
    console.warn(
      '[Function Caller] open_path: Not running in Electron context.'
    )
    return {
      success: false,
      error: 'This function requires the Electron desktop app environment.',
    }
  }

  if (!args || typeof args.target !== 'string' || args.target.trim() === '') {
    console.error(
      '[Function Caller] open_path: Invalid or missing target path/URL:',
      args
    )
    return { success: false, error: 'Invalid or missing target path/URL.' }
  }

  const target = args.target.trim()
  console.log(
    `[Function Caller] Invoking electron:open-path with target: ${target}`
  )

  try {
    const result = await (window as any).ipcRenderer.invoke(
      'electron:open-path',
      { target }
    )
    console.log(
      '[Function Caller] Main process response for open_path:',
      result
    )

    if (result.success) {
      console.log(`[Function Caller] open_path successful. Returning:`, {
        message: result.message || `Successfully initiated opening: ${target}`,
      })
      return {
        success: true,
        data: {
          message:
            result.message || `Successfully initiated opening: ${target}`,
        },
      }
    } else {
      console.error(
        `[Function Caller] open_path failed in main process: ${result.message}`
      )
      return {
        success: false,
        error: result.message || `Failed to open: ${target}`,
      }
    }
  } catch (error: any) {
    const errorMessage =
      error.message || 'Unknown error invoking electron:open-path'
    console.error(
      '[Function Caller] Error invoking electron:open-path:',
      errorMessage,
      error
    )
    return {
      success: false,
      error: `Failed to execute open_path via Electron IPC: ${errorMessage}`,
    }
  }
}

interface ManageClipboardArgs {
  action: 'read' | 'write'
  content?: string
}

/**
 * Manages the system clipboard (Electron only).
 * Returns a structured FunctionResult object.
 */
async function manage_clipboard(
  args: ManageClipboardArgs
): Promise<FunctionResult> {
  if (typeof window === 'undefined' || !(window as any).ipcRenderer?.invoke) {
    console.warn(
      '[Function Caller] manage_clipboard: Not running in Electron context.'
    )
    return {
      success: false,
      error: 'This function requires the Electron desktop app environment.',
    }
  }

  if (!args || (args.action !== 'read' && args.action !== 'write')) {
    console.error(
      '[Function Caller] manage_clipboard: Invalid action specified:',
      args?.action
    )
    return {
      success: false,
      error: 'Invalid action specified. Must be "read" or "write".',
    }
  }
  if (args.action === 'write' && typeof args.content !== 'string') {
    if (args.content === undefined || args.content === null) {
      console.error(
        '[Function Caller] manage_clipboard: Content missing for write action.'
      )
      return {
        success: false,
        error:
          'Text content must be provided (even if empty string) for the "write" action.',
      }
    }
    console.warn(
      '[Function Caller] manage_clipboard: Content for write action is not a string, but proceeding.',
      args.content
    )
  }

  console.log(
    `[Function Caller] Invoking electron:manage-clipboard action: ${args.action}`
  )

  try {
    const result = await (window as any).ipcRenderer.invoke(
      'electron:manage-clipboard',
      args
    )
    console.log(
      '[Function Caller] Main process response for clipboard operation:',
      result
    )

    if (result.success) {
      const returnData =
        args.action === 'read'
          ? result.data
          : { message: result.message || 'Clipboard write successful.' }
      console.log(
        `[Function Caller] manage_clipboard ${args.action} successful. Returning:`,
        returnData
      )
      return { success: true, data: returnData }
    } else {
      console.error(
        `[Function Caller] manage_clipboard ${args.action} failed:`,
        result.message
      )
      return {
        success: false,
        error: result.message || 'Clipboard operation failed.',
      }
    }
  } catch (error: any) {
    const errorMessage =
      error.message || 'Unknown error invoking electron:manage-clipboard'
    console.error(
      '[Function Caller] Error during clipboard operation via Electron IPC:',
      errorMessage,
      error
    )
    return {
      success: false,
      error: `Failed to perform clipboard operation via Electron IPC: ${errorMessage}`,
    }
  }
}

const functionRegistry: {
  [key: string]: (args: any) => Promise<FunctionResult>
} = {
  perform_web_search,
  get_weather_forecast,
  get_current_datetime,
  open_path,
  manage_clipboard,
  get_website_context,
}

const functionSchemas: { [key: string]: { required?: string[] } } = {
  perform_web_search: { required: ['query'] },
  get_weather_forecast: { required: ['location'] },
  open_path: { required: ['target'] },
  manage_clipboard: { required: ['action'] },
  get_website_context: { required: ['url'] },
}

/**
 * Executes the appropriate local function based on the name provided by the AI.
 * Parses arguments object and returns a structured FunctionResult.
 */
export async function executeFunction(
  name: string,
  args: { [key: string]: any }
): Promise<FunctionResult> {
  console.log(
    `[Function Caller] Attempting to execute function "${name}" with args:`,
    JSON.stringify(args, null, 2)
  )
  const func = functionRegistry[name]
  const schema = functionSchemas[name]

  if (!func) {
    console.error(`[Function Caller] Function ${name} not found in registry.`)
    return { success: false, error: `Function ${name} not found.` }
  }

  try {
    if (schema?.required) {
      for (const requiredParam of schema.required) {
        const isMissing =
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

        if (isMissing) {
          const errorMsg = `Missing required parameter '${requiredParam}'.`
          console.warn(
            `[Function Caller] Validation failed for ${name}: ${errorMsg}`
          )
          return {
            success: false,
            error: `Cannot execute ${name}: ${errorMsg}`,
          }
        }
      }
    }

    const result: FunctionResult = await func(args)

    console.log(
      `[Function Caller] Function "${name}" execution finished. Result:`,
      JSON.stringify(result, null, 2)
    )
    return result
  } catch (error: any) {
    const errorMessage =
      error.message || 'Unknown error during function execution'
    console.error(`[Function Caller] Error executing function ${name}:`, error)
    return {
      success: false,
      error: `Error processing function ${name}: ${errorMessage}`,
    }
  }
}
