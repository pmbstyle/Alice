export interface MainProcessStreamRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  params?: Record<string, any>
  data?: any
  timeout?: number
}

type StreamQueueEvent =
  | { type: 'chunk'; data: any }
  | { type: 'done' }
  | { type: 'error'; error?: string; status?: number; data?: any }

function createStreamRequestId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `renderer-http-stream-${Date.now()}-${random}`
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

export async function* streamViaMainProcess(
  request: MainProcessStreamRequest,
  signal?: AbortSignal
): AsyncGenerator<any> {
  if (typeof window === 'undefined' || !window.ipcRenderer) {
    throw new Error('Electron IPC bridge is unavailable.')
  }

  const requestId = createStreamRequestId()
  const channel = `http:stream:event:${requestId}`
  const queue: StreamQueueEvent[] = []
  let pendingResolver: ((event: StreamQueueEvent) => void) | null = null
  let finished = false

  const pushEvent = (event: StreamQueueEvent) => {
    if (finished) {
      return
    }
    if (pendingResolver) {
      const resolve = pendingResolver
      pendingResolver = null
      resolve(event)
      return
    }
    queue.push(event)
  }

  const nextEvent = (): Promise<StreamQueueEvent> => {
    const queued = queue.shift()
    if (queued) {
      return Promise.resolve(queued)
    }
    return new Promise(resolve => {
      pendingResolver = resolve
    })
  }

  const listener = (_event: any, event: StreamQueueEvent) => {
    pushEvent(event)
  }

  const abort = () => {
    void window.ipcRenderer.invoke('http:stream-cancel', { requestId })
    pushEvent({ type: 'error', error: 'The operation was aborted.' })
  }

  window.ipcRenderer.on(channel, listener as any)
  signal?.addEventListener('abort', abort, { once: true })

  try {
    if (signal?.aborted) {
      throw createAbortError()
    }

    const startResult = await window.ipcRenderer.invoke('http:stream-start', {
      requestId,
      ...request,
    })
    if (!startResult?.success) {
      throw new Error(startResult?.error || 'HTTP stream request failed.')
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
        const message =
          event.error ||
          event.data?.error?.message ||
          event.data?.message ||
          'HTTP stream request failed.'
        const error = new Error(message) as Error & {
          status?: number
          data?: any
        }
        error.status = event.status
        error.data = event.data
        throw error
      }
      yield event.data
    }
  } finally {
    finished = true
    signal?.removeEventListener('abort', abort)
    window.ipcRenderer.off(channel, listener as any)
    void window.ipcRenderer.invoke('http:stream-cancel', { requestId })
  }
}
