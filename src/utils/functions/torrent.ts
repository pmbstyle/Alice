import axios from 'axios'
import { useSettingsStore } from '../../stores/settingsStore'

interface FunctionResult {
  success: boolean
  data?: any
  error?: string
}

export interface TorrentSearchArgs {
  query: string
}

export interface AddTorrentArgs {
  magnet: string
}

function formatFileSize(bytes: string): string {
  const b = parseInt(bytes, 10)
  if (isNaN(b)) return 'unknown'
  const kb = b / 1024
  const mb = kb / 1024
  const gb = mb / 1024
  if (gb > 1) return `${gb.toFixed(1)} GB`
  if (mb > 1) return `${mb.toFixed(1)} MB`
  return `${kb.toFixed(1)} KB`
}

function getAttributeValue(item: Element, attrName: string): string {
  const attrs = item.getElementsByTagName('torznab:attr')
  for (const attr of Array.from(attrs)) {
    if (attr.getAttribute('name') === attrName) {
      return attr.getAttribute('value') ?? ''
    }
  }
  return ''
}

function getMagnetLink(item: Element): string {
  const guid = item.querySelector('guid')?.textContent
  if (guid?.startsWith('magnet:')) return guid

  const attrs = item.getElementsByTagName('torznab:attr')
  for (const attr of Array.from(attrs)) {
    if (attr.getAttribute('name') === 'magneturl') {
      return attr.getAttribute('value') ?? ''
    }
  }

  return ''
}

export async function search_torrents(
  args: TorrentSearchArgs
): Promise<FunctionResult> {
  const settings = useSettingsStore().config
  const JACKETT_API_KEY = settings.VITE_JACKETT_API_KEY
  const JACKETT_URL = settings.VITE_JACKETT_URL

  if (!JACKETT_API_KEY || !JACKETT_URL || !args.query) {
    return { success: false, error: 'Missing Jackett configuration or query.' }
  }

  try {
    const url = `${JACKETT_URL}/api/v2.0/indexers/all/results/torznab/api?apikey=${JACKETT_API_KEY}&t=search&q=${encodeURIComponent(
      args.query
    )}`
    const response = await axios.get(url, { responseType: 'text' })

    const parser = new DOMParser()
    const xml = parser.parseFromString(response.data, 'application/xml')
    const items = Array.from(xml.querySelectorAll('item'))

    const results = items
      .map(item => ({
        title: item.querySelector('title')?.textContent ?? 'No title',
        magnet: getMagnetLink(item),
        seeders: getAttributeValue(item, 'seeders'),
        size: formatFileSize(item.querySelector('size')?.textContent ?? ''),
      }))
      .filter(item => item.magnet.startsWith('magnet:'))
      .sort((a, b) => parseInt(b.seeders ?? '0') - parseInt(a.seeders ?? '0'))
      .slice(0, 8)

    console.log('Torrent search results:', results)

    return { success: true, data: results }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to parse XML' }
  }
}

export async function add_torrent_to_qb(
  args: AddTorrentArgs
): Promise<FunctionResult> {
  const settings = useSettingsStore().config
  const isDev = import.meta.env.DEV
  const QB_BASE_URL = isDev ? '' : settings.VITE_QB_URL
  const QB_USERNAME = settings.VITE_QB_USERNAME
  const QB_PASSWORD = settings.VITE_QB_PASSWORD

  if (!QB_USERNAME || !QB_PASSWORD) {
    return { success: false, error: 'qBittorrent credentials not configured.' }
  }
  if (!args.magnet) {
    return { success: false, error: 'Magnet link is missing.' }
  }

  console.log('Adding torrent to qBittorrent:', args.magnet)

  try {
    const loginRes = await axios.post(
      `${QB_BASE_URL}/api/v2/auth/login`,
      new URLSearchParams({ username: QB_USERNAME, password: QB_PASSWORD }),
      { withCredentials: true }
    )

    if (loginRes.data !== 'Ok.') {
      return { success: false, error: 'Login failed' }
    }

    await axios.post(
      `${QB_BASE_URL}/api/v2/torrents/add`,
      new URLSearchParams({ urls: args.magnet }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        withCredentials: true,
      }
    )

    return { success: true, data: 'Torrent added successfully.' }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to add torrent.' }
  }
}
