import { describe, expect, it, vi } from 'vitest'
import { createReminderHandler } from '../reminderHandler'
import type { ReminderHandlerDependencies } from '../reminderHandler'

function setup() {
  let storedHandler: ((data: any) => void) | null = null
  const unsubscribe = vi.fn()

  const deps: ReminderHandlerDependencies = {
    subscribe: handler => {
      storedHandler = handler
      return unsubscribe
    },
    addMessage: vi.fn(),
    enqueueSpeech: vi.fn().mockResolvedValue(undefined),
    logInfo: vi.fn(),
    logError: vi.fn(),
  }

  const handler = createReminderHandler(deps)

  return { deps, handler, trigger: (data: any) => storedHandler?.(data), unsubscribe }
}

describe('createReminderHandler', () => {
  it('adds reminder message and enqueues speech', async () => {
    const { deps, trigger } = setup()

    await trigger?.({
      message: 'Time for a break',
      taskName: 'Break',
      timestamp: 'now',
    })

    expect(deps.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: [
          expect.objectContaining({
            text: 'Time for a break',
            isScheduledReminder: true,
            taskName: 'Break',
          }),
        ],
      })
    )
    expect(deps.enqueueSpeech).toHaveBeenCalledWith('Time for a break')
  })

  it('skips speech when message is empty', async () => {
    const { deps, trigger } = setup()
    await trigger?.({ message: '   ' })
    expect(deps.enqueueSpeech).not.toHaveBeenCalled()
  })

  it('logs non-abort errors', async () => {
    const { deps, trigger } = setup()
    deps.enqueueSpeech = vi.fn().mockRejectedValue(new Error('fail'))

    await trigger?.({ message: 'Hello' })

    expect(deps.logError).toHaveBeenCalledWith(
      '[ReminderHandler] Failed to deliver scheduler reminder:',
      expect.any(Error)
    )
  })

  it('unsubscribes when disposed', () => {
    const { handler, unsubscribe } = setup()
    handler.dispose()
    expect(unsubscribe).toHaveBeenCalled()
  })
})

