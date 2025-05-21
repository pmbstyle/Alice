import { google, calendar_v3 } from 'googleapis'

export async function listEvents(
  authClient: any,
  calendarId: string = 'primary',
  timeMin?: string,
  timeMax?: string,
  q?: string,
  maxResults: number = 10
) {
  const calendar = google.calendar({ version: 'v3', auth: authClient })
  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin: timeMin || new Date().toISOString(),
      timeMax,
      q,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    })
    return { success: true, data: res.data.items }
  } catch (error: any) {
    console.error('Error listing events:', error.message)
    return { success: false, error: error.message }
  }
}

export async function createEvent(
  authClient: any,
  calendarId: string = 'primary',
  eventResource: calendar_v3.Schema$Event
) {
  const calendar = google.calendar({ version: 'v3', auth: authClient })
  try {
    const res = await calendar.events.insert({
      calendarId,
      requestBody: eventResource,
    })
    return { success: true, data: res.data }
  } catch (error: any) {
    console.error('Error creating event:', error.message)
    return { success: false, error: error.message }
  }
}

export async function updateEvent(
  authClient: any,
  calendarId: string = 'primary',
  eventId: string,
  eventResource: calendar_v3.Schema$Event
) {
  const calendar = google.calendar({ version: 'v3', auth: authClient })
  try {
    const res = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: eventResource,
    })
    return { success: true, data: res.data }
  } catch (error: any) {
    console.error('Error updating event:', error.message)
    return { success: false, error: error.message }
  }
}

export async function deleteEvent(
  authClient: any,
  calendarId: string = 'primary',
  eventId: string
) {
  const calendar = google.calendar({ version: 'v3', auth: authClient })
  try {
    await calendar.events.delete({
      calendarId,
      eventId,
    })
    return { success: true, data: { message: 'Event deleted successfully.' } }
  } catch (error: any) {
    console.error('Error deleting event:', error.message)
    return { success: false, error: error.message }
  }
}
