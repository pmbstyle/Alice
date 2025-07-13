import * as cron from 'node-cron'
import { randomUUID } from 'node:crypto'
import { getDBInstance } from './thoughtVectorStore'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export interface ScheduledTask {
  id: string
  name: string
  cronExpression: string
  actionType: 'command' | 'reminder'
  details: string
  isActive: boolean
  createdAt: string
  lastRun?: string
  nextRun?: string
}

const activeCronJobs = new Map<string, cron.ScheduledTask>()

/**
 * Initialize the scheduler database table
 */
export function initializeSchedulerDB(): void {
  const db = getDBInstance()

  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      action_type TEXT NOT NULL CHECK (action_type IN ('command', 'reminder')),
      details TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_run TEXT,
      next_run TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_active ON scheduled_tasks (is_active);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run ON scheduled_tasks (next_run);
  `)

  console.log('[SchedulerManager] Database table initialized')
}

/**
 * Load all active tasks from database and schedule them
 */
export async function loadAndScheduleAllTasks(): Promise<void> {
  const db = getDBInstance()

  try {
    const activeTasks = db
      .prepare('SELECT * FROM scheduled_tasks WHERE is_active = 1')
      .all() as Array<{
      id: string
      name: string
      cron_expression: string
      action_type: string
      details: string
      is_active: number
      created_at: string
      last_run: string | null
      next_run: string | null
    }>

    console.log(`[SchedulerManager] Loading ${activeTasks.length} active tasks`)

    for (const task of activeTasks) {
      const scheduledTask: ScheduledTask = {
        id: task.id,
        name: task.name,
        cronExpression: task.cron_expression,
        actionType: task.action_type as 'command' | 'reminder',
        details: task.details,
        isActive: task.is_active === 1,
        createdAt: task.created_at,
        lastRun: task.last_run || undefined,
        nextRun: task.next_run || undefined,
      }

      await scheduleTask(scheduledTask, false)
    }

    console.log('[SchedulerManager] All active tasks loaded and scheduled')
  } catch (error) {
    console.error('[SchedulerManager] Failed to load tasks:', error)
  }
}

/**
 * Schedule a single task
 */
export async function scheduleTask(
  task: ScheduledTask,
  saveToDb: boolean = true
): Promise<boolean> {
  try {
    if (!cron.validate(task.cronExpression)) {
      console.error(
        `[SchedulerManager] Invalid cron expression: ${task.cronExpression}`
      )
      return false
    }

    const cronJob = cron.schedule(
      task.cronExpression,
      async () => {
        console.log(`[SchedulerManager] Executing task: ${task.name}`)
        await executeTask(task)

        const now = new Date().toISOString()
        updateTaskLastRun(task.id, now)
      },
      {
        scheduled: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    )

    cronJob.start()

    activeCronJobs.set(task.id, cronJob)

    if (saveToDb) {
      await saveTaskToDb(task)
    }

    console.log(
      `[SchedulerManager] Task scheduled: ${task.name} (${task.cronExpression})`
    )
    return true
  } catch (error) {
    console.error(
      `[SchedulerManager] Failed to schedule task ${task.name}:`,
      error
    )
    return false
  }
}

/**
 * Execute a scheduled task
 */
async function executeTask(task: ScheduledTask): Promise<void> {
  try {
    if (task.actionType === 'command') {
      console.log(`[SchedulerManager] Executing command: ${task.details}`)
      const { stdout, stderr } = await execAsync(task.details)

      if (stderr) {
        console.warn(`[SchedulerManager] Command stderr: ${stderr}`)
      }
      if (stdout) {
        console.log(`[SchedulerManager] Command stdout: ${stdout}`)
      }
    } else if (task.actionType === 'reminder') {
      console.log(`[SchedulerManager] Sending reminder: ${task.details}`)
      const { webContents } = await import('electron')
      const allWindows = webContents.getAllWebContents()

      for (const wc of allWindows) {
        if (!wc.isDestroyed()) {
          wc.send('scheduler:reminder', {
            taskId: task.id,
            taskName: task.name,
            message: task.details,
            timestamp: new Date().toISOString(),
          })
        }
      }
    }
  } catch (error) {
    console.error(
      `[SchedulerManager] Failed to execute task ${task.name}:`,
      error
    )
  }
}

/**
 * Save task to database
 */
async function saveTaskToDb(task: ScheduledTask): Promise<void> {
  const db = getDBInstance()

  try {
    const stmt = db.prepare(`
      INSERT INTO scheduled_tasks 
      (id, name, cron_expression, action_type, details, is_active, created_at, last_run, next_run)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      task.id,
      task.name,
      task.cronExpression,
      task.actionType,
      task.details,
      task.isActive ? 1 : 0,
      task.createdAt,
      task.lastRun || null,
      task.nextRun || null
    )

    console.log(`[SchedulerManager] Task saved to database: ${task.id}`)
  } catch (error) {
    console.error('[SchedulerManager] Failed to save task to database:', error)
    throw error
  }
}

