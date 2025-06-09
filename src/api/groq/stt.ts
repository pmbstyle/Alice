import Groq from 'groq-sdk'
import { toFile, type FileLike } from 'openai/uploads'
import { useSettingsStore } from '../../stores/settingsStore'

function getGroqClient(): Groq {
  const settingsStore = useSettingsStore()
  const settings = settingsStore.config

  if (settingsStore.isProduction && !settings.VITE_GROQ_API_KEY) {
    console.error('Groq API Key is not configured in production.')
    throw new Error('Groq API Key is not configured in production.')
  }
  if (!settings.VITE_GROQ_API_KEY) {
    console.warn('Groq API Key is not set. STT functionality will fail.')
  }
  return new Groq({
    apiKey: settings.VITE_GROQ_API_KEY,
    dangerouslyAllowBrowser: true,
  })
}

export const transcribeAudio = async (
  audioBuffer: ArrayBuffer
): Promise<string> => {
  const groq = getGroqClient()
  if (!useSettingsStore().config.VITE_GROQ_API_KEY) {
    console.error('Cannot transcribe audio: Groq API Key is missing.')
    return ''
  }

  try {
    const convertedFile: FileLike = await toFile(audioBuffer, 'audio.wav', {
      type: 'audio/wav',
    })

    const transcription = await groq.audio.transcriptions.create({
      file: convertedFile,
      model: 'whisper-large-v3',
      response_format: 'json',
    })
    return transcription?.text || ''
  } catch (error) {
    console.error('Groq transcription error:', error)
    return ''
  }
}
