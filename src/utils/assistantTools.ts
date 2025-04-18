export const assistantTools = [
  {
    functionDeclarations: [
      {
        name: 'perform_web_search',
        description:
          'Searches the web for information on a given query. Use this for current events, general knowledge questions, or topics not covered by other tools.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description:
                'The specific search query or question to look up on the web.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_weather_forecast',
        description:
          'Fetches the current weather forecast for a specified Canadian location. REQUIRED: User must provide a location (e.g., city, province). Ask for location if missing. Only provide Canadian results.',
        parameters: {
          type: 'OBJECT',
          properties: {
            location: {
              type: 'STRING',
              description:
                'REQUIRED. The Canadian city or location (e.g., "Welland", "Toronto, ON").',
            },
            unit: {
              type: 'STRING',
              description: 'Temperature unit preference',
              enum: ['metric', 'imperial']
            }
          },
          required: ['location'],
        },
      },
      {
        name: 'get_current_datetime',
        description:
          'Gets the current date and time. Use when discussing current events or time-sensitive information.',
        parameters: {
          type: 'OBJECT',
          properties: {
            format: {
              type: 'STRING',
              enum: ['full', 'date_only', 'time_only', 'year_only'],
              description:
                'Desired format (default: full).',
            },
          },
        },
      },
      {
        name: 'open_path',
        description:
          "Opens a specified file, folder, application, or URL on the user's computer (requires desktop app environment). Use platform-neutral paths or application names where possible.",
        parameters: {
          type: 'OBJECT',
          properties: {
            target: {
              type: 'STRING',
              description:
                'The file/folder path, application name (e.g., "Calculator"), or full URL (e.g., "https://google.com") to open.',
            },
          },
          required: ['target'],
        },
      },
      {
        name: 'manage_clipboard',
        description:
          'Reads text from or writes text to the system clipboard (requires desktop app environment).',
        parameters: {
          type: 'OBJECT',
          properties: {
            action: {
              type: 'STRING',
              enum: ['read', 'write'],
              description:
                'Operation: "read" (get text) or "write" (set text).',
            },
            content: {
              type: 'STRING',
              description:
                'Text to write (required for "write" action, can be empty string). Ignored for "read".',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'get_website_context',
        description:
          'Fetches the main textual content of a given website URL and provides a summary.',
        parameters: {
          type: 'OBJECT',
          properties: {
            url: {
              type: 'STRING',
              description: 'The valid HTTP/HTTPS URL of the website to fetch.',
            },
          },
          required: ['url'],
        },
      },
    ]
  }
]