import type { ChatMessage } from '../../types/chat'

export interface ReminderData {
  message: string
  taskName?: string
  timestamp?: string
}

export interface ReminderHandlerDependencies {
  subscribe(handler: (data: ReminderData) => void): () => void
  addMessage(message: ChatMessage): string
  enqueueSpeech(text: string): Promise<void>
  logInfo(...args: any[]): void
  logError(...args: any[]): void
}

export interface ReminderHandler {
  dispose(): void
}

export function createReminderHandler(
  dependencies: ReminderHandlerDependencies
): ReminderHandler {
  const handleReminder = async (data: ReminderData) => {
    dependencies.logInfo('[ReminderHandler] Received scheduler reminder:', data)

    try {
      const reminderMessage: ChatMessage = {
        id: `reminder-${Date.now()}`,
        role: 'assistant',
        content: [
          {
            type: 'app_text',
            text: data.message,
            isScheduledReminder: true,
            taskName: data.taskName,
            timestamp: data.timestamp,
          },
        ],
        created_at: Date.now(),
      }

      dependencies.addMessage(reminderMessage)

      if (data.message && data.message.trim()) {
        await dependencies.enqueueSpeech(data.message)
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return
      }
      dependencies.logError(
        '[ReminderHandler] Failed to deliver scheduler reminder:',
        error
      )
    }
  }

  const unsubscribe = dependencies.subscribe(handleReminder)

  return {
    dispose() {
      unsubscribe()
    },
  }
}

