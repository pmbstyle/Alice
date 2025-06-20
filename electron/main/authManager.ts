import { ipcMain, shell } from 'electron'
import http from 'node:http'
import { URL } from 'node:url'
import * as googleAuthManager from './googleAuthManager'
import { getMainWindow } from './windowManager'

const OAUTH_SERVER_PORT = 9876
let authServer: http.Server | null = null

export function registerAuthIPCHandlers(): void {
  ipcMain.handle('google-calendar:get-auth-url', async () => {
    try {
      await startAuthServer()
      const oAuth2Client = googleAuthManager.getOAuth2Client()
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/gmail.readonly',
        ],
      })
      console.log(
        '[IPC get-auth-url] Generated auth URL:',
        authUrl.substring(0, 100) + '...'
      )
      shell.openExternal(authUrl)
      return {
        success: true,
        message:
          'Please authorize in your browser. A browser window/tab has been opened.',
      }
    } catch (error: any) {
      console.error(
        '[IPC get-auth-url] Failed to start auth server or generate URL:',
        error
      )
      return {
        success: false,
        error: `Failed to initiate Google authentication: ${error.message}`,
      }
    }
  })

  ipcMain.handle('google-calendar:check-auth-status', async () => {
    const tokens = await googleAuthManager.loadTokens()
    return { success: true, isAuthenticated: !!tokens }
  })

  ipcMain.handle('google-calendar:disconnect', async () => {
    await googleAuthManager.clearTokens()
    stopAuthServer()
    return { success: true, message: 'Disconnected from Google Services.' }
  })
}

function closeAuthWindowAndNotify(
  success: boolean,
  messageOrError: string
): void {
  const win = getMainWindow()
  if (success) {
    console.log('[AuthServer] OAuth Success:', messageOrError)
    win?.webContents.send('google-auth-loopback-success', messageOrError)
  } else {
    console.error('[AuthServer] OAuth Error:', messageOrError)
    win?.webContents.send('google-auth-loopback-error', messageOrError)
  }
}

function startAuthServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (authServer && authServer.listening) {
      console.log('[AuthServer] Server already running.')
      resolve()
      return
    }

    authServer = http.createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Bad Request: URL is missing.')
          return
        }
        const requestUrl = new URL(
          req.url,
          `http://127.0.0.1:${OAUTH_SERVER_PORT}`
        )
        const pathName = requestUrl.pathname

        if (pathName === '/oauth2callback') {
          const code = requestUrl.searchParams.get('code')
          const error = requestUrl.searchParams.get('error')

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              `<h1>Authentication Failed</h1><p>${error}</p><p>You can close this window.</p>`
            )
            closeAuthWindowAndNotify(false, `OAuth error: ${error}`)
            stopAuthServer()
          } else if (code) {
            await googleAuthManager.getTokensFromCode(code)
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              '<h1>Authentication Successful!</h1><p>You can close this browser window/tab now and return to Alice.</p>'
            )
            closeAuthWindowAndNotify(
              true,
              'Successfully authenticated with Google.'
            )
            stopAuthServer()
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(
              '<h1>Authentication Failed</h1><p>No authorization code or error received on callback.</p><p>You can close this window.</p>'
            )
            closeAuthWindowAndNotify(
              false,
              'No authorization code or error received on callback.'
            )
            stopAuthServer()
          }
        } else {
          console.log(`[AuthServer] Ignoring request for path: ${pathName}`)
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not Found')
        }
      } catch (e: any) {
        console.error('[AuthServer] Error processing auth request:', e)
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          '<h1>Internal Server Error</h1><p>An error occurred while processing your authentication. Please try again.</p>'
        )
        closeAuthWindowAndNotify(
          false,
          `Server error during authentication: ${e.message}`
        )
        stopAuthServer()
      }
    })

    authServer.on('error', (e: NodeJS.ErrnoException) => {
      console.error('[AuthServer] Server error:', e)
      if (e.code === 'EADDRINUSE') {
        console.error(
          `[AuthServer] Port ${OAUTH_SERVER_PORT} is already in use. Cannot start auth server.`
        )
        reject(new Error(`Port ${OAUTH_SERVER_PORT} is already in use.`))
      } else {
        reject(e)
      }
      authServer = null
    })

    authServer.listen(OAUTH_SERVER_PORT, '127.0.0.1', () => {
      console.log(
        `[AuthServer] Listening on http://127.0.0.1:${OAUTH_SERVER_PORT}`
      )
      resolve()
    })
  })
}

export function stopAuthServer(): void {
  if (authServer) {
    authServer.close(() => {
      console.log('[AuthServer] Server stopped.')
      authServer = null
    })
  }
}
