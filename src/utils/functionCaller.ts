import axios from 'axios'

const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY
const OPENWEATHERMAP_API_KEY = import.meta.env.VITE_OPENWEATHERMAP_API_KEY

interface WebSearchArgs {
  query: string
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

/**
 * Performs a web search using the Tavily API.
 */
async function perform_web_search(
  args: WebSearchArgs
): Promise<FunctionResult> {
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
 * Gets the current weather forecast using the OpenWeatherMap API.
 */
async function get_weather_forecast(
  args: WeatherArgs
): Promise<FunctionResult> {
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
async function get_current_datetime(
  args: { format?: 'full' | 'date_only' | 'time_only' | 'year_only' }
): Promise<FunctionResult> {
  try {
    const now = new Date();
    const format = args.format || 'full';
    
    let result: any = {
      unix_timestamp: Math.floor(now.getTime() / 1000),
      utc_iso_string: now.toISOString(),
    };
    
    switch (format) {
      case 'date_only':
        result.formatted = now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        break;
        
      case 'time_only':
        result.formatted = now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short'
        });
        break;
        
      case 'year_only':
        result.formatted = now.getFullYear().toString();
        break;
        
      default:
        result.formatted = now.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short'
        });
        result.date = {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          weekday: now.toLocaleDateString('en-US', { weekday: 'long' })
        };
        result.time = {
          hour: now.getHours(),
          minute: now.getMinutes(),
          second: now.getSeconds()
        };
    }

    console.log('Current datetime fetch successful.');
    return { success: true, data: result };
  } catch (error: any) {
    console.error('Error getting current datetime:', error.message);
    return {
      success: false,
      error: `Failed to get current datetime: ${error.message}`
    };
  }
}

const functionRegistry: {
  [key: string]: (args: any) => Promise<FunctionResult>
} = {
  perform_web_search: perform_web_search,
  get_weather_forecast: get_weather_forecast,
  get_current_datetime: get_current_datetime,
}

const functionSchemas = {
  perform_web_search: { required: ['query'] },
  get_weather_forecast: { required: ['location'] },
  get_current_datetime: { required: ['format'] },
}

/**
 * Executes the appropriate local function based on the name provided by the AI.
 * Parses arguments string and returns the result as a plain string suitable for OpenAI tool output.
 */
export async function executeFunction(
  name: string,
  argsString: string
): Promise<string> {
  const func = functionRegistry[name]
  const schema = functionSchemas[name]

  if (!func) {
    console.error(`Function ${name} not found in registry.`)
    return `Error: Function ${name} not found.`
  }

  try {
    const args = JSON.parse(argsString || '{}')
    console.log(`Executing function "${name}" with args:`, args)

    if (schema?.required) {
      for (const requiredParam of schema.required) {
        if (
          !(requiredParam in args) ||
          args[requiredParam] === null ||
          args[requiredParam] === undefined ||
          args[requiredParam] === ''
        ) {
          console.warn(
            `Pre-computation validation failed: Missing required parameter "${requiredParam}" for function "${name}".`
          )
          return `Error: Cannot execute ${name}: Missing required parameter '${requiredParam}'. Please provide it.`
        }
      }
    }

    // Call the actual function implementation
    const result: FunctionResult = await func(args)

    console.log(`Function "${name}" executed. Result:`, result)

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
    return `Error processing function ${name}: ${error.message || 'Unknown error'}`
  }
}
