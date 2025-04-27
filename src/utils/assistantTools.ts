export const assistantTools = [
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description:
        'Save a memory about User for future reference.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description:
              'The memory content to store.',
          },
          memoryType: {
            type: 'string',
            description:
              'The type of memory. Default is "general". This can be used to categorize memories.',
            default: 'general',
          },
        },
        required: ['content'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'delete_memory',
      description:
        'Deletes a memory from the database.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'number',
            description:
              'The ID of the memory to delete.',
          },
        },
        required: ['id'],
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_recent_memories',
      description:
        'Get a list of recent memories.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description:
              'The maximum number of memories to retrieve. Default is 20.',
            default: 20,
          },
        },
        required: [],
      },
    },
  },

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
      description:
        'Call this function whenever discussing current events, recent developments, or when time-sensitive information is needed. ALWAYS use this function when referring to events after 2022, current year, or "now". This function returns the current date, time, and other temporal information needed to provide accurate, up-to-date responses.',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['full', 'date_only', 'time_only', 'year_only'],
            description:
              'The format of the datetime information to return. Default is "full" if not specified.',
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
  },
  {
    type: 'function',
    function: {
      name: 'manage_clipboard',
      description:
        'Manages the system clipboard. Can read the current text content from the clipboard or write new text content to it. Useful for transferring text between Alice and other applications.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read', 'write'],
            description:
              'Specifies the operation to perform: "read" to get text from the clipboard, "write" to put text onto the clipboard.',
          },
          content: {
            type: 'string',
            description:
              'The text content to write to the clipboard. Required only when the action is "write". Ignored for "read".',
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
        'Fetches the content of a website. Useful for retrieving information from websites mentioned by the user.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the website to fetch.',
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
        'Searches for torrents using Jackett. Use this when the user asks to find or download a specific movie, show, or file.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The name of the movie, show, or file to search for.',
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
        'Adds a torrent to qBittorrent using a magnet link. Use this when the user selects or confirms a torrent to download.',
      parameters: {
        type: 'object',
        properties: {
          magnet: {
            type: 'string',
            description: 'The magnet link of the torrent to add.',
          },
        },
        required: ['magnet'],
      },
    },
  },
]
