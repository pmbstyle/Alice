export const assistantTools = [
  {
    type: 'function',
    function: {
      name: 'perform_web_search',
      description:
        'Searches the web for information on a given query. Use this for current events, general knowledge questions, or topics not covered by other tools.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'The specific search query or question to look up on the web.',
          },
        },
        required: ['query'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_weather_forecast',
      description:
        'Fetches the current weather forecast. CRITICAL: This function REQUIRES a location parameter. Verify the user provided a city name. If a location is mentioned or known, you MUST include it in the "location" parameter within the arguments JSON when calling this function. If no location is specified by the user or known from context, DO NOT call this function; instead, ask the user "For which location would you like the weather forecast?".',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description:
              'REQUIRED. The city name (e.g., "London", "Paris, FR", "Tokyo"). Must be included in the arguments object.',
          },
        },
        required: ['location'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_current_datetime',
      description: 'Call this function whenever discussing current events, recent developments, or when time-sensitive information is needed. ALWAYS use this function when referring to events after 2022, current year, or "now". This function returns the current date, time, and other temporal information needed to provide accurate, up-to-date responses.',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['full', 'date_only', 'time_only', 'year_only'],
            description: 'The format of the datetime information to return. Default is "full" if not specified.'
          }
        },
        additionalProperties: false,
        required: ['format']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'open_path',
      description:
        "Opens a specified file, folder, or application on the user's computer using the default operating system handler, or opens a URL in the default web browser. Use for launching apps, documents, folders, or websites mentioned by the user.",
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description:
              'The target to open. Can be an absolute file path (e.g., "/Users/me/file.txt"), a folder path (e.g., "C:\\Users\\me\\Documents"), an application name understood by the OS (e.g., "Calculator", "Safari"), or a full URL (e.g., "https://www.google.com").',
          },
        },
        required: ['target'],
      },
    },
  }
]
