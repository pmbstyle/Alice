import { EventEmitter } from 'eventemitter3'

const gemini_api_key: string = import.meta.env.VITE_GEMINI_API_KEY
const gemini_api_url: string = import.meta.env.VITE_GEMINI_WS_URL

// Helper functions
async function blobToJSON(blob: Blob): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (reader.result) {
        // Parse the FileReader result into JSON
        resolve(JSON.parse(reader.result))
      } else {
        reject('Failed to parse blob to JSON')
      }
    }

    // Initiate blob reading as text
    reader.readAsText(blob)
  })
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Decode base64 to binary string
  const binaryString = atob(base64)

  // Create buffer to hold binary data
  const bytes = new Uint8Array(binaryString.length)

  // Convert binary string to byte array
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return bytes.buffer
}

export class GeminiClient extends EventEmitter {
  name: string
  url: string
  ws: WebSocket | null
  config: any
  isConnecting: boolean
  connectionPromise: Promise<void> | null

  constructor(name?: string, url?: string, config?: any) {
    super()
    this.name = name || 'WebSocketClient'
    this.url = url || `${gemini_api_url}${gemini_api_key}`
    this.ws = null
    this.config = config
    this.isConnecting = false
    this.connectionPromise = null
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected, reusing connection');
      return this.connectionPromise as Promise<void>;
    }
  
    if (this.isConnecting) {
      console.log('WebSocket connection in progress, waiting...');
      return this.connectionPromise as Promise<void>;
    }
  
    console.info('🔗 Establishing WebSocket connection...');
    this.isConnecting = true;
    this.connectionPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
  
      // Send setup message upon successful connection
      ws.addEventListener('open', () => {
        console.info('🔗 Successfully connected to websocket');
        this.ws = ws;
        this.isConnecting = false;
  
        // Configure
        this.sendJSON({ setup: this.config });
        console.debug('Setup message with the following configuration was sent:', this.config);
        resolve();
      });
  
      // Handle connection errors
      ws.addEventListener('error', (error: Event) => {
        this.disconnect();
        const errorEvent = error as ErrorEvent;
        const reason = errorEvent.message || 'Unknown';
        const message = `Could not connect to "${this.url}. Reason: ${reason}"`;
        console.error(message, error);
        reject(error);
      });
  
      // Handle connection close
      ws.addEventListener('close', (event) => {
        console.log(`WebSocket closed with code: ${event.code}, reason: ${event.reason}`);
        this.isConnecting = false;
      });
  
