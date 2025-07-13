/**
 * Utility to parse natural language time expressions into cron expressions
 */

interface TimePattern {
  pattern: RegExp
  cronGenerator: (match: RegExpMatchArray) => string
}

const timePatterns: TimePattern[] = [
  // "every hour"
  {
    pattern: /^every hour$/i,
    cronGenerator: () => '0 * * * *',
  },

  // "every 30 minutes"
  {
    pattern: /^every (\d+) minutes?$/i,
    cronGenerator: match => `*/${match[1]} * * * *`,
  },

  // "every day at 8:30 AM"
  {
    pattern: /^every day at (\d{1,2}):(\d{2})\s*(am|pm)$/i,
    cronGenerator: match => {
      let hour = parseInt(match[1])
      const minute = parseInt(match[2])
      const period = match[3].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `${minute} ${hour} * * *`
    },
  },

  // "every day at 8 AM"
  {
    pattern: /^every day at (\d{1,2})\s*(am|pm)$/i,
    cronGenerator: match => {
      let hour = parseInt(match[1])
      const period = match[2].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `0 ${hour} * * *`
    },
  },

  // "daily at 9:30 PM"
  {
    pattern: /^daily at (\d{1,2}):(\d{2})\s*(am|pm)$/i,
    cronGenerator: match => {
      let hour = parseInt(match[1])
      const minute = parseInt(match[2])
      const period = match[3].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `${minute} ${hour} * * *`
    },
  },

  // "daily at 9 PM"
  {
    pattern: /^daily at (\d{1,2})\s*(am|pm)$/i,
    cronGenerator: match => {
      let hour = parseInt(match[1])
      const period = match[2].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `0 ${hour} * * *`
    },
  },

  // "every morning at 8 AM"
  {
    pattern: /^every morning at (\d{1,2}):?(\d{2})?\s*(am)?$/i,
    cronGenerator: match => {
      const hour = parseInt(match[1])
      const minute = match[2] ? parseInt(match[2]) : 0
      return `${minute} ${hour} * * *`
    },
  },

  // "every morning at 8"
  {
    pattern: /^every morning at (\d{1,2})$/i,
    cronGenerator: match => {
      const hour = parseInt(match[1])
      return `0 ${hour} * * *`
    },
  },

  // "every evening at 6 PM"
  {
    pattern: /^every evening at (\d{1,2}):?(\d{2})?\s*(pm)?$/i,
    cronGenerator: match => {
      let hour = parseInt(match[1])
      const minute = match[2] ? parseInt(match[2]) : 0

      // If no PM specified but it's evening, assume PM
      if (!match[3] && hour < 12) hour += 12

      return `${minute} ${hour} * * *`
    },
  },

  // "every Monday at 2 PM"
  {
    pattern:
      /^every (monday|tuesday|wednesday|thursday|friday|saturday|sunday) at (\d{1,2}):?(\d{2})?\s*(am|pm)$/i,
    cronGenerator: match => {
      const days = {
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        sunday: 0,
      }
      const day = days[match[1].toLowerCase() as keyof typeof days]
      let hour = parseInt(match[2])
      const minute = match[3] ? parseInt(match[3]) : 0
      const period = match[4].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `${minute} ${hour} * * ${day}`
    },
  },

  // "every weekday at 9 AM"
  {
    pattern: /^every weekday at (\d{1,2}):?(\d{2})?\s*(am|pm)$/i,
    cronGenerator: match => {
      let hour = parseInt(match[1])
      const minute = match[2] ? parseInt(match[2]) : 0
      const period = match[3].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `${minute} ${hour} * * 1-5`
    },
  },

  // "every Friday at 11 PM"
  {
    pattern:
      /^every (monday|tuesday|wednesday|thursday|friday|saturday|sunday) at (\d{1,2}):?(\d{2})?\s*(am|pm)$/i,
    cronGenerator: match => {
      const days = {
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        sunday: 0,
      }
      const day = days[match[1].toLowerCase() as keyof typeof days]
      let hour = parseInt(match[2])
      const minute = match[3] ? parseInt(match[3]) : 0
      const period = match[4].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `${minute} ${hour} * * ${day}`
    },
  },

  // "every week on Friday at 5 PM"
  {
    pattern:
      /^every week on (monday|tuesday|wednesday|thursday|friday|saturday|sunday) at (\d{1,2}):?(\d{2})?\s*(am|pm)$/i,
    cronGenerator: match => {
      const days = {
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        sunday: 0,
      }
      const day = days[match[1].toLowerCase() as keyof typeof days]
      let hour = parseInt(match[2])
      const minute = match[3] ? parseInt(match[3]) : 0
      const period = match[4].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `${minute} ${hour} * * ${day}`
    },
  },

  // "at 3:30 PM daily"
  {
    pattern: /^at (\d{1,2}):(\d{2})\s*(am|pm) daily$/i,
    cronGenerator: match => {
      let hour = parseInt(match[1])
      const minute = parseInt(match[2])
      const period = match[3].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `${minute} ${hour} * * *`
    },
  },

  // "at 4:45 PM today" or "at 4:45 PM on July 13, 2025" - convert to daily recurring
  {
    pattern: /^at (\d{1,2}):(\d{2})\s*(am|pm)(?:\s+(?:today|on\s+.+))?$/i,
    cronGenerator: match => {
      let hour = parseInt(match[1])
      const minute = parseInt(match[2])
      const period = match[3].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `${minute} ${hour} * * *`
    },
  },

  // "in 5 minutes" - convert to one-time execution approximation
  {
    pattern: /^in (\d+) minutes?$/i,
    cronGenerator: match => {
      const now = new Date()
      now.setMinutes(now.getMinutes() + parseInt(match[1]))
      return `${now.getMinutes()} ${now.getHours()} * * *`
    },
  },

  // "today at 4:45 PM"
  {
    pattern: /^today at (\d{1,2}):(\d{2})\s*(am|pm)$/i,
    cronGenerator: match => {
      let hour = parseInt(match[1])
      const minute = parseInt(match[2])
      const period = match[3].toLowerCase()

      if (period === 'pm' && hour !== 12) hour += 12
      if (period === 'am' && hour === 12) hour = 0

      return `${minute} ${hour} * * *`
    },
  },
]

