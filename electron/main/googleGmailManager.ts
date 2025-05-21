import { google, gmail_v1 } from 'googleapis'

interface ListMessagesParams {
  authClient: any
  userId?: string
  maxResults?: number
  labelIds?: string[]
  q?: string
  includeSpamTrash?: boolean
}

interface GetMessageParams {
  authClient: any
  userId?: string
  id: string
  format?: 'full' | 'metadata' | 'minimal' | 'raw'
}

/**
 * Lists messages in the user's mailbox.
 */
export async function listMessages({
  authClient,
  userId = 'me',
  maxResults = 10,
  labelIds,
  q,
  includeSpamTrash = false,
}: ListMessagesParams): Promise<{
  success: boolean
  data?: gmail_v1.Schema$Message[]
  error?: string
}> {
  const gmail = google.gmail({ version: 'v1', auth: authClient })
  try {
    const res = await gmail.users.messages.list({
      userId,
      maxResults,
      labelIds,
      q,
      includeSpamTrash,
    })
    if (!res.data.messages || res.data.messages.length === 0) {
      return { success: true, data: [] }
    }
    return { success: true, data: res.data.messages }
  } catch (error: any) {
    console.error('Error listing Gmail messages:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Gets the specified message.
 */
export async function getMessage({
  authClient,
  userId = 'me',
  id,
  format = 'metadata',
}: GetMessageParams): Promise<{
  success: boolean
  data?: gmail_v1.Schema$Message & { decodedPlainTextBody?: string }
  error?: string
}> {
  const gmail = google.gmail({ version: 'v1', auth: authClient })
  try {
    const res = await gmail.users.messages.get({
      userId,
      id,
      format,
    })

    const messageData = res.data as gmail_v1.Schema$Message & {
      decodedPlainTextBody?: string
    }

    if (format === 'full' && messageData.payload) {
      const plainTextBody = extractPlainTextBody(messageData.payload)
      if (plainTextBody) {
        messageData.decodedPlainTextBody = plainTextBody
      }
    }

    return { success: true, data: messageData }
  } catch (error: any) {
    console.error(`Error getting Gmail message ${id}:`, error.message)
    return { success: false, error: error.message }
  }
}

function decodeBase64UrlToString(base64Url: string): string {
  if (!base64Url) return ''
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64').toString('utf-8')
}

function extractPlainTextBody(
  payload: gmail_v1.Schema$MessagePart | undefined
): string {
  if (!payload) return ''

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64UrlToString(payload.body.data)
  }

  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      const foundBody = extractPlainTextBody(part)
      if (foundBody) {
        return foundBody
      }
    }
  }
  return ''
}
