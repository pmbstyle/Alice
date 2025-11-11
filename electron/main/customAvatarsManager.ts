import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import type {
  CustomAvatar,
  CustomAvatarsSnapshot,
  AvatarStateVideos,
} from '../../types/customAvatars'

const CUSTOMIZATION_DIR_NAME = 'user-customization'
const CUSTOM_AVATARS_DIR_NAME = 'custom-avatars'
const REQUIRED_FILES: Array<{ key: 'speaking' | 'thinking' | 'standby'; file: string }> = [
  { key: 'speaking', file: 'speaking.mp4' },
  { key: 'thinking', file: 'thinking.mp4' },
  { key: 'standby', file: 'standby.mp4' },
]
const AVATAR_PROTOCOL = 'alice-avatar://'

function getCustomizationRoot(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), CUSTOMIZATION_DIR_NAME)
  }
  return path.join(process.cwd(), CUSTOMIZATION_DIR_NAME)
}

function getAvatarsRoot(): string {
  return path.join(getCustomizationRoot(), CUSTOM_AVATARS_DIR_NAME)
}

async function ensureDirectoryExists(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function createAvatarId(folderName: string): string {
  const safeName = folderName.trim() || 'custom-avatar'
  return `custom:${safeName}`
}

function createAvatarProtocolUrl(folderName: string, fileName: string): string {
  const relativePath = path.join(folderName, fileName).replace(/\\/g, '/')
  return `${AVATAR_PROTOCOL}${encodeURIComponent(relativePath)}`
}

export async function loadCustomAvatarsFromDisk(): Promise<CustomAvatarsSnapshot> {
  const customizationRoot = getCustomizationRoot()
  const avatarsRoot = getAvatarsRoot()
  await ensureDirectoryExists(avatarsRoot)

  const entries = await fs.readdir(avatarsRoot, { withFileTypes: true })
  const avatars: CustomAvatar[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const folderName = entry.name
    const avatarFolderAbsolute = path.join(avatarsRoot, folderName)

    const stateVideos: AvatarStateVideos = {} as AvatarStateVideos
    let missingRequired = false
    for (const requirement of REQUIRED_FILES) {
      const candidatePath = path.join(avatarFolderAbsolute, requirement.file)
      if (!(await fileExists(candidatePath))) {
        missingRequired = true
        break
      }
      stateVideos[requirement.key] = createAvatarProtocolUrl(
        folderName,
        requirement.file
      )
    }

    if (missingRequired) {
      continue
    }

    const avatar: CustomAvatar = {
      id: createAvatarId(folderName),
      name: folderName,
      folderName,
      source: 'custom',
      stateVideos,
      previewVideo: stateVideos.standby,
    }
    avatars.push(avatar)
  }

  return {
    avatars,
    customizationRoot: avatarsRoot,
  }
}

export async function refreshCustomAvatars(): Promise<CustomAvatarsSnapshot> {
  return loadCustomAvatarsFromDisk()
}

export function getCustomAvatarsRootPath(): string {
  return getAvatarsRoot()
}
