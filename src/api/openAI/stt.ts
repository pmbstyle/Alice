import Groq from "groq-sdk"
import { toFile } from "openai/uploads"

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true
})
export const transcribeAudio = async (audioBuffer: Buffer): Promise<string> => {
  const convertedFile = await toFile(audioBuffer, 'audio.wav')
  const transcription = await groq.audio.transcriptions.create({
    file: convertedFile,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
  })
  return transcription?.text
}