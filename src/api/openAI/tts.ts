import OpenAI from "openai"

const openai = new OpenAI({
    organization: "org-dxUPPlh6v3IBU1vruTWgEH0R",
    project: "proj_tQ4lbY7lC5J9IYOK2UI7t76h",
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