export const assistantConfig = {
  model: "models/gemini-2.0-flash-exp",
  temperature: 0.5,
  maxOutputTokens: 2048,
  voiceName: "Aoede",
  systemInstruction: "You are Alice, helpful personal assistant.", // Replace with your own system instruction
  safetySettings: {
    harassment: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED', // BLOCK_NONE, BLOCK_ONLY_HIGH, BLOCK_MEDIUM_AND_ABOVE, BLOCK_LOW_AND_ABOVE
    dangerousContent: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
    sexualityExplicit: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
    hateSpeech: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
    civicIntegrity: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
  }
}

export default assistantConfig