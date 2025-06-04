import { toFile, type FileLike } from 'openai/uploads'
import { getOpenAIClient } from './responsesApi'

export const transcribeAudioOpenAI = async (
  audioBuffer: ArrayBuffer
): Promise<string> => {
  const openai = getOpenAIClient()

  try {
    const convertedFile: FileLike = await toFile(audioBuffer, 'audio.wav', {
      type: 'audio/wav',
    })

    const transcription = await openai.audio.transcriptions.create({
      file: convertedFile,
      model: 'gpt-4o-transcribe',
      response_format: 'json',
    })
    return transcription?.text || ''
  } catch (error: any) {
    console.error('OpenAI STT transcription error:', error)
    if (error.response && error.response.status === 401) {
      return 'Error: OpenAI STT failed (Unauthorized - Check API Key).'
    }
    return `Error: OpenAI STT failed (${error.message || 'Unknown error'}).`
  }
}
