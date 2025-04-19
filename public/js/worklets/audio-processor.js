/**
 * AudioProcessingWorklet handles real-time audio processing in a dedicated thread.
 * It converts incoming Float32 audio samples to Int16 format for efficient network transmission
 * and processing by speech recognition systems.
 */
class AudioProcessingWorklet extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Int16Array(2048)
    this.bufferWriteIndex = 0
    this.sampleRate = 16000
  }

  /**
   * Processes incoming audio data in chunks
   * @param {Array<Float32Array[]>} inputs - Array of input channels, each containing Float32 audio samples
   * @returns {boolean} - Return true to keep the processor alive
   */
  process(inputs) {
    if (inputs[0].length) {
      const channel0 = inputs[0][0]
      this.processChunk(channel0)
    }
    return true
  }

  /**
   * Sends the accumulated audio buffer to the main thread and resets the write position
   * Uses SharedArrayBuffer for zero-copy transfer of audio data
   */
  sendAndClearBuffer() {
    this.port.postMessage({
      event: 'chunk',
      data: {
        int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer,
      },
    })
    this.bufferWriteIndex = 0
  }

  /**
   * Converts Float32 audio samples to Int16 format and accumulates them in the buffer
   * Float32 range [-1.0, 1.0] is mapped to Int16 range [-32768, 32767]
   * @param {Float32Array} float32Array - Input audio samples in Float32 format
   */
  processChunk(float32Array) {
    try {
      for (let i = 0; i < float32Array.length; i++) {
        const int16Value = Math.max(
          -32768,
          Math.min(32767, Math.floor(float32Array[i] * 32768))
        )
        this.buffer[this.bufferWriteIndex++] = int16Value

        if (this.bufferWriteIndex >= this.buffer.length) {
          this.sendAndClearBuffer()
        }
      }

      if (this.bufferWriteIndex >= this.buffer.length) {
        this.sendAndClearBuffer()
      }
    } catch (error) {
      this.port.postMessage({
        event: 'error',
        error: {
          message: error.message,
          stack: error.stack,
        },
      })
    }
  }
}

registerProcessor('audio-recorder-worklet', AudioProcessingWorklet)
