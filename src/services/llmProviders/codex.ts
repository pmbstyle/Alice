import type OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'
import { buildAssistantSystemPrompt } from '../../prompts/systemPrompt'
import { CODEX_TEXT_MODELS, getSafeProviderModel } from './providerCatalog'

interface CodexModelListResult {
  success?: boolean
  models?: Array<{
    id?: string
    model?: string
    displayName?: string
    hidden?: boolean
  }>
}

function toOpenAIModel(id: string): OpenAI.Models.Model {
  return {
    id,
    object: 'model' as const,
    created: 0,
    owned_by: 'chatgpt-codex',
  }
}

function fallbackModels(): OpenAI.Models.Model[] {
  return CODEX_TEXT_MODELS.map(model => toOpenAIModel(model.id))
}

function normalizeCodexModelIds(result: CodexModelListResult): string[] {
  if (!result?.success || !Array.isArray(result.models)) {
    return []
  }

  return result.models
    .filter(model => !model.hidden)
    .map(model => model.id || model.model)
    .filter((id): id is string => Boolean(id?.trim()))
}

async function listLiveCodexModelIds(): Promise<string[]> {
  if (typeof window === 'undefined' || !window.ipcRenderer) {
    return []
  }

  try {
    const result = (await window.ipcRenderer.invoke(
      'codex-models:list'
    )) as CodexModelListResult
    return normalizeCodexModelIds(result)
  } catch (error) {
    console.warn('Failed to list ChatGPT Codex models:', error)
    return []
  }
}

async function resolveCodexModel(configuredModel?: string): Promise<string> {
  const liveModelIds = await listLiveCodexModelIds()
  const configured = configuredModel?.trim()

  if (configured && liveModelIds.includes(configured)) {
    return configured
  }

  const safeConfigured = getSafeProviderModel('codex', configured)
  if (liveModelIds.includes(safeConfigured)) {
    return safeConfigured
  }

  if (liveModelIds.length > 0) {
    return liveModelIds[0]
  }

  return safeConfigured
}

async function getFallbackModelCandidates(originalModel: string): Promise<string[]> {
  const candidates = [...(await listLiveCodexModelIds()), ...fallbackModelIds()]
  return Array.from(new Set(candidates)).filter(model => model !== originalModel)
}

function fallbackModelIds(): string[] {
  return CODEX_TEXT_MODELS.map(model => model.id)
}

function isLikelyCodexModelCompatibilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('requires a newer version of Codex') ||
    message.includes('model is not supported when using Codex') ||
    message.includes('model_not_found') ||
    message.includes('unsupported_model')
  )
}

async function* streamViaCodexAppServerWithFallback(
  request: {
    input: Array<{ type: 'text'; text: string }>
    model: string
    instructions: string
    effort?: string
  },
  signal?: AbortSignal
): AsyncGenerator<any> {
  try {
    yield* streamViaCodexAppServer(request, signal)
    return
  } catch (error) {
    if (!isLikelyCodexModelCompatibilityError(error)) {
      throw error
    }
  }

  const fallbackCandidates = await getFallbackModelCandidates(request.model)
  for (const model of fallbackCandidates) {
    try {
      yield* streamViaCodexAppServer({ ...request, model }, signal)
      return
    } catch (error) {
      if (!isLikelyCodexModelCompatibilityError(error)) {
        throw error
      }
    }
  }

  throw new Error(
    `ChatGPT Codex rejected the configured model '${request.model}', and no compatible fallback model was accepted by the installed Codex CLI.`
  )
}

function modelsToOpenAIModels(ids: string[]): OpenAI.Models.Model[] {
  return ids.map(toOpenAIModel)
}

type CodexStreamQueueEvent =
  | { type: 'chunk'; data: any }
  | { type: 'done' }
  | { type: 'error'; error?: string }

function createRequestId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `renderer-codex-stream-${Date.now()}-${random}`
}

function createAbortError(): Error {
  try {
    return new DOMException('The operation was aborted.', 'AbortError')
  } catch {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    return error
  }
}

function contentPartToText(part: any): string {
  if (!part) return ''
  if (typeof part === 'string') return part
  if (typeof part.text === 'string') return part.text
  if (typeof part.output_text === 'string') return part.output_text
  if (part.type === 'input_image' && part.image_url) {
    return `[Image: ${part.image_url}]`
  }
  if (part.type === 'input_file' && part.file_id) {
    return `[File: ${part.file_id}]`
  }
  return ''
}