      // Listen for incoming messages, expecting Blob data for binary streams
      ws.addEventListener('message', async (event: MessageEvent) => {
        console.log('Received WebSocket message:', event.data);
        if (event.data instanceof Blob) {
          this.receive(event.data);
        } else {
          console.error('Non-blob message received', event);
        }
      });
    });
  
    return this.connectionPromise;
  }  

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this.isConnecting = false
      this.connectionPromise = null
      console.info(`${this.name} successfully disconnected from websocket`)
    }
  }

  async receive(blob: Blob): Promise<void> {
    const response = await blobToJSON(blob)

    // Handle tool call responses
    if (response.toolCall) {
      console.debug(`${this.name} received tool call`, response)
      this.emit('tool_call', response.toolCall)
      return
    }

    // Handle tool call cancellation
    if (response.toolCallCancellation) {
      console.debug(
        `${this.name} received tool call cancellation`,
        response.toolCallCancellation
      )
      this.emit('tool_call_cancellation', response.toolCallCancellation)
      return
    }

    // Process server content (text/audio/interruptions)
    if (response.serverContent) {
      const { serverContent } = response
      if (serverContent.interrupted) {
        console.debug(`${this.name} is interrupted`)
        this.emit('interrupted')
        return
      }
      if (serverContent.turnComplete) {
        console.debug(`${this.name} has completed its turn`)
        this.emit('turn_complete')
      }
      if (serverContent.modelTurn) {
        // Split content into audio and non-audio parts
        let parts = serverContent.modelTurn.parts || []

        // Filter out audio parts from the model's content parts
        const audioParts = parts.filter(
          (p: any) =>
            p.inlineData &&
            (p.inlineData.mimeType.startsWith('audio/') ||
              p.inlineData.mimeType.includes('pcm'))
        )

        // Extract base64 encoded audio data from the audio parts
        const base64s = audioParts.map((p: any) => p.inlineData?.data)

        // Create an array of non-audio parts by excluding the audio parts
        const otherParts = parts.filter((p: any) => !audioParts.includes(p))

        // Process audio data
        base64s.forEach((b64: string | undefined) => {
          if (b64) {
            try {
              const data = base64ToArrayBuffer(b64)
              console.log('Received audio data, emitting audio event')
              this.emit('audio', data)
            } catch (error) {
              console.error('Error processing audio data:', error)
            }
          }
        })

        // Emit remaining content
        if (otherParts.length) {
          this.emit('content', { modelTurn: { parts: otherParts } })
          console.debug(`${this.name} sent text:`, otherParts)
        }
      }
    } else {
      console.debug(`${this.name} received unmatched message:`, response)
    }
  }

  formatAudioData(base64audio: string): string {
    // Ensure the base64 string doesn't have any data URL prefix
    if (base64audio.includes(',')) {
      base64audio = base64audio.split(',')[1]
    }
    return base64audio
  }

  async sendAudio(base64audio: string): Promise<void> {
    const formattedAudio = this.formatAudioData(base64audio)

    const data = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm',
            data: formattedAudio,
          },
        ],
      },
    }

    await this.sendJSON(data)
    // Reduce logging to prevent console spam
    // console.debug(`Sending audio chunk to ${this.name}.`)
  }

  async sendImage(base64image: string): Promise<void> {
    const data = {
      realtimeInput: {
        mediaChunks: [{ mimeType: 'image/jpeg', data: base64image }],
      },
    }
    await this.sendJSON(data)
    console.debug(
      `Image with a size of ${Math.round(base64image.length / 1024)} KB was sent to the ${this.name}.`
    )
  }

  async sendText(text: string, endOfTurn: boolean = true): Promise<void> {
    const formattedText = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: { text: text },
          },
        ],
        turnComplete: endOfTurn,
      },
    }
    await this.sendJSON(formattedText)
    console.debug(`Text sent to ${this.name}:`, text)
  }

  async sendToolResponse(toolResponse: {
    id: string
    output?: any
    error?: string
  }): Promise<void> {
    if (!toolResponse || !toolResponse.id) {
      throw new Error('Tool response must include an id')
    }

    const { output, id, error } = toolResponse
    let result = []

    if (error) {
      result = [
        {
          response: { error: error },
          id,
        },
      ]
    } else if (output === undefined) {
      throw new Error(
        'Tool response must include an output when no error is provided'
      )
    } else {
      result = [
        {
          response: { output: output },
          id,
        },
      ]
    }

    await this.sendJSON({ toolResponse: { functionResponses: result } })
    console.debug(`Tool response sent to ${this.name}:`, toolResponse)
  }

  async sendJSON(json: any): Promise<void> {
    if (!this.ws) {
      console.warn('WebSocket is not connected, attempting to reconnect...');
      try {
        await this.connect();
      } catch (error) {
        console.error(`Failed to reconnect WebSocket: ${error}`);
        throw new Error(`Failed to reconnect WebSocket: ${error}`);
      }
    }
  
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn(`WebSocket is not in OPEN state (state: ${this.ws?.readyState}), attempting to reconnect...`);
      try {
        await this.connect();
      } catch (error) {
        console.error(`Failed to reconnect WebSocket: ${error}`);
        throw new Error(`Failed to reconnect WebSocket: ${error}`);
      }
    }
  
    try {
      const jsonString = JSON.stringify(json);
      console.log(`Sending to WebSocket: ${jsonString.substring(0, 100)}${jsonString.length > 100 ? '...' : ''}`);
      this.ws?.send(jsonString);
    } catch (error) {
      console.error(`Failed to send message to WebSocket: ${error}`);
      this.disconnect(); // Clean up the broken connection
      throw new Error(`Failed to send message to ${this.name}: ${error}`);
    }
  }
}
