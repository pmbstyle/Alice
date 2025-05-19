export const PREDEFINED_OPENAI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'perform_web_search',
      description:
        "Searches the web for information on a given query. Use this for current events, general knowledge questions, or topics not covered by other tools. Use this tool for browsing the web and when you don't know something or need additional context or data.",
      strict: false,
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
        'Fetches the current weather forecast for a specific location. Use this toll if you know the location and want to get only current weather.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description:
              'The city name (e.g., "London", "Paris, FR", "Tokyo"). Include state or country if ambiguous.',
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
      description:
        "Call this function whenever discussing current events, recent developments, or when time-sensitive information is needed. ALWAYS use this function when referring to events after 2022, current year, or 'now'. This function returns the current date, time, and other temporal information needed to provide accurate, up-to-date responses.",
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['full', 'date_only', 'time_only', 'year_only'],
            description:
              "The format of the datetime information to return. 'full', 'date_only', 'time_only' or 'year_only' are your options. Default is 'full' if not specified.",
          },
        },
        additionalProperties: false,
        required: ['format'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_path',
      description:
        "Opens a specified file, folder, or application on the user's computer using the default operating system handler, or opens a URL in the default web browser. Use for launching apps, documents, folders, or websites mentioned by the user. User name in his system is 'pmb'",
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description:
              "The target to open. Can be an absolute file path (e.g., '/Users/pmb/file.txt'), a folder path (e.g., 'C:\\Users\\pmb\\Documents'), or a full URL (e.g., 'https://www.google.com'). User is using Windows 11, when you need to open an application define a path to it in this OS. Use this tool to open web search result url for user command.",
          },
        },
        required: ['target'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_clipboard',
      description:
        'Manages the system clipboard. Can read the current text content from the clipboard or write new text content to it. Useful for transferring text between Alice and other applications.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read', 'write'],
            description:
              "Specifies the operation to perform: 'read' to get text from the clipboard, 'write' to put text onto the clipboard.",
          },
          content: {
            type: 'string',
            description:
              "The text content to write to the clipboard. Required only when the action is 'write'. Ignored for 'read'.",
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_website_context',
      description:
        'Extracts the main content from a specified URL. Use this tool to get the text content from a webpage, allowing Alice to analyze, summarize, or answer questions about information found online.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'The full URL of the webpage to extract content from (e.g., https://www.example.com/article).',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_torrents',
      description:
        'Searches for torrents using Jackett. Use this tool when the user asks to find or download a specific movie, TV show, or file.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'The name of the movie, show, or content to search for.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_torrent_to_qb',
      description:
        'Adds a torrent to qBittorrent using a magnet link. Use this tool when the user selects or confirms a torrent to download.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          magnet: {
            type: 'string',
            description:
              'The magnet link of the torrent to be added to the download queue.',
          },
        },
        required: ['magnet'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description:
        "Store a long-term memory about the user. The memory should be a short, clear description that you can recall later to better understand and assist the user. For example: 'The user enjoys hiking in the mountains.' Categorize the memory by type (e.g., 'personal', 'work', 'hobby').",
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description:
              'The memory content to store. It should be a brief but meaningful description of the fact or event.',
          },
          memoryType: {
            type: 'string',
            description:
              "The type of memory, like 'personal', 'work', 'hobby'. Default is 'general'.",
          },
        },
        required: ['content', 'memoryType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_memory',
      description:
        'Forget a long-term memory about the user by permanently deleting it from storage. Use this if the memory is no longer valid or the user asks you to forget it.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'The unique ID of the memory to delete. This ID identifies exactly which memory should be removed.',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_memories',
      description:
        'Retrieve recent long-term memories stored about the user. Use this to remind yourself of important facts, preferences, or past events related to him.',
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          memoryType: {
            type: 'string',
            description:
              "You can slect type of memory you want to recall, like 'personal', 'project', 'mood', 'general'. Anything you saved as memoryType.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_calendar_events',
      description:
        "Fetches events from the user's Google Calendar for a specified time range or with a query. Use this to check the user's schedule. Always clarify date ranges if not explicitly given by the user. Default to the 'primary' calendar.",
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description:
              "The calendar ID to fetch events from. Defaults to 'primary'.",
          },
          timeMin: {
            type: 'string',
            description:
              "Start of the time range in ISO 8601 format (e.g., '2025-05-20T00:00:00Z'). If not provided, defaults to now.",
          },
          timeMax: {
            type: 'string',
            description:
              "End of the time range in ISO 8601 format (e.g., '2025-05-27T23:59:59Z').",
          },
          q: {
            type: 'string',
            description: 'Free text search query for events.',
          },
          maxResults: {
            type: 'integer',
            description: 'Maximum number of events to return. Defaults to 10.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description:
        "Creates a new event in the user's Google Calendar. Ensure you have a summary, start time, and end time. Confirm with the user before creating. Default to the 'primary' calendar.",
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description:
              "The calendar ID to create the event in. Defaults to 'primary'.",
          },
          summary: {
            type: 'string',
            description: 'The title or summary of the event.',
          },
          description: {
            type: 'string',
            description: 'A more detailed description of the event.',
          },
          startDateTime: {
            type: 'string',
            description:
              "The start date and time of the event in ISO 8601 format (e.g., '2025-05-20T10:00:00-07:00').",
          },
          endDateTime: {
            type: 'string',
            description:
              "The end date and time of the event in ISO 8601 format (e.g., '2025-05-20T11:00:00-07:00').",
          },
          location: {
            type: 'string',
            description: 'The location of the event.',
          },
          attendees: {
            type: 'array',
            items: { type: 'string', format: 'email' },
            description: 'A list of email addresses of attendees.',
          },
        },
        required: ['summary', 'startDateTime', 'endDateTime'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_calendar_event',
      description:
        "Updates an existing event in the user's Google Calendar. You MUST have the eventId. If you don't have it, first use 'get_calendar_events' to find it and confirm with the user. Default to the 'primary' calendar.",
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description:
              "The calendar ID where the event exists. Defaults to 'primary'.",
          },
          eventId: {
            type: 'string',
            description: 'The ID of the event to update.',
          },
          summary: { type: 'string' },
          description: { type: 'string' },
          startDateTime: { type: 'string', description: 'ISO 8601 format.' },
          endDateTime: { type: 'string', description: 'ISO 8601 format.' },
          location: { type: 'string' },
          attendees: {
            type: 'array',
            items: { type: 'string', format: 'email' },
          },
        },
        required: ['eventId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_calendar_event',
      description:
        "Deletes an event from the user's Google Calendar. You MUST have the eventId. Confirm with the user before deleting. If you don't have the eventId, use 'get_calendar_events' to find it. Default to the 'primary' calendar.",
      strict: false,
      parameters: {
        type: 'object',
        properties: {
          calendarId: {
            type: 'string',
            description:
              "The calendar ID where the event exists. Defaults to 'primary'.",
          },
          eventId: {
            type: 'string',
            description: 'The ID of the event to delete.',
          },
        },
        required: ['eventId'],
      },
    },
  },
]