function inputItemToText(item: any): string {
  if (!item) return ''

  if (item.type === 'function_call_output') {
    return `[Tool output ${item.call_id || ''}]\n${item.output || ''}`.trim()
  }

  if (item.type === 'function_call') {
    return `[Assistant tool call ${item.name || ''}]\n${
      typeof item.arguments === 'string'
        ? item.arguments
        : JSON.stringify(item.arguments || {})
    }`.trim()
  }

  const role = item.role || item.type || 'message'
  const content = Array.isArray(item.content)
    ? item.content.map(contentPartToText).filter(Boolean).join('\n')
    : contentPartToText(item.content)

  if (!content.trim()) return ''
  return `${String(role).toUpperCase()}:\n${content}`.trim()
}

export function convertResponsesInputToCodexInput(
  input: OpenAI.Responses.Request.InputItemLike[]
): Array<{ type: 'text'; text: string }> {
  const text = input.map(inputItemToText).filter(Boolean).join('\n\n')
  return [
    {
      type: 'text',
      text,
    },
  ]
}

export async function listCodexModels(): Promise<OpenAI.Models.Model[]> {
  const liveModelIds = await listLiveCodexModelIds()
  return liveModelIds.length > 0
    ? modelsToOpenAIModels(liveModelIds)
    : fallbackModels()
}

export const createCodexResponse = async (
  input: OpenAI.Responses.Request.InputItemLike[],
  previousResponseId: string | null,
  stream: boolean = false,
  customInstructions?: string,
  signal?: AbortSignal
): Promise<any> => {
  const settings = useSettingsStore().config
  const model = await resolveCodexModel(settings.assistantModel)
  const instructions =
    customInstructions ||
    buildAssistantSystemPrompt(settings.assistantSystemPrompt)

  const request = {
    input: convertResponsesInputToCodexInput(input),
    model,
    instructions,
    effort: settings.assistantReasoningEffort || 'medium',
  }

  return streamViaCodexAppServerWithFallback(request, signal)
}

async function* streamViaCodexAppServer(
  request: {
    input: Array<{ type: 'text'; text: string }>
    model: string
    instructions: string
    effort?: string
  },
  signal?: AbortSignal
): AsyncGenerator<any> {
  if (typeof window === 'undefined' || !window.ipcRenderer) {
    throw new Error('Electron IPC bridge is unavailable.')
  }

  const requestId = createRequestId()
  const channel = `codex:stream:event:${requestId}`
  const queue: CodexStreamQueueEvent[] = []
  let pendingResolver: ((event: CodexStreamQueueEvent) => void) | null = null
  let finished = false

  const pushEvent = (event: CodexStreamQueueEvent) => {
    if (finished) return
    if (pendingResolver) {
      const resolve = pendingResolver
      pendingResolver = null
      resolve(event)
      return
    }
    queue.push(event)
  }

  const nextEvent = (): Promise<CodexStreamQueueEvent> => {
    const queued = queue.shift()
    if (queued) {
      return Promise.resolve(queued)
    }
    return new Promise(resolve => {
      pendingResolver = resolve
    })
  }

  const listener = (_event: any, event: CodexStreamQueueEvent) => {
    pushEvent(event)
  }

  const abort = () => {
    void window.ipcRenderer.invoke('codex-response:cancel', { requestId })
    pushEvent({ type: 'error', error: 'The operation was aborted.' })
  }

  window.ipcRenderer.on(channel, listener as any)
  signal?.addEventListener('abort', abort, { once: true })

  try {
    if (signal?.aborted) {
      throw createAbortError()
    }

    const startResult = await window.ipcRenderer.invoke(
      'codex-response:start',
      {
        requestId,
        input: request.input,
        model: request.model,
        instructions: request.instructions,
        effort: request.effort,
      }
    )
    if (!startResult?.success) {
      throw new Error(startResult?.error || 'Codex stream request failed.')
    }

    while (true) {
      const event = await nextEvent()
      if (event.type === 'done') {
        break
      }
      if (event.type === 'error') {
        if (signal?.aborted) {
          throw createAbortError()
        }
        throw new Error(event.error || 'Codex stream request failed.')
      }
      yield event.data
    }
  } finally {
    finished = true
    signal?.removeEventListener('abort', abort)
    window.ipcRenderer.off(channel, listener as any)
    void window.ipcRenderer.invoke('codex-response:cancel', { requestId })
  }
}
