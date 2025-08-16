import { pipeline, Pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.allowRemoteModels = true
env.useBrowserCache = true

if (typeof window !== 'undefined') {
  env.backends.onnx.wasm.wasmPaths = window.location.origin + '/'
  env.backends.onnx.wasm.numThreads = 1
}

export interface TransformersModel {
  id: string
  name: string
  size: string
  description: string
  huggingfaceId: string
}

export const AVAILABLE_TRANSFORMERS_MODELS: TransformersModel[] = [
  {
    id: 'whisper-tiny.en',
    name: 'Whisper Tiny English',
    size: '~39 MB',
    description: 'Ultra-fast, English-only, good for voice commands',
    huggingfaceId: 'Xenova/whisper-tiny.en',
  },
  {
    id: 'whisper-base.en',
    name: 'Whisper Base English',
    size: '~74 MB',
    description: 'Recommended balance of speed and accuracy',
    huggingfaceId: 'Xenova/whisper-base.en',
  },
  {
    id: 'whisper-small.en',
    name: 'Whisper Small English',
    size: '~244 MB',
    description: 'Higher accuracy, slower processing',
    huggingfaceId: 'Xenova/whisper-small.en',
  },
  {
    id: 'whisper-base',
    name: 'Whisper Base Multilingual',
    size: '~74 MB',
    description: 'Supports multiple languages',
    huggingfaceId: 'Xenova/whisper-base',
  },
]

export interface ModelDownloadProgress {
  status: 'downloading' | 'loading' | 'ready' | 'error'
  progress: number
  loaded: number
  total: number
  message: string
}

export type ProgressCallback = (progress: ModelDownloadProgress) => void

class TransformersSTTService {
  private transcriber: Pipeline | null = null
  private currentModel: string | null = null
  private isInitializing = false
  private hasBeenUsed = false

  async initializeModel(
    modelId: string,
    device: 'webgpu' | 'wasm' = 'wasm',
    quantization: 'fp32' | 'fp16' | 'q8' | 'q4' = 'q8',
    onProgress?: ProgressCallback
  ): Promise<boolean> {
    if (this.isInitializing) {
      throw new Error('Model initialization already in progress')
    }

    this.isInitializing = true

    try {
      const model = AVAILABLE_TRANSFORMERS_MODELS.find(m => m.id === modelId)
      if (!model) {
        throw new Error(`Model ${modelId} not found`)
      }

      onProgress?.({
        status: 'downloading',
        progress: 0,
        loaded: 0,
        total: 0,
        message: `Preparing ${model.name}...`,
      })

      let finalDevice = device
      if (device === 'webgpu') {
        try {
          if (!navigator.gpu) {
            finalDevice = 'wasm'
          } else {
            const adapter = await navigator.gpu.requestAdapter()
            if (!adapter) {
              finalDevice = 'wasm'
            }
          }
        } catch (e) {
          finalDevice = 'wasm'
        }
      }

      await new Promise(resolve => setTimeout(resolve, 10))

      onProgress?.({
        status: 'downloading',
        progress: 15,
        loaded: 0,
        total: 0,
        message: `Configuring ${model.name}...`,
      })

      onProgress?.({
        status: 'downloading',
        progress: 25,
        loaded: 0,
        total: 0,
        message: `Downloading and compiling ${model.name}... This may take a moment.`,
      })
      this.transcriber = await pipeline(
        'automatic-speech-recognition',
        model.huggingfaceId,
        {
          device: finalDevice,
          dtype: quantization,
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading') {
              const percent =
                progress.loaded && progress.total
                  ? Math.round((progress.loaded / progress.total) * 60) + 25
                  : 50

              onProgress?.({
                status: 'downloading',
                progress: Math.min(percent, 85),
                loaded: progress.loaded || 0,
                total: progress.total || 0,
                message: `Downloading ${progress.file || 'model files'}...`,
              })
            } else if (progress.status === 'ready') {
              onProgress?.({
                status: 'loading',
                progress: 90,
                loaded: 0,
                total: 0,
                message: 'Compiling model for first use...',
              })
            }
          },
        }
      )

      await new Promise(resolve => setTimeout(resolve, 10))

      onProgress?.({
        status: 'loading',
        progress: 95,
        loaded: 0,
        total: 0,
        message: 'Testing model functionality...',
      })

      try {
        const testAudio = new Float32Array(8000).fill(0)
        await new Promise<void>((resolve, reject) => {
          setTimeout(async () => {
            try {
              await this.transcriber!(testAudio)
              resolve()
            } catch (testError) {
              resolve()
            }
          }, 10)
        })
      } catch (testError) {
        console.warn(
          '[TransformersSTT] Model test failed, but continuing:',
          testError
        )
      }

      this.currentModel = modelId
      this.hasBeenUsed = false

      onProgress?.({
        status: 'ready',
        progress: 100,
        loaded: 0,
        total: 0,
        message: `${model.name} is ready for use!`,
      })

      return true
    } catch (error: any) {
      onProgress?.({
        status: 'error',
        progress: 0,
        loaded: 0,
        total: 0,
        message: `Failed to load model: ${error.message}`,
      })

      this.transcriber = null
      this.currentModel = null
      return false
    } finally {
      this.isInitializing = false
    }
  }

  async transcribe(audioBuffer: ArrayBuffer): Promise<string> {
    if (!this.transcriber) {
      throw new Error(
        'Transcriber not initialized. Please download a model first.'
      )
    }

    try {
      let audioData = this.parseWAVToFloat32(audioBuffer)
      const isFirstUse = !this.hasBeenUsed

      if (audioData.length < 1600) {
        return ''
      }

      if (audioData.length > 480000) {
        audioData = audioData.slice(0, 480000)
      }

      await new Promise(resolve => setTimeout(resolve, isFirstUse ? 50 : 10))

      const result = await this.transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
      })

      this.hasBeenUsed = true
      await new Promise(resolve => setTimeout(resolve, 5))

      const transcription = result.text?.trim() || ''

      if (transcription.length > 100 && /^(.)\1{50,}/.test(transcription)) {
        return ''
      }

      return transcription
    } catch (error: any) {
      console.error('[TransformersSTT] Transcription failed:', error)
      throw new Error(`Transcription failed: ${error.message}`)
    }
  }

  private parseWAVToFloat32(arrayBuffer: ArrayBuffer): Float32Array {
    try {
      const dataView = new DataView(arrayBuffer)

      const riffHeader = String.fromCharCode(
        dataView.getUint8(0),
        dataView.getUint8(1),
        dataView.getUint8(2),
        dataView.getUint8(3)
      )

      if (riffHeader !== 'RIFF') {
        throw new Error('Not a valid WAV file - missing RIFF header')
      }

      let sampleRate = 16000
      let bitsPerSample = 16
      let channels = 1

      let offset = 12
      while (offset < arrayBuffer.byteLength) {
        const chunkId = String.fromCharCode(
          dataView.getUint8(offset),
          dataView.getUint8(offset + 1),
          dataView.getUint8(offset + 2),
          dataView.getUint8(offset + 3)
        )

        if (chunkId === 'fmt ') {
          sampleRate = dataView.getUint32(offset + 12, true)
          bitsPerSample = dataView.getUint16(offset + 22, true)
          channels = dataView.getUint16(offset + 10, true)
          break
        }

        const chunkSize = dataView.getUint32(offset + 4, true)
        offset += 8 + chunkSize
      }

      offset = 12
      while (offset < arrayBuffer.byteLength) {
        const chunkId = String.fromCharCode(
          dataView.getUint8(offset),
          dataView.getUint8(offset + 1),
          dataView.getUint8(offset + 2),
          dataView.getUint8(offset + 3)
        )

        if (chunkId === 'data') {
          const chunkSize = dataView.getUint32(offset + 4, true)
          const audioDataOffset = offset + 8

          const bytesPerSample = bitsPerSample / 8
          const numSamples = Math.floor(chunkSize / bytesPerSample / channels)
          const samples = new Float32Array(numSamples)

          for (let i = 0; i < numSamples; i++) {
            let sample = 0

            if (bitsPerSample === 16) {
              sample =
                dataView.getInt16(
                  audioDataOffset + i * bytesPerSample * channels,
                  true
                ) / 32768.0
            } else if (bitsPerSample === 8) {
              sample =
                (dataView.getUint8(
                  audioDataOffset + i * bytesPerSample * channels
                ) -
                  128) /
                128.0
            } else if (bitsPerSample === 32) {
              sample = dataView.getFloat32(
                audioDataOffset + i * bytesPerSample * channels,
                true
              )
            }

            samples[i] = Math.max(-1, Math.min(1, sample))
          }

          if (sampleRate !== 16000) {
            const resampleRatio = 16000 / sampleRate
            const resampledLength = Math.floor(samples.length * resampleRatio)
            const resampled = new Float32Array(resampledLength)

            for (let i = 0; i < resampledLength; i++) {
              const sourceIndex = i / resampleRatio
              const sourceIndexFloor = Math.floor(sourceIndex)
              const sourceIndexCeil = Math.min(
                sourceIndexFloor + 1,
                samples.length - 1
              )
              const fraction = sourceIndex - sourceIndexFloor

              resampled[i] =
                samples[sourceIndexFloor] * (1 - fraction) +
                samples[sourceIndexCeil] * fraction
            }

            return resampled
          }

          return samples
        }

        const chunkSize = dataView.getUint32(offset + 4, true)
        offset += 8 + chunkSize
      }

      throw new Error('No data chunk found in WAV file')
    } catch (error: any) {
      const samples = new Float32Array(arrayBuffer.byteLength / 2)
      const dataView = new DataView(arrayBuffer)
      for (let i = 0; i < samples.length; i++) {
        samples[i] = dataView.getInt16(i * 2, true) / 32768.0
      }
      return samples
    }
  }

  getCurrentModel(): string | null {
    return this.currentModel
  }

  isReady(): boolean {
    return this.transcriber !== null && !this.isInitializing
  }

  isFirstUse(): boolean {
    return this.isReady() && !this.hasBeenUsed
  }

  dispose(): void {
    this.transcriber = null
    this.currentModel = null
    this.isInitializing = false
    this.hasBeenUsed = false
  }
}

export const transformersSTTService = new TransformersSTTService()