/**
 * Update task's last run time
 */
function updateTaskLastRun(taskId: string, lastRun: string): void {
  const db = getDBInstance()

  try {
    const stmt = db.prepare(
      'UPDATE scheduled_tasks SET last_run = ? WHERE id = ?'
    )
    stmt.run(lastRun, taskId)
  } catch (error) {
    console.error('[SchedulerManager] Failed to update last run time:', error)
  }
}

/**
 * Create a new scheduled task
 */
export async function createScheduledTask(
  name: string,
  cronExpression: string,
  actionType: 'command' | 'reminder',
  details: string
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  try {
    const task: ScheduledTask = {
      id: randomUUID(),
      name,
      cronExpression,
      actionType,
      details,
      isActive: true,
      createdAt: new Date().toISOString(),
    }

    const success = await scheduleTask(task, true)

    if (success) {
      return { success: true, taskId: task.id }
    } else {
      return { success: false, error: 'Failed to schedule task' }
    }
  } catch (error) {
    console.error('[SchedulerManager] Failed to create task:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Get all scheduled tasks
 */
export function getAllScheduledTasks(): ScheduledTask[] {
  const db = getDBInstance()

  try {
    const tasks = db
      .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
      .all() as Array<{
      id: string
      name: string
      cron_expression: string
      action_type: string
      details: string
      is_active: number
      created_at: string
      last_run: string | null
      next_run: string | null
    }>

    return tasks.map(task => ({
      id: task.id,
      name: task.name,
      cronExpression: task.cron_expression,
      actionType: task.action_type as 'command' | 'reminder',
      details: task.details,
      isActive: task.is_active === 1,
      createdAt: task.created_at,
      lastRun: task.last_run || undefined,
      nextRun: task.next_run || undefined,
    }))
  } catch (error) {
    console.error('[SchedulerManager] Failed to get tasks:', error)
    return []
  }
}

/**
 * Delete a scheduled task
 */
export async function deleteScheduledTask(taskId: string): Promise<boolean> {
  try {
    const cronJob = activeCronJobs.get(taskId)
    if (cronJob) {
      cronJob.stop()
      cronJob.destroy()
      activeCronJobs.delete(taskId)
    }

    const db = getDBInstance()
    const stmt = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?')
    const result = stmt.run(taskId)

    if (result.changes > 0) {
      console.log(`[SchedulerManager] Task deleted: ${taskId}`)
      return true
    } else {
      console.log(`[SchedulerManager] Task not found: ${taskId}`)
      return false
    }
  } catch (error) {
    console.error('[SchedulerManager] Failed to delete task:', error)
    return false
  }
}

/**
 * Toggle task active status
 */
export async function toggleTaskStatus(taskId: string): Promise<boolean> {
  try {
    const db = getDBInstance()

    const task = db
      .prepare('SELECT * FROM scheduled_tasks WHERE id = ?')
      .get(taskId) as any
    if (!task) {
      return false
    }

    const newStatus = task.is_active === 1 ? 0 : 1

    const stmt = db.prepare(
      'UPDATE scheduled_tasks SET is_active = ? WHERE id = ?'
    )
    stmt.run(newStatus, taskId)

    const cronJob = activeCronJobs.get(taskId)
    if (newStatus === 1) {
      if (!cronJob) {
        const scheduledTask: ScheduledTask = {
          id: task.id,
          name: task.name,
          cronExpression: task.cron_expression,
          actionType: task.action_type,
          details: task.details,
          isActive: true,
          createdAt: task.created_at,
          lastRun: task.last_run || undefined,
          nextRun: task.next_run || undefined,
        }
        await scheduleTask(scheduledTask, false)
      }
    } else {
      if (cronJob) {
        cronJob.stop()
        cronJob.destroy()
        activeCronJobs.delete(taskId)
      }
    }

    console.log(
      `[SchedulerManager] Task ${taskId} ${newStatus === 1 ? 'activated' : 'deactivated'}`
    )
    return true
  } catch (error) {
    console.error('[SchedulerManager] Failed to toggle task status:', error)
    return false
  }
}

/**
 * Shutdown all scheduled tasks
 */
export function shutdownScheduler(): void {
  console.log('[SchedulerManager] Shutting down scheduler...')

  for (const [taskId, cronJob] of activeCronJobs) {
    try {
      cronJob.stop()
      cronJob.destroy()
      console.log(`[SchedulerManager] Stopped task: ${taskId}`)
    } catch (error) {
      console.error(`[SchedulerManager] Error stopping task ${taskId}:`, error)
    }
  }

  activeCronJobs.clear()
  console.log('[SchedulerManager] Scheduler shutdown complete')
}
