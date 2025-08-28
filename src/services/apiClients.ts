import OpenAI from 'openai'
import Groq from 'groq-sdk'
import { useSettingsStore } from '../stores/settingsStore'
import { backendApi } from './backendApi'

let openaiClient: OpenAI | null = null
let openrouterClient: OpenAI | null = null
let groqClient: Groq | null = null
let ollamaClient: OpenAI | null = null
let lmStudioClient: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    initializeOpenAIClient()
  }
  if (!openaiClient) {
    throw new Error('OpenAI client could not be initialized')
  }
  return openaiClient
}

export function getOpenRouterClient(): OpenAI {
  if (!openrouterClient) {
    initializeOpenRouterClient()
  }
  if (!openrouterClient) {
    throw new Error('OpenRouter client could not be initialized')
  }
  return openrouterClient
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

export function getOllamaClient(): OpenAI {
  if (!ollamaClient) {
    initializeOllamaClient()
  }
  if (!ollamaClient) {
    throw new Error('Ollama client could not be initialized')
  }
  return ollamaClient
}

export function getLMStudioClient(): OpenAI {
  if (!lmStudioClient) {
    initializeLMStudioClient()
  }
  if (!lmStudioClient) {
    throw new Error('LM Studio client could not be initialized')
  }
  return lmStudioClient
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

function initializeOpenRouterClient(): void {
  const settings = useSettingsStore().config
  if (!settings.VITE_OPENROUTER_API_KEY) {
    console.error('OpenRouter API Key is not configured.')
    throw new Error('OpenRouter API Key is not configured.')
  }

  openrouterClient = new OpenAI({
    apiKey: settings.VITE_OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
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

function initializeOllamaClient(): void {
  const settings = useSettingsStore().config
  if (!settings.ollamaBaseUrl) {
    console.error('Ollama Base URL is not configured.')
    throw new Error('Ollama Base URL is not configured.')
  }

  ollamaClient = new OpenAI({
    apiKey: 'ollama',
    baseURL: `${settings.ollamaBaseUrl}/v1`,
    dangerouslyAllowBrowser: true,
    timeout: 20 * 1000,
    maxRetries: 1,
  })
}

function initializeLMStudioClient(): void {
  const settings = useSettingsStore().config
  if (!settings.lmStudioBaseUrl) {
    console.error('LM Studio Base URL is not configured.')
    throw new Error('LM Studio Base URL is not configured.')
  }

  lmStudioClient = new OpenAI({
    apiKey: 'lm-studio',
    baseURL: `${settings.lmStudioBaseUrl}/v1`,
    dangerouslyAllowBrowser: true,
    timeout: 20 * 1000,
    maxRetries: 1,
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
    initializeOpenRouterClient()
    console.log('OpenRouter client reinitialized successfully')
  } catch (error) {
    console.error('Failed to reinitialize OpenRouter client:', error)
    openrouterClient = null
  }

  try {
    initializeGroqClient()
    console.log('Groq client reinitialized successfully')
  } catch (error) {
    console.error('Failed to reinitialize Groq client:', error)
    groqClient = null
  }

  try {
    initializeOllamaClient()
    console.log('Ollama client reinitialized successfully')
  } catch (error) {
    console.error('Failed to reinitialize Ollama client:', error)
    ollamaClient = null
  }

  try {
    initializeLMStudioClient()
    console.log('LM Studio client reinitialized successfully')
  } catch (error) {
    console.error('Failed to reinitialize LM Studio client:', error)
    lmStudioClient = null
  }
}

export async function initializeClients(): Promise<void> {
  console.log('Initializing API clients...')
  reinitializeClients()
  
  // Initialize backend API and wait for it
  try {
    await backendApi.initialize()
    console.log('Backend API initialized successfully')
  } catch (error) {
    console.error('Failed to initialize Backend API:', error)
  }
}
