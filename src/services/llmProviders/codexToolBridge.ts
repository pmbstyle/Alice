import { useSettingsStore } from '../../stores/settingsStore'
import { executeFunction } from '../../utils/functionCaller'

const CODEX_TOOL_RESULT_MAX_CHARS = 16_000

interface CodexToolExecuteRequest {
  requestId?: string
  tool?: string
  arguments?: any
}

interface CodexToolExecuteResult {
  requestId?: string
  success: boolean
  contentItems: Array<{ type: 'inputText'; text: string }>
}

let codexToolBridgeRegistered = false

function truncateToolResult(text: string): string {
  if (text.length <= CODEX_TOOL_RESULT_MAX_CHARS) {
    return text
  }

  const notice = `\n...(Alice truncated tool result: original ${text.length} chars, showing ${CODEX_TOOL_RESULT_MAX_CHARS}.)`
  return `${text.slice(
    0,
    Math.max(0, CODEX_TOOL_RESULT_MAX_CHARS - notice.length)
  )}${notice}`
}

function createToolResult(
  requestId: string | undefined,
  text: string,
  success: boolean
): CodexToolExecuteResult {
  return {
    requestId,
    success,
    contentItems: [
      {
        type: 'inputText',
        text: truncateToolResult(text),
      },
    ],
  }
}

async function respondToCodexToolCall(
  result: CodexToolExecuteResult
): Promise<void> {
  await window.ipcRenderer.invoke('codex-tool:result', result)
}

export function registerCodexToolBridge(): void {
  if (
    codexToolBridgeRegistered ||
    typeof window === 'undefined' ||
    !window.ipcRenderer
  ) {
    return
  }

  codexToolBridgeRegistered = true
  window.ipcRenderer.on(
    'codex-tool:execute',
    async (_event, request: CodexToolExecuteRequest) => {
      const requestId = request?.requestId
      const toolName = request?.tool

      if (!toolName) {
        await respondToCodexToolCall(
          createToolResult(
            requestId,
            'Error: Codex did not specify a tool.',
            false
          )
        )
        return
      }

      try {
        const settings = useSettingsStore().config
        const resultText = await executeFunction(
          toolName,
          request.arguments || {},
          settings
        )
        const success = !resultText.trim().toLowerCase().startsWith('error')
        await respondToCodexToolCall(
          createToolResult(requestId, resultText, success)
        )
      } catch (error: any) {
        await respondToCodexToolCall(
          createToolResult(
            requestId,
            `Error executing ${toolName}: ${error?.message || String(error)}`,
            false
          )
        )
      }
    }
  )
}
