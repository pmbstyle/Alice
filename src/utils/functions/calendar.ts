import {
  parseNaturalLanguageToCron,
  validateCronExpression,
} from '../cronParser'

interface FunctionResult {
  success: boolean
  data?: any
  error?: string
}

export interface ScheduleTaskArgs {
  name: string
  schedule: string
  action_type: 'command' | 'reminder'
  details: string
}

export interface ManageScheduledTasksArgs {
  action: 'list' | 'delete' | 'toggle'
  task_id?: string
}

interface CalendarEventResource {
  summary?: string
  description?: string
  start?: { dateTime?: string; timeZone?: string; date?: string }
  end?: { dateTime?: string; timeZone?: string; date?: string }
  location?: string
  attendees?: { email: string }[]
}

export async function schedule_task(
  args: ScheduleTaskArgs
): Promise<FunctionResult> {
  try {
    let cronExpression = parseNaturalLanguageToCron(args.schedule)

    if (!cronExpression) {
      if (validateCronExpression(args.schedule)) {
        cronExpression = args.schedule
      } else {
        return {
          success: false,
          error: `Unable to parse schedule "${args.schedule}". Try formats like "every morning at 8 AM", "every hour", "daily at 6 PM", or use cron format like "0 8 * * *".`,
        }
      }
    }

    if (!validateCronExpression(cronExpression)) {
      return {
        success: false,
        error: `Generated cron expression "${cronExpression}" is invalid.`,
      }
    }

    const result = await window.ipcRenderer.invoke('scheduler:create-task', {
      name: args.name,
      cronExpression,
      actionType: args.action_type,
      details: args.details,
    })

    if (result.success) {
      return {
        success: true,
        data: {
          message: `Task "${args.name}" scheduled successfully.`,
          taskId: result.taskId,
          cronExpression,
          schedule: args.schedule,
        },
      }
    } else {
      return {
        success: false,
        error: result.error || 'Failed to create scheduled task.',
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function manage_scheduled_tasks(
  args: ManageScheduledTasksArgs
): Promise<FunctionResult> {
  try {
    switch (args.action) {
      case 'list': {
        const result = await window.ipcRenderer.invoke(
          'scheduler:get-all-tasks'
        )
        if (result.success) {
          const tasks = result.tasks.map((task: any) => ({
            id: task.id,
            name: task.name,
            schedule: task.cronExpression,
            actionType: task.actionType,
            details: task.details,
            isActive: task.isActive,
            createdAt: task.createdAt,
            lastRun: task.lastRun,
            nextRun: task.nextRun,
          }))
          return {
            success: true,
            data: {
              message: `Found ${tasks.length} scheduled tasks.`,
              tasks,
            },
          }
        } else {
          return {
            success: false,
            error: result.error || 'Failed to get scheduled tasks.',
          }
        }
      }

      case 'delete': {
        if (!args.task_id) {
          return {
            success: false,
            error: 'Task ID is required for delete action.',
          }
        }

        const result = await window.ipcRenderer.invoke(
          'scheduler:delete-task',
          {
            taskId: args.task_id,
          }
        )

        if (result.success) {
          return {
            success: true,
            data: { message: `Task ${args.task_id} deleted successfully.` },
          }
        } else {
          return {
            success: false,
            error: result.error || 'Failed to delete task.',
          }
        }
      }

      case 'toggle': {
        if (!args.task_id) {
          return {
            success: false,
            error: 'Task ID is required for toggle action.',
          }
        }

        const result = await window.ipcRenderer.invoke(
          'scheduler:toggle-task',
          {
            taskId: args.task_id,
          }
        )

        if (result.success) {
          return {
            success: true,
            data: {
              message: `Task ${args.task_id} status toggled successfully.`,
            },
          }
        } else {
          return {
            success: false,
            error: result.error || 'Failed to toggle task status.',
          }
        }
      }

      default:
        return { success: false, error: `Unknown action: ${args.action}` }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function get_calendar_events(args: {
  calendarId?: string
  timeMin?: string
  timeMax?: string
  q?: string
  maxResults?: number
}): Promise<FunctionResult> {
  try {
    const result = await window.ipcRenderer.invoke(
      'google-calendar:list-events',
      {
        calendarId: args.calendarId || 'primary',
        timeMin: args.timeMin,
        timeMax: args.timeMax,
        q: args.q,
        maxResults: args.maxResults || 10,
      }
    )
    if (result.success) {
      return { success: true, data: result.data || 'No events found.' }
    }
    return {
      success: false,
      error: result.error || 'Failed to list calendar events.',
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}

export async function create_calendar_event(args: {
  calendarId?: string
  summary: string
  description?: string
  startDateTime: string
  endDateTime: string
  location?: string
  attendees?: string[]
}): Promise<FunctionResult> {
  try {
    const eventResource: CalendarEventResource = {
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.startDateTime },
      end: { dateTime: args.endDateTime },
      location: args.location,
    }
    if (args.attendees && args.attendees.length > 0) {
      eventResource.attendees = args.attendees.map(email => ({ email }))
    }

    const result = await window.ipcRenderer.invoke(
      'google-calendar:create-event',
      {
        calendarId: args.calendarId || 'primary',
        eventResource,
      }
    )
    if (result.success) {
      return { success: true, data: result.data }
    }
    return {
      success: false,
      error: result.error || 'Failed to create calendar event.',
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}

export async function update_calendar_event(args: {
  calendarId?: string
  eventId: string
  summary?: string
  description?: string
  startDateTime?: string
  endDateTime?: string
  location?: string
  attendees?: string[]
}): Promise<FunctionResult> {
  try {
    const eventResource: CalendarEventResource = {}
    if (args.summary) eventResource.summary = args.summary
    if (args.description) eventResource.description = args.description
    if (args.startDateTime)
      eventResource.start = { dateTime: args.startDateTime }
    if (args.endDateTime) eventResource.end = { dateTime: args.endDateTime }
    if (args.location) eventResource.location = args.location
    if (args.attendees && args.attendees.length > 0) {
      eventResource.attendees = args.attendees.map(email => ({ email }))
    }

    if (Object.keys(eventResource).length === 0) {
      return {
        success: false,
        error: 'No fields provided to update for the event.',
      }
    }

    const result = await window.ipcRenderer.invoke(
      'google-calendar:update-event',
      {
        calendarId: args.calendarId || 'primary',
        eventId: args.eventId,
        eventResource,
      }
    )
    if (result.success) {
      return { success: true, data: result.data }
    }
    return {
      success: false,
      error: result.error || 'Failed to update calendar event.',
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}

export async function delete_calendar_event(args: {
  calendarId?: string
  eventId: string
}): Promise<FunctionResult> {
  try {
    const result = await window.ipcRenderer.invoke(
      'google-calendar:delete-event',
      {
        calendarId: args.calendarId || 'primary',
        eventId: args.eventId,
      }
    )
    if (result.success) {
      return { success: true, data: result.data }
    }
    return {
      success: false,
      error: result.error || 'Failed to delete calendar event.',
    }
  } catch (error: any) {
    return { success: false, error: `IPC Error: ${error.message}` }
  }
}
