import OpenAI from 'openai'
import Groq from 'groq-sdk'
import { useSettingsStore } from '../stores/settingsStore'

let openaiClient: OpenAI | null = null
let groqClient: Groq | null = null

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    initializeOpenAIClient()
  }
  if (!openaiClient) {
    throw new Error('OpenAI client could not be initialized')
  }
  return openaiClient
}

export function getGroqClient(): Groq {
  if (!groqClient) {
    initializeGroqClient()
  }
  if (!groqClient) {
    throw new Error('Groq client could not be initialized')
  }
  return groqClient
}

function initializeOpenAIClient(): void {
  const settings = useSettingsStore().config
  if (!settings.VITE_OPENAI_API_KEY) {
    console.error('OpenAI API Key is not configured.')
    throw new Error('OpenAI API Key is not configured.')
  }

  openaiClient = new OpenAI({
    apiKey: settings.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
    timeout: 20 * 1000,
    maxRetries: 1,
  })
}

function initializeGroqClient(): void {
  const settingsStore = useSettingsStore()
  const settings = settingsStore.config

  if (settingsStore.isProduction && !settings.VITE_GROQ_API_KEY) {
    console.error('Groq API Key is not configured in production.')
    throw new Error('Groq API Key is not configured in production.')
  }
  if (!settings.VITE_GROQ_API_KEY) {
    console.warn('Groq API Key is not set. STT functionality will fail.')
  }

  groqClient = new Groq({
    apiKey: settings.VITE_GROQ_API_KEY,
    dangerouslyAllowBrowser: true,
  })
}

export function reinitializeClients(): void {
  console.log('Reinitializing API clients with updated settings...')

  try {
    initializeOpenAIClient()
    console.log('OpenAI client reinitialized successfully')
  } catch (error) {
    console.error('Failed to reinitialize OpenAI client:', error)
    openaiClient = null
  }

  try {
    initializeGroqClient()
    console.log('Groq client reinitialized successfully')
  } catch (error) {
    console.error('Failed to reinitialize Groq client:', error)
    groqClient = null
  }
}

export function initializeClients(): void {
  console.log('Initializing API clients...')
  reinitializeClients()
}
