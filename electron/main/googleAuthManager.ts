import { google } from 'googleapis'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import dotenv from 'dotenv'

const projectRoot = app.isPackaged
  ? path.dirname(app.getPath('exe'))
  : app.getAppPath()
const envPath = path.resolve(projectRoot, '.env')

if (!app.isPackaged) {
  const result = dotenv.config({ path: envPath })
  if (result.error) {
    console.warn(
      `[GoogleAuthManager] dotenv dev: Could not load .env. Error: ${result.error.message}`
    )
  } else {
    console.log(`[GoogleAuthManager] dotenv dev: Loaded .env from ${envPath}`)
  }
}

const TOKEN_PATH = path.join(
  app.getPath('userData'),
  'google-calendar-tokens.json'
)

let GOOGLE_CLIENT_ID: string | undefined
let GOOGLE_CLIENT_SECRET: string | undefined

if (app.isPackaged) {
  const configPath = path.join(process.resourcesPath, 'app-config.json')
  console.log(
    '[GoogleAuthManager] Packaged app: Attempting to load config from:',
    configPath
  )
  try {
    if (fs.existsSync(configPath)) {
      const configFileContent = fs.readFileSync(configPath, 'utf-8')

      if (configFileContent.trim() === '') {
      } else {
        const config = JSON.parse(configFileContent)
        GOOGLE_CLIENT_ID = config.VITE_GOOGLE_CLIENT_ID
        GOOGLE_CLIENT_SECRET = config.VITE_GOOGLE_CLIENT_SECRET
      }
    } else {
      console.error(
        '[GoogleAuthManager] CRITICAL: app-config.json NOT FOUND at:',
        configPath
      )
    }
  } catch (error: any) {
    console.error(
      '[GoogleAuthManager] CRITICAL: Error loading or parsing app-config.json in packaged app:',
      error.message,
      error.stack
    )
  }
} else {
  // Development mode
  GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET = process.env.VITE_GOOGLE_CLIENT_SECRET
}

export const GOOGLE_REDIRECT_URI = 'http://127.0.0.1:9876/oauth2callback'

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  )
}

export async function loadTokens(): Promise<any | null> {
  try {
    const content = await fsPromises.readFile(TOKEN_PATH, 'utf-8')
    const tokens = JSON.parse(content)
    return tokens
  } catch (err) {
    console.log('No tokens found or error loading tokens:', err)
    return null
  }
}

export async function saveTokens(tokens: any): Promise<void> {
  await fsPromises.writeFile(TOKEN_PATH, JSON.stringify(tokens))
  console.log('Tokens saved to', TOKEN_PATH)
}

export async function clearTokens(): Promise<void> {
  try {
    await fsPromises.unlink(TOKEN_PATH)
    console.log('Tokens deleted.')
  } catch (err) {
    console.log('Error deleting tokens or tokens not found:', err)
  }
}

export async function getTokensFromCode(code: string): Promise<any> {
  const oAuth2Client = getOAuth2Client()
  const { tokens } = await oAuth2Client.getToken(code)
  await saveTokens(tokens)
  console.log('[GoogleAuthManager] Tokens obtained and saved successfully.')
  return tokens
}

export async function getAuthenticatedClient() {
  const oAuth2Client = getOAuth2Client()
  const tokens = await loadTokens()
  if (tokens) {
    oAuth2Client.setCredentials(tokens)
    if (oAuth2Client.isTokenExpiring && oAuth2Client.isTokenExpiring()) {
      try {
        console.log(
          '[GoogleAuthManager] Access token is expiring, attempting refresh.'
        )
        const { credentials } = await oAuth2Client.refreshAccessToken()
        if (credentials) {
          oAuth2Client.setCredentials(credentials)
          await saveTokens(credentials)
          console.log('[GoogleAuthManager] Access token refreshed.')
        } else {
          console.warn(
            '[GoogleAuthManager] Failed to refresh token, credentials were null'
          )
          await clearTokens()
          return null
        }
      } catch (refreshError) {
        console.error(
          '[GoogleAuthManager] Error refreshing access token:',
          refreshError
        )
        await clearTokens()
        return null
      }
    }
    return oAuth2Client
  }
  return null
}
