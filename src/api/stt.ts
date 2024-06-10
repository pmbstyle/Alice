import OpenAI from 'openai';
import { toFile } from "openai/uploads"
const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
})

export const transcribeAudio = async (audioBuffer: Buffer): Promise<string> => {
    console.log('received audio buffer');
    const convertedFile = await toFile(audioBuffer, 'audio.wav');
    const response = await openai.audio.transcriptions.create({
        file: convertedFile,
        model: "whisper-1"
    })
    return response?.text
}
