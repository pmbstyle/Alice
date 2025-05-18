import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

const SETTINGS_FILE_NAME = 'alice-settings.json'
const settingsFilePath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME)

export interface AppSettings {
  VITE_OPENAI_API_KEY?: string
  VITE_OPENAI_ORGANIZATION?: string
  VITE_OPENAI_PROJECT?: string
  VITE_OPENAI_ASSISTANT_ID?: string
  VITE_GROQ_API_KEY?: string
  VITE_TAVILY_API_KEY?: string
  VITE_OPENWEATHERMAP_API_KEY?: string
  VITE_JACKETT_API_KEY?: string
  VITE_JACKETT_URL?: string
  VITE_QB_URL?: string
  VITE_QB_USERNAME?: string
  VITE_QB_PASSWORD?: string
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const constjsonData = JSON.stringify(settings, null, 2)
    await fs.writeFile(settingsFilePath, constjsonData, 'utf-8')
    console.log('Settings saved to:', settingsFilePath)
  } catch (error) {
    console.error('Failed to save settings:', error)
    throw error
  }
}

export async function loadSettings(): Promise<AppSettings | null> {
  try {
    await fs.access(settingsFilePath)
    const jsonData = await fs.readFile(settingsFilePath, 'utf-8')
    const settings = JSON.parse(jsonData) as AppSettings
    console.log('Settings loaded from:', settingsFilePath)
    return settings
  } catch (error) {
    console.warn(
      'Failed to load settings or settings file not found:',
      error.message
    )
    return null
  }
}

export async function deleteSettingsFile(): Promise<void> {
  try {
    await fs.access(settingsFilePath)
    await fs.unlink(settingsFilePath)
    console.log('Settings file deleted:', settingsFilePath)
  } catch (error) {
    console.warn(
      'Failed to delete settings file (it may not exist):',
      error.message
    )
  }
}
