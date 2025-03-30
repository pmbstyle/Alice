import { ref, watch } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import { GeminiClient } from '../api/gemini/interface'
import { useGeneralStore } from './generalStore'

export const useGeminiStore = defineStore('gemini', () => {
  const {
    messages,
    chatHistory,
    statusMessage,
    updateVideo,
    isProcessingRequest,
    recognizedText,
    audioPlayer,
  } = storeToRefs(useGeneralStore())
  const generalStore = useGeneralStore()

  // Create Gemini client instance
  const geminiClient = ref<GeminiClient | null>(null)
  const isConnected = ref<boolean>(false)
  const isStreaming = ref<boolean>(false)
  const currentResponse = ref<string>('')
  const reconnectAttempts = ref<number>(0)
  const maxReconnectAttempts = 5
  const audioContext = ref<AudioContext | null>(null)
  const isAudioStreamActive = ref<boolean>(false)
  const audioChunksBuffer = ref<Float32Array[]>([])

  // Initialize the Gemini client with configuration
  // Initialize the Gemini client with configuration
  const initializeClient = () => {
    if (!geminiClient.value) {
      console.log('Initializing Gemini client')
      geminiClient.value = new GeminiClient('Alice', undefined, {
        model: 'models/gemini-2.0-flash-exp',
        generationConfig: {
          // <--- speechConfig goes back inside here
          temperature: 1.0,
          top_p: 0.95,
          top_k: 65,
          responseModalities: 'audio', // <--- Changed to string based on example
          speechConfig: {
            // <--- Nested inside generationConfig again
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Aoede', // Ensure this voice name is valid
              },
            },
          },
        }, // <--- generationConfig ends here
        tools: [], // Keep tools definition if needed, example has functionDeclarations: []
        systemInstruction: {
          parts: [
            {
              text: 'You are a helpful assistant named Alice. Keep your responses concise and conversational.',
            },
          ],
        },
        safetySettings: [
          // Match example structure if needed, though current seems okay
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          // Add other categories like CIVIC_INTEGRITY if required by the API
        ],
      })

      // Set up event listeners
      setupEventListeners()
    }
  }

  // Set up event listeners for the Gemini client
  const setupEventListeners = () => {
    if (!geminiClient.value) return

    console.log('Setting up Gemini event listeners')

    // Handle content (text) responses
    geminiClient.value.on('content', data => {
      console.log('Received content from Gemini:', data)
      if (data.modelTurn && data.modelTurn.parts) {
        const parts = data.modelTurn.parts
        parts.forEach((part: any) => {
          if (part.text) {
            currentResponse.value += part.text

            // Update the chat history
            if (
              chatHistory.value.length > 0 &&
              chatHistory.value[0].role === 'assistant'
            ) {
              chatHistory.value[0].content[0].text.value = currentResponse.value
            } else {
              chatHistory.value.unshift({
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: { value: currentResponse.value, annotations: [] },
                  },
                ],
              })
            }
          }
        })
      }
    })

    // Handle audio responses
    geminiClient.value.on('audio', audioData => {
      // audioData is the raw PCM ArrayBuffer
      console.log(
        'Received audio response from Gemini (raw PCM length):',
        audioData.byteLength
      )

      // Play the audio
      if (audioPlayer.value) {
        try {
          // --- Create WAV Blob ---
          const sampleRate = 16000 // Matches our input/config
          const numChannels = 1 // Mono
          const bitsPerSample = 16 // 16-bit PCM

          // 1. Create the WAV header
          const header = createWavHeader(
            audioData.byteLength,
            sampleRate,
            numChannels,
            bitsPerSample
          )

          // 2. Create a Blob containing the header AND the raw PCM data
          const wavBlob = new Blob([header, audioData], { type: 'audio/wav' })
          // --- End Create WAV Blob ---

          // 3. Create URL from the complete WAV Blob
          const url = URL.createObjectURL(wavBlob)

          // Set the audio source and play
          console.log('Playing WAV Blob URL:', url)
          audioPlayer.value.src = url
          audioPlayer.value.play().catch(err => {
            console.error('Error playing audio:', err)
            // Optional: Clean up the object URL if playback fails
            URL.revokeObjectURL(url)
          })

          // Optional: Clean up the object URL after playback finishes
          audioPlayer.value.onended = () => {
            console.log('Audio playback ended, revoking URL:', url)
            URL.revokeObjectURL(url)
            // Reset onended handler to avoid memory leaks if the element is reused
            if (audioPlayer.value) audioPlayer.value.onended = null
          }
          audioPlayer.value.onerror = e => {
            console.error('Audio element error:', e)
            URL.revokeObjectURL(url)
            if (audioPlayer.value) audioPlayer.value.onerror = null
          }

          // Update UI state
          statusMessage.value = 'Speaking...'
          updateVideo.value('SPEAKING')
        } catch (error) {
          console.error('Error processing/playing audio response:', error)
        }
      } else {
        console.warn('Audio player element not available.')
      }
    })

    // Handle turn completion
    geminiClient.value.on('turn_complete', () => {
      console.log('Turn complete event received')
      isStreaming.value = false
      statusMessage.value = 'Ready to chat'
      updateVideo.value('STAND_BY')
      isProcessingRequest.value = false
      currentResponse.value = ''
      isAudioStreamActive.value = false
    })

    // Handle interruptions
    geminiClient.value.on('interrupted', () => {
      console.log('Interrupted event received')
      isStreaming.value = false
      statusMessage.value = 'Ready to chat'
      updateVideo.value('STAND_BY')
      isProcessingRequest.value = false
      isAudioStreamActive.value = false
    })

    // Handle tool calls
    geminiClient.value.on('tool_call', toolCall => {
      console.log('Tool call received:', toolCall)
    })
  }

  // Connect to the Gemini WebSocket
  const connect = async () => {
    try {
      console.log('Connecting to Gemini...')
      initializeClient()
      if (geminiClient.value) {
        await geminiClient.value.connect()
        isConnected.value = true
        statusMessage.value = 'Connected to Gemini'
        reconnectAttempts.value = 0
        console.log('Successfully connected to Gemini')
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to connect to Gemini:', error)
      statusMessage.value = 'Connection failed'
      return false
    }
  }

  // Disconnect from the Gemini WebSocket
  const disconnect = () => {
    if (geminiClient.value) {
      console.log('Disconnecting from Gemini')
      geminiClient.value.disconnect()
      isConnected.value = false
      statusMessage.value = 'Disconnected from Gemini'
      isAudioStreamActive.value = false
    }
  }

  // Check connection and reconnect if needed
  const ensureConnection = async () => {
    if (
      !geminiClient.value ||
      !geminiClient.value.ws ||
      geminiClient.value.ws.readyState === WebSocket.CLOSING ||
      geminiClient.value.ws.readyState === WebSocket.CLOSED
    ) {
      isConnected.value = false

      if (reconnectAttempts.value < maxReconnectAttempts) {
        console.log(
          `WebSocket disconnected. Attempting to reconnect (${reconnectAttempts.value + 1}/${maxReconnectAttempts})...`
        )
        statusMessage.value = 'Reconnecting...'
        reconnectAttempts.value++

        // Cleanup old client if it exists
        if (geminiClient.value) {
          geminiClient.value.disconnect()
          geminiClient.value = null
        }

        // Create a new client and connect
        return await connect()
      } else {
        console.error('Max reconnection attempts reached')
        statusMessage.value = 'Connection failed after multiple attempts'
        return false
      }
    }

    return true
  }

  // Start audio streaming session
  const startAudioStream = async () => {
    const connected = await ensureConnection()
    if (!connected) return false

    isAudioStreamActive.value = true
    audioChunksBuffer.value = []

    // Signal the start of a conversation
    try {
      if (geminiClient.value) {
        // Send an empty text to start the conversation
        await geminiClient.value.sendText('', false)
        return true
      }
    } catch (error) {
      console.error('Failed to start audio stream:', error)
      isAudioStreamActive.value = false
      return false
    }

    return false
  }

  // End audio streaming session
  const endAudioStream = async () => {
    if (!isAudioStreamActive.value) return

    try {
      if (geminiClient.value) {
        // Signal end of turn
        await geminiClient.value.sendText('', true)
        isAudioStreamActive.value = false
      }
    } catch (error) {
      console.error('Failed to end audio stream:', error)
    }
  }

  // Stream audio to Gemini
  const streamAudio = async (audioData: Float32Array) => {
    if (!isAudioStreamActive.value) {
      const started = await startAudioStream()
      if (!started) return
    }

    const connected = await ensureConnection()
    if (!connected) return

    try {
      // Convert Float32Array to Int16Array (16-bit PCM)
      const pcmData = new Int16Array(audioData.length)
      for (let i = 0; i < audioData.length; i++) {
        // Convert float (-1 to 1) to int16 (-32768 to 32767)
        const s = Math.max(-1, Math.min(1, audioData[i]))
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }

      // Convert to base64
      const buffer = pcmData.buffer
      const blob = new Blob([buffer], { type: 'audio/pcm' })
      const reader = new FileReader()

      reader.onloadend = async () => {
        try {
          if (!isAudioStreamActive.value) return

          const base64data = reader.result as string
          const base64Audio = base64data.split(',')[1]

          if (geminiClient.value) {
            await geminiClient.value.sendAudio(base64Audio)
          }
        } catch (error) {
          console.error('Error sending audio chunk:', error)
          isAudioStreamActive.value = false
        }
      }

      reader.readAsDataURL(blob)
    } catch (error) {
      console.error('Failed to stream audio to Gemini:', error)
      isAudioStreamActive.value = false
    }
  }

  // Send a text message to Gemini
  const sendMessage = async (message: string) => {
    console.log(`Sending message to Gemini: "${message}"`)
    const connected = await ensureConnection()
    if (!connected) {
      console.error('Failed to ensure connection')
      return
    }

    try {
      // Add user message to chat history
      chatHistory.value.unshift({
        role: 'user',
        content: [{ type: 'text', text: { value: message, annotations: [] } }],
      })

      // Update status and UI
      statusMessage.value = 'Thinking...'
      updateVideo.value('PROCESSING')
      isProcessingRequest.value = true
      isStreaming.value = true
      currentResponse.value = ''

      // Add empty assistant message that will be filled with the response
      chatHistory.value.unshift({
        role: 'assistant',
        content: [{ type: 'text', text: { value: '', annotations: [] } }],
      })

      // Send the message to Gemini
      if (geminiClient.value) {
        console.log('Sending text to Gemini client')
        await geminiClient.value.sendText(message, true)
        console.log('Text sent successfully')
      }
    } catch (error) {
      console.error('Failed to send message to Gemini:', error)
      statusMessage.value = 'Failed to send message'
      isProcessingRequest.value = false
      isStreaming.value = false
    }
  }

  // Send an image to Gemini for analysis
  const sendImage = async (
    base64Image: string,
    prompt: string = 'Describe what you see in this image.'
  ) => {
    const connected = await ensureConnection()
    if (!connected) return

    try {
      // Update status and UI
      statusMessage.value = 'Analyzing image...'
      updateVideo.value('PROCESSING')
      isProcessingRequest.value = true
      isStreaming.value = true
      currentResponse.value = ''

      // Add user message with image reference to chat history
      chatHistory.value.unshift({
        role: 'user',
        content: [
          {
            type: 'text',
            text: { value: 'I sent you an image. ' + prompt, annotations: [] },
          },
        ],
      })

      // Add empty assistant message that will be filled with the response
      chatHistory.value.unshift({
        role: 'assistant',
        content: [{ type: 'text', text: { value: '', annotations: [] } }],
      })

      // Send the image to Gemini
      if (geminiClient.value) {
        await geminiClient.value.sendImage(base64Image)
        // Send the prompt text after the image
        await geminiClient.value.sendText(prompt, true)
      }
    } catch (error) {
      console.error('Failed to send image to Gemini:', error)
      statusMessage.value = 'Failed to analyze image'
      isProcessingRequest.value = false
      isStreaming.value = false
    }
  }

  const reateWavHeader = (
    dataLength: number,
    sampleRate: number,
    numChannels: number,
    bitsPerSample: number
  ): ArrayBuffer => {
    const buffer = new ArrayBuffer(44)
    const view = new DataView(buffer)

    // RIFF identifier
    writeString(view, 0, 'RIFF')
    // RIFF chunk size
    view.setUint32(4, 36 + dataLength, true)
    // RIFF type
    writeString(view, 8, 'WAVE')
    // format chunk identifier
    writeString(view, 12, 'fmt ')
    // format chunk length
    view.setUint32(16, 16, true)
    // sample format (raw)
    view.setUint16(20, 1, true) // 1 for PCM
    // channel count
    view.setUint16(22, numChannels, true)
    // sample rate
    view.setUint32(24, sampleRate, true)
    // byte rate (Sample Rate * Channels * BitsPerSample / 8)
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true)
    // block align (Channels * BitsPerSample / 8)
    view.setUint16(32, numChannels * (bitsPerSample / 8), true)
    // bits per sample
    view.setUint16(34, bitsPerSample, true)
    // data chunk identifier
    writeString(view, 36, 'data')
    // data chunk length
    view.setUint32(40, dataLength, true)

    return buffer
  }

  const writeString = (
    view: DataView,
    offset: number,
    string: string
  ): void => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  // Handle recognized text from speech
  watch(recognizedText, async newText => {
    if (newText && newText.trim() !== '' && !isProcessingRequest.value) {
      await sendMessage(newText)
      recognizedText.value = ''
    }
  })

  return {
    connect,
    disconnect,
    sendMessage,
    sendImage,
    streamAudio,
    startAudioStream,
    endAudioStream,
    isConnected,
    isStreaming,
    currentResponse,
    isAudioStreamActive,
  }
})
