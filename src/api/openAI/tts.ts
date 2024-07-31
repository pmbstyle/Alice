import OpenAI from "openai"

const openai = new OpenAI({
  organization: import.meta.env.VITE_OPENAI_ORGANIZATION,
  project: import.meta.env.VITE_OPENAI_PROJECT,
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
})

export const tts = async (text: string) => {
  console.log('text', text)
  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
    response_format: "wav"
  })
  return mp3
}