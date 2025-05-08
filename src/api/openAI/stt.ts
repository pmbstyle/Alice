import Groq from 'groq-sdk'
import { toFile } from 'openai/uploads'
import { useSettingsStore } from '../../stores/settingsStore'

function getGroqClient() {
  const settings = useSettingsStore().config
  if (!settings.VITE_GROQ_API_KEY && useSettingsStore().isProduction) {
    console.error('Groq API Key is not configured in production.')
  }
  return new Groq({
    apiKey: settings.VITE_GROQ_API_KEY,
    dangerouslyAllowBrowser: true,
  })
}

export const transcribeAudio = async (audioBuffer: Buffer): Promise<string> => {
  const groq = getGroqClient()
  const convertedFile = await toFile(audioBuffer, 'audio.wav')
  const transcription = await groq.audio.transcriptions.create({
    file: convertedFile,
    model: 'whisper-large-v3-turbo',
    response_format: 'verbose_json',
  })
  return transcription?.text
}