/**
 * Parse natural language time expression to cron expression
 */
export function parseNaturalLanguageToCron(input: string): string | null {
  const cleanInput = input.trim().toLowerCase()

  const cronParts = cleanInput.split(/\s+/)
  if (
    cronParts.length === 5 &&
    cronParts.every(part => /^[\d\*\-\/,]+$/.test(part))
  ) {
    return cleanInput
  }

  if (input.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
    try {
      const date = new Date(input)
      if (!isNaN(date.getTime())) {
        const minutes = date.getMinutes()
        const hours = date.getHours()
        console.log(
          `[CronParser] Converting ISO date ${input} to daily recurring: ${minutes} ${hours} * * *`
        )
        return `${minutes} ${hours} * * *`
      }
    } catch (error) {
      console.error('[CronParser] Error parsing ISO date:', error)
    }
  }

  for (const { pattern, cronGenerator } of timePatterns) {
    const match = cleanInput.match(pattern)
    if (match) {
      try {
        return cronGenerator(match)
      } catch (error) {
        console.error('[CronParser] Error generating cron expression:', error)
        continue
      }
    }
  }

  return null
}

/**
 * Validate if a cron expression is valid
 */
export function validateCronExpression(cronExpression: string): boolean {
  const parts = cronExpression.trim().split(/\s+/)

  if (parts.length !== 5) return false

  const [minute, hour, day, month, weekday] = parts

  const patterns = {
    minute:
      /^(\*|[0-5]?[0-9]|[0-5]?[0-9]-[0-5]?[0-9]|[0-5]?[0-9]\/[0-9]+|\*\/[0-9]+|[0-5]?[0-9](,[0-5]?[0-9])*)$/,
    hour: /^(\*|[0-1]?[0-9]|2[0-3]|[0-1]?[0-9]-[0-1]?[0-9]|2[0-3]-2[0-3]|[0-1]?[0-9]\/[0-9]+|2[0-3]\/[0-9]+|\*\/[0-9]+|[0-1]?[0-9](,[0-1]?[0-9])*|2[0-3](,2[0-3])*)$/,
    day: /^(\*|[1-9]|[12][0-9]|3[01]|[1-9]-[1-9]|[12][0-9]-[12][0-9]|3[01]-3[01]|[1-9]\/[0-9]+|[12][0-9]\/[0-9]+|3[01]\/[0-9]+|\*\/[0-9]+|[1-9](,[1-9])*|[12][0-9](,[12][0-9])*|3[01](,3[01])*)$/,
    month:
      /^(\*|[1-9]|1[0-2]|[1-9]-[1-9]|1[0-2]-1[0-2]|[1-9]\/[0-9]+|1[0-2]\/[0-9]+|\*\/[0-9]+|[1-9](,[1-9])*|1[0-2](,1[0-2])*)$/,
    weekday: /^(\*|[0-6]|[0-6]-[0-6]|[0-6]\/[0-9]+|\*\/[0-9]+|[0-6](,[0-6])*)$/,
  }

  return (
    patterns.minute.test(minute) &&
    patterns.hour.test(hour) &&
    patterns.day.test(day) &&
    patterns.month.test(month) &&
    patterns.weekday.test(weekday)
  )
}

