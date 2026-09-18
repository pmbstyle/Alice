import path from 'node:path'

const BUILT_IN_HTTP_BASE_URLS = [
  'https://api.openai.com',
  'https://openrouter.ai',
  'https://api.z.ai',
  'https://api.minimax.io',
  'https://api.deepseek.com',
  'https://global.api-route.com',
  'http://localhost:11434',
  'http://localhost:1234',
]

const CONFIGURED_HTTP_BASE_URL_KEYS = [
  'ollamaBaseUrl',
  'lmStudioBaseUrl',
  'zaiBaseUrl',
  'minimaxBaseUrl',
  'deepseekBaseUrl',
  'VITE_SEARXNG_URL',
] as const

function parseHttpUrl(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('HTTP bridge URL is invalid.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('HTTP bridge only supports http and https URLs.')
  }
  if (parsed.username || parsed.password) {
    throw new Error('HTTP bridge URLs must not contain credentials.')
  }

  return parsed
}

export function getAllowedHttpOrigins(
  settings: Record<string, unknown> | null | undefined
): Set<string> {
  const baseUrls = [...BUILT_IN_HTTP_BASE_URLS]

  for (const key of CONFIGURED_HTTP_BASE_URL_KEYS) {
    const value = settings?.[key]
    if (typeof value === 'string' && value.trim()) {
      baseUrls.push(value.trim())
    }
  }

  const origins = new Set<string>()
  for (const baseUrl of baseUrls) {
    try {
      origins.add(parseHttpUrl(baseUrl).origin)
    } catch {
      // Invalid user configuration is rejected when a request is attempted.
    }
  }
  return origins
}

export function getHttpOriginsRequiringApproval(
  previousSettings: Record<string, unknown> | null | undefined,
  nextSettings: Record<string, unknown> | null | undefined
): string[] {
  const previouslyApprovedOrigins = getAllowedHttpOrigins(previousSettings)
  const originsRequiringApproval = new Set<string>()

  for (const key of CONFIGURED_HTTP_BASE_URL_KEYS) {
    const value = nextSettings?.[key]
    if (typeof value !== 'string' || !value.trim()) {
      continue
    }

    const origin = parseHttpUrl(value.trim()).origin
    if (!previouslyApprovedOrigins.has(origin)) {
      originsRequiringApproval.add(origin)
    }
  }

  return [...originsRequiringApproval].sort()
}

export function validateHttpBridgeUrl(
  rawUrl: string,
  allowedOrigins: ReadonlySet<string>
): string {
  const parsed = parseHttpUrl(rawUrl)
  if (!allowedOrigins.has(parsed.origin)) {
    throw new Error(`HTTP bridge blocked unconfigured origin: ${parsed.origin}`)
  }
  return parsed.toString()
}

export function validateExternalOpenUrl(rawUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('External URL is invalid.')
  }

  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    throw new Error(
      'Only http, https, and mailto URLs can be opened externally.'
    )
  }
  if (parsed.username || parsed.password) {
    throw new Error('External URLs must not contain credentials.')
  }
  if (parsed.protocol === 'mailto:' && !parsed.pathname.trim()) {
    throw new Error('A mailto URL must include a recipient.')
  }

  return parsed.toString()
}

export function resolvePathWithinRoot(
  rootPath: string,
  requestedPath: string
): string {
  if (
    !requestedPath ||
    path.isAbsolute(requestedPath) ||
    requestedPath.includes('\0')
  ) {
    throw new Error('A non-empty relative path is required.')
  }

  const resolvedRoot = path.resolve(rootPath)
  const resolvedPath = path.resolve(resolvedRoot, requestedPath)
  const relativePath = path.relative(resolvedRoot, resolvedPath)

  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('Requested path is outside the allowed directory.')
  }

  return resolvedPath
}

export function isPathWithinRoot(
  rootPath: string,
  candidatePath: string
): boolean {
  const relativePath = path.relative(
    path.resolve(rootPath),
    path.resolve(candidatePath)
  )
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  )
}
