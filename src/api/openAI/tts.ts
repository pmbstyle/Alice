import OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'

const getOpenAIClient = () => {
  const settings = useSettingsStore().config
  if (!settings.VITE_OPENAI_API_KEY) {
    console.error('OpenAI API Key is not configured in production.')
  }
  return new OpenAI({
    organization: settings.VITE_OPENAI_ORGANIZATION,
    project: settings.VITE_OPENAI_PROJECT,
    apiKey: settings.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  })
}

export const tts = async (text: string) => {
  const openai = getOpenAIClient()
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'nova',
    input: text,
    response_format: 'mp3',
  })
  return response
}