/**
 * Get human-readable description of a cron expression
 */
export function describeCronExpression(cronExpression: string): string {
  const parts = cronExpression.trim().split(/\s+/)
  if (parts.length !== 5) return 'Invalid cron expression'

  const [minute, hour, day, month, weekday] = parts

  if (cronExpression === '0 * * * *') return 'Every hour'
  if (cronExpression === '0 0 * * *') return 'Daily at midnight'
  if (cronExpression === '0 8 * * *') return 'Daily at 8:00 AM'
  if (cronExpression === '0 20 * * *') return 'Daily at 8:00 PM'
  if (cronExpression === '0 8 * * 1-5') return 'Weekdays at 8:00 AM'
  if (cronExpression === '0 8 * * 1') return 'Every Monday at 8:00 AM'
  if (cronExpression === '0 8 * * 5') return 'Every Friday at 8:00 AM'

  let description = ''

  if (hour === '*' && minute === '*') {
    description = 'Every minute'
  } else if (hour === '*') {
    if (minute.startsWith('*/')) {
      const interval = minute.substring(2)
      description = `Every ${interval} minutes`
    } else {
      description = `At ${minute} minutes past every hour`
    }
  } else {
    const hourNum = parseInt(hour)
    const minuteNum = parseInt(minute)
    const time12 =
      hourNum === 0
        ? '12:00 AM'
        : hourNum < 12
          ? `${hourNum}:${minuteNum.toString().padStart(2, '0')} AM`
          : hourNum === 12
            ? `12:${minuteNum.toString().padStart(2, '0')} PM`
            : `${hourNum - 12}:${minuteNum.toString().padStart(2, '0')} PM`
    description = `At ${time12}`
  }

  if (weekday !== '*') {
    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]
    if (weekday === '1-5') {
      description += ' on weekdays'
    } else if (weekday.includes(',')) {
      const days = weekday
        .split(',')
        .map(d => dayNames[parseInt(d)])
        .join(', ')
      description += ` on ${days}`
    } else {
      description += ` on ${dayNames[parseInt(weekday)]}`
    }
  } else if (day !== '*') {
    description += ` on day ${day} of the month`
  } else {
    description += ' daily'
  }

  return description
}

/**
 * Get example expressions for help
 */
export function getExampleExpressions(): {
  natural: string
  cron: string
  description: string
}[] {
  return [
    {
      natural: 'every morning at 8 AM',
      cron: '0 8 * * *',
      description: 'Daily at 8:00 AM',
    },
    {
      natural: 'every hour',
      cron: '0 * * * *',
      description: 'Every hour',
    },
    {
      natural: 'every 30 minutes',
      cron: '*/30 * * * *',
      description: 'Every 30 minutes',
    },
    {
      natural: 'every Friday at 11 PM',
      cron: '0 23 * * 5',
      description: 'Every Friday at 11:00 PM',
    },
    {
      natural: 'every weekday at 9 AM',
      cron: '0 9 * * 1-5',
      description: 'Weekdays at 9:00 AM',
    },
    {
      natural: 'daily at 6:30 PM',
      cron: '30 18 * * *',
      description: 'Daily at 6:30 PM',
    },
  ]
}
