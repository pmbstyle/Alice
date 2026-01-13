# Alice Custom Tooling System - Complete Documentation

**Last Updated:** 2026-01-11

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Currently Enabled Tools](#currently-enabled-tools)
3. [How the Tooling System Works](#how-the-tooling-system-works)
4. [Built-in Tools Reference](#built-in-tools-reference)
5. [Custom Tool System](#custom-tool-system)
6. [Security Features](#security-features)
7. [Configuration Requirements](#configuration-requirements)
8. [Key Implementation Files](#key-implementation-files)

---

## System Architecture Overview

Alice implements a **dual-layer tooling system** that allows the AI assistant to interact with your computer and external services:

1. **Built-in Predefined Tools** (23 tools) - Core functionality managed by the application
2. **Custom User Tools** - Extensible system for user-defined JavaScript modules

### Data Flow

```
User starts conversation
    ↓
buildToolsForProvider() assembles available tools
    ↓
- Loads enabled tools from assistantTools array
- Adds enabled custom tools from user-customization
- Filters based on AI provider capabilities
- Sends tool definitions to LLM
    ↓
LLM decides to use a tool based on conversation
    ↓
Tool call sent back to application
    ↓
executeFunction() dispatches to appropriate handler
    ↓
┌─────────────────────┬─────────────────────┐
│   Built-in Tool     │    Custom Tool      │
│                     │                     │
│ functionRegistry    │ executeCustomTool   │
│ [name]()            │ ViaIPC()            │
│                     │                     │
│ Execute locally     │ IPC to main process │
│ in renderer         │                     │
│                     │ Dynamic import      │
│                     │ script module       │
│                     │                     │
│                     │ Execute handler     │
└─────────────────────┴─────────────────────┘
    ↓
Result formatted and returned to LLM
    ↓
LLM continues conversation with tool result
```

---

## Currently Enabled Tools

The following tools are currently enabled in the default configuration:

| Tool Name | Category | Purpose |
|-----------|----------|---------|
| **get_current_datetime** | System/Time | Returns current date/time in various formats for time-sensitive queries |
| **perform_web_search** | Web Search | Searches the web via Tavily API (requires API key) |
| **save_memory** | Memory | Stores long-term facts about you with semantic embeddings |
| **delete_memory** | Memory | Removes specific memories from long-term storage |
| **recall_memories** | Memory | Retrieves memories via semantic search |
| **open_path** | File System | Opens files, folders, apps, or URLs using OS default handler |
| **list_directory** | File System | Lists contents of directories on your computer |
| **execute_command** | System | Executes shell commands (with approval system) |

---

## How the Tooling System Works

### 1. Tool Assembly (`src/services/llmProviders/tools.ts`)

```typescript
async function buildToolsForProvider() {
  const tools = []

  // 1. Add predefined tools from settings
  for (const toolName of settings.assistantTools) {
    const tool = PREDEFINED_OPENAI_TOOLS.find(t => t.name === toolName)
    if (tool) tools.push(tool)
  }

  // 2. Add enabled custom tools
  await customToolsStore.ensureInitialized()
  for (const customTool of customToolsStore.enabledAndValidTools) {
    tools.push({
      type: 'function',
      name: customTool.name,
      description: customTool.description,
      parameters: customTool.parameters,
      strict: customTool.strict ?? false
    })
  }

  // 3. Filter based on provider capabilities
  return tools
}
```

### 2. Function Dispatch (`src/utils/functionCaller.ts`)

```typescript
async function executeFunction(name, argsString, settings) {
  // Parse arguments
  const args = typeof argsString === 'string'
    ? JSON.parse(argsString)
    : argsString

  // Check built-in registry
  const func = functionRegistry[name]
  if (func) {
    const result = await func(args, settings)
    return JSON.stringify(result.data)
  }

  // Check custom tools
  await customToolsStore.ensureInitialized()
  if (customToolsStore.toolsByName[name]) {
    return await executeCustomToolViaIPC(name, args)
  }

  return `Error: Function ${name} not found.`
}
```

### 3. Custom Tool Execution (`electron/main/customToolsManager.ts`)

```typescript
async function executeCustomTool(name, args) {
  // Load tool definition
  const snapshot = await loadCustomToolsFromDisk()
  const tool = snapshot.tools.find(t => t.name === name)

  // Validate
  if (!tool.enabled || !tool.isValid) {
    return { success: false, error: 'Tool disabled or invalid' }
  }

  // Dynamic import
  const moduleUrl = `${pathToFileURL(tool.entryAbsolutePath)}?update=${Date.now()}`
  const module = await import(moduleUrl)

  // Find handler
  const handler = module.run || module.execute || module.default

  // Build context
  const context = {
    appVersion: app.getVersion(),
    customizationRoot: getCustomizationRoot(),
    scriptsRoot: getScriptsRoot(),
    userDataPath: app.getPath('userData'),
    log: (...messages) => console.log(`[Custom Tool:${tool.name}]`, ...messages)
  }

  // Execute
  const result = await handler(args || {}, context)

  // Normalize result
  if (typeof result === 'object' && 'success' in result) {
    return result
  }
  return { success: true, data: result }
}
```

---

## Built-in Tools Reference

All 23 built-in tools with their schemas are defined in `docs/functions.json`.

### System & Time (1 tool)

#### `get_current_datetime`
Returns current date, time, and temporal information.

**Parameters:**
- `format` (required): "full" | "date_only" | "time_only" | "year_only"

**Example:**
```json
{
  "format": "full"
}
```

---

### File System (3 tools)

#### `open_path`
Opens files, folders, applications, or URLs using the default OS handler.

**Parameters:**
- `target` (required): File path, folder path, or URL

**Example:**
```json
{
  "target": "C:\\Users\\username\\Documents"
}
```

#### `list_directory`
Lists files and folders in a directory.

**Parameters:**
- `path` (required): Absolute directory path

#### `execute_command`
Executes shell commands with security approval system.

**Parameters:**
- `command` (required): Shell command to execute

**Security:** Requires user approval via dialog system.

---

### Clipboard (1 tool)

#### `manage_clipboard`
Read or write text content to system clipboard.

**Parameters:**
- `action` (required): "read" | "write"
- `content` (optional): Text to write (required when action is "write")

---

### Memory System (3 tools)

#### `save_memory`
Store long-term memories about the user with semantic embeddings.

**Parameters:**
- `content` (required): Memory content to store
- `memoryType` (required): "personal" | "work" | "hobby" | "general"

**Example:**
```json
{
  "content": "User enjoys hiking in mountains",
  "memoryType": "hobby"
}
```

#### `recall_memories`
Retrieve memories via semantic search.

**Parameters:**
- `query` (optional): Search query for relevant memories
- `memoryType` (optional): Filter by memory type

#### `delete_memory`
Permanently delete a memory by ID.

**Parameters:**
- `id` (required): Unique memory ID

---

### Calendar - Google (4 tools)

#### `get_calendar_events`
Fetch events from Google Calendar.

**Parameters:**
- `calendarId` (optional): Defaults to "primary"
- `timeMin` (optional): ISO 8601 start time
- `timeMax` (optional): ISO 8601 end time
- `q` (optional): Search query
- `maxResults` (optional): Max events to return

#### `create_calendar_event`
Create a new calendar event.

**Parameters:**
- `calendarId` (optional): Defaults to "primary"
- `summary` (required): Event title
- `description` (optional): Event details
- `startDateTime` (required): ISO 8601 start time
- `endDateTime` (required): ISO 8601 end time
- `location` (optional): Event location
- `attendees` (optional): Array of email addresses

#### `update_calendar_event`
Update an existing event.

**Parameters:**
- `eventId` (required): Event ID to update
- `calendarId` (optional): Defaults to "primary"
- Other fields optional (same as create)

#### `delete_calendar_event`
Delete a calendar event.

**Parameters:**
- `eventId` (required): Event ID to delete
- `calendarId` (optional): Defaults to "primary"

---

### Email - Gmail (3 tools)

#### `get_unread_emails`
Fetch recent unread emails.

**Parameters:**
- `maxResults` (optional): Defaults to 5

#### `search_emails`
Search emails with Gmail query syntax.

**Parameters:**
- `query` (required): Gmail search query
- `maxResults` (optional): Defaults to 10

**Example queries:**
- `"from:boss@example.com"`
- `"subject:project update"`
- `"after:2024/01/15 before:2024/01/20"`

#### `get_email_content`
Fetch full content of specific email.

**Parameters:**
- `messageId` (required): Email message ID

---

### Scheduling (2 tools)

#### `schedule_task`
Create recurring scheduled tasks (cron-based).

**Parameters:**
- `name` (required): Descriptive task name
- `schedule` (required): Recurring pattern (e.g., "every morning at 8 AM")
- `action_type` (required): "command" | "reminder"
- `details` (required): Command to execute or reminder message

#### `manage_scheduled_tasks`
Manage existing scheduled tasks.

**Parameters:**
- `action` (required): "list" | "delete" | "toggle"
- `task_id` (optional): Required for "delete" and "toggle"

---

### Web & Browser (3 tools)

#### `browser_context`
Get content from active Chrome browser tab via WebSocket.

**Parameters:**
- `focus` (optional): "content" | "selection" | "links" | "all" (default: "all")
- `maxLength` (optional): Max character length (default: 4000)

**Requires:** Chrome extension installed and WebSocket connection on port 5421.

#### `perform_web_search`
Search the web using Tavily API.

**Parameters:**
- `query` (required): Search query

**Requires:** `VITE_TAVILY_API_KEY` configured.

#### `searxng_web_search`
Privacy-focused search via SearXNG instance.

**Parameters:**
- `query` (required): Search query
- `categories` (optional): Comma-separated categories
- `engines` (optional): Comma-separated engines
- `language` (optional): Language code
- `time_range` (optional): "day" | "month" | "year"
- `safesearch` (optional): 0-2 (off to strict)

**Requires:** `VITE_SEARXNG_URL` configured.

---

### Torrents (2 tools)

#### `search_torrents`
Search torrents via Jackett.

**Parameters:**
- `query` (required): Search query

**Requires:** Jackett URL and API key configured.

#### `add_torrent_to_qb`
Add torrent to qBittorrent.

**Parameters:**
- `magnet` (required): Magnet link

**Requires:** qBittorrent URL and credentials configured.

---

## Custom Tool System

### Storage Structure

**Development:**
```
<project-root>/user-customization/
  ├── package.json              # {"type": "module"}
  ├── custom-tools.json         # Tool definitions array
  └── custom-tool-scripts/      # JavaScript modules
      ├── demo-greet-user.js
      └── <your-scripts>.js
```

**Production:**
```
%APPDATA%/alice-ai-app/user-customization/
```

### Custom Tool Definition Format

```typescript
{
  "id": "unique_tool_id",
  "name": "tool_function_name",
  "description": "What this tool does for the LLM to understand",
  "parameters": {
    "type": "object",
    "properties": {
      "param_name": {
        "type": "string",
        "description": "Parameter description"
      }
    },
    "required": ["param_name"],
    "additionalProperties": false
  },
  "strict": false,
  "enabled": true,
  "handler": {
    "type": "script",
    "entry": "custom-tool-scripts/my-tool.js",
    "runtime": "node"
  },
  "version": "1.0.0",
  "tags": ["category"],
  "createdAt": "2026-01-11T00:00:00Z",
  "updatedAt": "2026-01-11T00:00:00Z"
}
```

### Custom Script Contract

Scripts must export a handler function as ES modules:

```javascript
/**
 * Custom tool handler
 * @param {object} args - Parsed parameters from LLM
 * @param {object} context - Helper context object
 * @returns {object|any} Result object or any value
 */
export async function run(args, context) {
  // Context provides:
  // - context.appVersion: string
  // - context.customizationRoot: string
  // - context.scriptsRoot: string
  // - context.userDataPath: string
  // - context.log(...messages): function

  try {
    // Your tool logic here
    const result = doSomething(args)

    // Return format 1: Explicit success/error
    return {
      success: true,
      data: { message: 'Operation completed', result }
    }
  } catch (error) {
    // Return format 2: Error
    return {
      success: false,
      error: error.message
    }
  }

  // Return format 3: Any value (auto-wrapped in success response)
  // return "Simple string result"
  // return { arbitrary: 'data' }
}

// Alternative export names (in order of precedence):
// export async function execute(args, context) { }
// export default async function(args, context) { }
```

### Example Custom Tool

**File:** `custom-tools.json`
```json
[
  {
    "id": "weather_fetcher",
    "name": "get_weather",
    "description": "Fetches current weather for a given city using OpenWeather API",
    "parameters": {
      "type": "object",
      "properties": {
        "city": {
          "type": "string",
          "description": "City name (e.g., 'London', 'New York')"
        },
        "units": {
          "type": "string",
          "enum": ["metric", "imperial"],
          "description": "Temperature units. Default is metric."
        }
      },
      "required": ["city"],
      "additionalProperties": false
    },
    "enabled": true,
    "handler": {
      "type": "script",
      "entry": "custom-tool-scripts/weather.js",
      "runtime": "node"
    }
  }
]
```

**File:** `custom-tool-scripts/weather.js`
```javascript
import https from 'https'

export async function run(args, context) {
  const { city, units = 'metric' } = args

  context.log(`Fetching weather for ${city}`)

  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    return {
      success: false,
      error: 'OpenWeather API key not configured'
    }
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=${units}&appid=${apiKey}`

    const weatherData = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => resolve(JSON.parse(data)))
      }).on('error', reject)
    })

    return {
      success: true,
      data: {
        temperature: weatherData.main.temp,
        description: weatherData.weather[0].description,
        humidity: weatherData.main.humidity,
        windSpeed: weatherData.wind.speed
      }
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to fetch weather: ${error.message}`
    }
  }
}
```

### Validation Rules

**Tool Definition Validation:**
- `name` is required (function name for LLM)
- `handler.type` must be "script"
- `handler.entry` is required (relative path)
- `parameters` must be valid JSON Schema

**File Path Validation:**
- Entry paths must be relative (not absolute)
- Must stay inside `user-customization/` directory
- No `..` path traversal allowed
- Must have `.js`, `.mjs`, or `.cjs` extension

**Script Validation:**
- File must exist on disk
- Module must export `run`, `execute`, or `default` function
- Function must accept (args, context) parameters

### Managing Custom Tools

**Via Settings UI (Settings → Customization Tab):**
1. View all custom tools with validation status
2. Upload new script files
3. Add/edit tool definitions (JSON editor or form)
4. Toggle tools on/off
5. Delete tools
6. View diagnostics for invalid tools

**Via IPC (Programmatic):**
```typescript
// Fetch all tools
const snapshot = await window.ipcRenderer.invoke('custom-tools:get-snapshot')

// Add or update tool
await window.ipcRenderer.invoke('custom-tools:upsert', toolDefinition)

// Toggle tool
await window.ipcRenderer.invoke('custom-tools:toggle', toolId, enabled)

// Delete tool
await window.ipcRenderer.invoke('custom-tools:delete', toolId)

// Upload script file
await window.ipcRenderer.invoke('custom-tools:upload-script', {
  filename: 'my-tool.js',
  content: scriptContent
})

// Execute tool
const result = await window.ipcRenderer.invoke('custom-tools:execute', {
  name: 'tool_name',
  args: { param: 'value' }
})
```

---

## Security Features

### 1. Command Execution Approval System

**Location:** `electron/main/desktopManager.ts`

When `execute_command` is invoked:

1. Application checks if command is in approved list
2. If not approved, shows dialog with options:
   - **One-time approval** - Execute once, don't save
   - **Session approval** - Approve for current session only
   - **Permanent approval** - Add to approved commands list
3. Approved commands stored in `alice-settings.json` → `approvedCommands` array
4. User can review/revoke in Settings → Security tab

**Current Implementation:**
```typescript
ipcMain.handle('desktop:executeCommand', async (event, command) => {
  // Check approved list
  const settings = loadSettings()
  if (!settings.approvedCommands?.includes(command)) {
    // Show approval dialog
    const approval = await showCommandApprovalDialog(command)
    if (!approval.granted) {
      return { error: 'Command execution denied by user' }
    }
    if (approval.permanent) {
      settings.approvedCommands.push(command)
      saveSettings(settings)
    }
  }

  // Execute command
  return new Promise(resolve => {
    exec(command, (error, stdout, stderr) => {
      resolve({ stdout, stderr, error: error?.message })
    })
  })
})
```

### 2. Custom Tool Sandboxing

**Path Validation:**
- Entry paths must be relative
- Absolute paths rejected
- `..` path segments rejected
- Scripts validated to be within `user-customization/` directory

**Execution Environment:**
- Scripts run in Electron main process
- Full Node.js API access
- Can make network requests
- Can read/write files
- **User responsibility:** Only install trusted custom tools

**Validation Pipeline:**
```typescript
function validateToolDefinition(tool) {
  // Validate required fields
  if (!tool.name) throw new Error('Tool name required')
  if (!tool.handler?.entry) throw new Error('Handler entry required')

  // Validate path security
  const entry = path.normalize(tool.handler.entry)
  if (path.isAbsolute(entry)) {
    throw new Error('Entry path must be relative')
  }
  if (entry.includes('..')) {
    throw new Error('Path traversal not allowed')
  }

  // Validate file exists
  const fullPath = path.join(scriptsRoot, entry)
  if (!fs.existsSync(fullPath)) {
    throw new Error('Script file does not exist')
  }

  return true
}
```

### 3. API Key Protection

**Storage:** All API keys stored locally in `alice-settings.json`

**Security Considerations:**
- Keys stored in plaintext (standard for Electron apps)
- File protected by OS user permissions
- Keys only transmitted to their respective services
- Never sent to untrusted servers

**Best Practices:**
- Don't commit `alice-settings.json` to version control
- Add to `.gitignore` if forking the project
- Rotate keys if compromised
- Use environment-specific keys for development

### 4. Tool Status Messages

**Location:** `src/stores/conversationStore.ts`

User-friendly status messages shown during tool execution:

```typescript
const toolStatusMessages = {
  get_current_datetime: '🕒 Looking at the clock...',
  open_path: '📂 Opening that for you...',
  execute_command: (args) => `💻 Executing: ${args?.command}`,
  manage_clipboard: (args) => args?.action === 'read'
    ? '📋 Reading clipboard...'
    : '📋 Writing to clipboard...',
  save_memory: '🧠 Saving this to memory...',
  recall_memories: '🔍 Searching memories...',
  // ... etc
}
```

---

## Configuration Requirements

### Tools Requiring External Services

**Google Services (Calendar/Gmail):**
- Requires: `VITE_GOOGLE_API_KEY`
- OAuth flow: `http://127.0.0.1:9876/oauth2callback`
- Tokens stored: `google-calendar-tokens.json`

**Web Search:**
- **Tavily:** Requires `VITE_TAVILY_API_KEY`
- **SearXNG:** Requires `VITE_SEARXNG_URL` (self-hosted instance)

**Torrents:**
- **Jackett:** Requires `VITE_JACKETT_URL` + `VITE_JACKETT_API_KEY`
- **qBittorrent:** Requires `VITE_QB_URL` + `VITE_QB_USERNAME` + `VITE_QB_PASSWORD`

**Browser Context:**
- Requires: Chrome extension installed
- WebSocket: `localhost:5421`
- Auto-enabled when extension connects

**Alternative STT:**
- **Groq:** Requires `VITE_GROQ_API_KEY`

### Configuration File Location

**Production:** `%APPDATA%/alice-ai-app/alice-settings.json`
**Development:** `<project-root>/alice-settings.json`

---

## Key Implementation Files

| Component | File Path | Purpose |
|-----------|-----------|---------|
| **Tool Schemas** | `docs/functions.json` | JSON Schema definitions for all 23 built-in tools |
| **Tool Assembly** | `src/services/llmProviders/tools.ts` | Builds tool list for LLM providers, filters by capability |
| **Function Dispatcher** | `src/utils/functionCaller.ts` | Routes tool calls to appropriate handlers |
| **Tool Registry** | `src/utils/assistantTools.ts` | Loads predefined tool definitions |
| **Tool Implementations** | `src/utils/functions/` | Built-in tool logic implementations |
| **Custom Tools Manager** | `electron/main/customToolsManager.ts` | Custom tool lifecycle management |
| **Tool Call Handler** | `src/modules/conversation/toolCallHandler.ts` | Orchestrates tool execution and error handling |
| **Custom Tools Store** | `src/stores/customToolsStore.ts` | Frontend state management for custom tools |
| **Conversation Store** | `src/stores/conversationStore.ts` | Tool status messages and execution state |
| **IPC Manager** | `electron/main/ipcManager.ts:778-792` | IPC bridge for custom tool execution |
| **Desktop Manager** | `electron/main/desktopManager.ts` | Command execution approval system |
| **Type Definitions** | `types/customTools.ts` | TypeScript interfaces for custom tools |

### Tool Implementation Examples

**Calendar Tools:** `src/utils/functions/calendar.ts`
**Clipboard Tools:** `src/utils/functions/clipboard.ts`
**File System Tools:** `src/utils/functions/filesystem.ts`
**Memory Tools:** `src/utils/functions/memory.ts`
**Torrent Tools:** `src/utils/functions/torrent.ts`

---

## Provider-Specific Tool Filtering

Different AI providers have different tool calling capabilities:

### OpenAI
- Supports: All tool types
- Special: `image_generation`, `web_search_preview` (built-in provider tools)
- Structured outputs: Full support with `strict: true`

### OpenRouter
- Supports: Standard function tools
- Filters out: Provider-specific tools (`image_generation`, `web_search_preview`)
- Modified descriptions: `open_path` discourages web search usage

### Ollama & LM Studio
- Supports: Function tools only
- No provider-specific features

### AWS Bedrock (Claude)
- Supports: All tools except `image_generation`
- Full Claude tool calling support
- Computer use tools supported (future expansion)

**Implementation:** `src/services/llmProviders/tools.ts:66-135`

---

## Best Practices

### For Custom Tool Development

1. **Error Handling:** Always wrap logic in try-catch
2. **Validation:** Validate all input parameters
3. **Logging:** Use `context.log()` for debugging
4. **Return Format:** Use explicit `{success, data}` format
5. **Documentation:** Provide clear descriptions for LLM understanding
6. **Testing:** Test tools thoroughly before enabling
7. **Security:** Don't hardcode secrets, use environment variables
8. **Performance:** Avoid blocking operations, use async/await

### For Tool Configuration

1. **Minimal Enablement:** Only enable tools you actually need
2. **Regular Review:** Check enabled tools periodically
3. **Command Approval:** Review approved commands list regularly
4. **API Keys:** Protect settings file, rotate keys if exposed
5. **Custom Scripts:** Only install from trusted sources

### For Memory Tools

1. **Quality over Quantity:** Store meaningful facts, not trivial details
2. **Categorization:** Use appropriate `memoryType` for better retrieval
3. **Search Queries:** Provide clear queries for `recall_memories`
4. **Cleanup:** Use `delete_memory` for outdated information

---

## Troubleshooting

### Tool Not Appearing in LLM Context

1. Check tool is enabled in settings: `assistantTools` array
2. Verify tool schema is valid in `functions.json`
3. Check AI provider supports the tool type
4. Restart application to reload tool definitions

### Custom Tool Not Executing

1. Check tool is enabled: `enabled: true` in `custom-tools.json`
2. Verify script file exists at specified `entry` path
3. Check script exports proper function (`run`, `execute`, or `default`)
4. View validation errors in Settings → Customization tab
5. Check console logs for error messages

### Command Execution Blocked

1. Check if command needs approval
2. Review approved commands: `alice-settings.json` → `approvedCommands`
3. Grant approval when dialog appears
4. Check for typos in command string

### API Key Not Working

1. Verify key is correctly set in settings file
2. Check key has correct permissions for the service
3. Ensure no extra whitespace in key string
4. Test key directly with service API
5. Check for rate limiting or quota issues

---

## Future Expansion Possibilities

- **Streaming tool calls:** Real-time progress updates
- **Tool composition:** Chaining multiple tools
- **Parallel execution:** Running multiple tools simultaneously
- **Tool marketplace:** Sharing custom tools with community
- **Enhanced sandboxing:** Permissions system for custom tools
- **Tool analytics:** Usage tracking and performance monitoring
- **Web-based tools:** Tools that run in renderer process
- **MCP integration:** Enhanced Model Context Protocol support

---

*This documentation reflects the current state of the Alice tooling system as of 2026-01-11. For the latest updates, check the GitHub repository.*
