import { KokoroTTS } from 'kokoro-js'
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'

class KokoroTTSManager {
  private tts: KokoroTTS | null = null
  private isInitializing = false
  private modelId = 'onnx-community/Kokoro-82M-ONNX'
  private currentVoice: string = 'af_bella'
  private currentQuantization: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16' = 'q8'
  private cacheDir: string

  private availableVoices = [
    'af_heart',
    'af_alloy',
    'af_aoede',
    'af_bella',
    'af_jessica',
    'af_kore',
    'af_nicole',
    'af_nova',
    'af_river',
    'af_sarah',
    'af_sky',
    'bf_alice',
    'bf_emma',
    'bf_isabella',
    'bf_lily'
  ]

  constructor() {
    // Set up cache directory
    this.cacheDir = path.join(os.homedir(), '.cache', 'alice-electron', 'kokoro-tts')
    this.ensureCacheDir()
  }

  private ensureCacheDir(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true })
      }
    } catch (error: any) {
      console.error('[KokoroTTS] Failed to create cache directory:', error)
    }
  }

  async initialize(voice: string = 'af_bella', quantization: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16' = 'q8'): Promise<boolean> {
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return this.tts !== null
    }

    if (this.tts && this.currentVoice === voice && this.currentQuantization === quantization) {
      return true
    }

    this.isInitializing = true

    try {
      this.sendProgressUpdate('Downloading model...', 0)
      
      if (this.tts) {
        this.tts = null
      }

      this.tts = await KokoroTTS.from_pretrained(this.modelId, {
        dtype: quantization,
        cache_dir: this.cacheDir,
        progress_callback: (progress: any) => {
          if (progress.progress !== undefined) {
            const progressPercent = Math.round(progress.progress * 100)
            this.sendProgressUpdate(`Downloading model... ${progressPercent}%`, progressPercent)
          }
        }
      })

      this.currentVoice = voice
      this.currentQuantization = quantization
      
      this.sendProgressUpdate('Model ready!', 100)
      return true
    } catch (error: any) {
      console.error('[KokoroTTS] Failed to initialize model:', error)
      this.tts = null
      this.sendProgressUpdate(`Failed to initialize: ${error.message}`, -1)
      return false
    } finally {
      this.isInitializing = false
    }
  }

  private sendProgressUpdate(message: string, progress: number): void {
    const allWindows = BrowserWindow.getAllWindows()
    allWindows.forEach(window => {
      window.webContents.send('kokoro-tts-progress', { message, progress })
    })
  }

  async generateSpeech(text: string, voice?: string): Promise<Buffer | null> {
    if (!this.tts) {
      return null
    }

    try {
      const voiceToUse = voice || this.currentVoice
      
      this.sendProgressUpdate('Generating speech...', 0)
      
      return new Promise((resolve) => {
        setImmediate(async () => {
          try {
            const audio = await this.tts.generate(text, {
              voice: voiceToUse
            })

            this.sendProgressUpdate('Processing audio...', 50)

            if (typeof audio.toWav === 'function') {
              try {
                const wavData = audio.toWav()
                this.sendProgressUpdate('Audio ready!', 100)
                
                if (wavData instanceof ArrayBuffer) {
                  resolve(Buffer.from(wavData))
                } else if (wavData instanceof Uint8Array) {
                  resolve(Buffer.from(wavData))
                } else if (Buffer.isBuffer(wavData)) {
                  resolve(wavData)
                } else {
                  resolve(null)
                }
              } catch (err) {
                console.error('[KokoroTTS] Failed to call toWav():', err)
                resolve(null)
              }
            } else if (audio.data) {
              if (audio.data instanceof ArrayBuffer) {
                resolve(Buffer.from(audio.data))
              } else if (audio.data instanceof Uint8Array) {
                resolve(Buffer.from(audio.data))
              } else if (Buffer.isBuffer(audio.data)) {
                resolve(audio.data)
              } else if (Array.isArray(audio.data)) {
                resolve(Buffer.from(new Uint8Array(audio.data)))
              } else {
                resolve(null)
              }
            } else if (audio.audio) {
              if (audio.audio instanceof ArrayBuffer) {
                resolve(Buffer.from(audio.audio))
              } else if (audio.audio instanceof Uint8Array) {
                resolve(Buffer.from(audio.audio))
              } else {
                resolve(null)
              }
            } else {
              resolve(null)
            }
          } catch (error: any) {
            console.error('[KokoroTTS] Failed to generate speech:', error)
            resolve(null)
          }
        })
      })
    } catch (error: any) {
      console.error('[KokoroTTS] Failed to generate speech:', error)
      return null
    }
  }

  getAvailableVoices(): string[] {
    return [...this.availableVoices]
  }

  getCurrentVoice(): string {
    return this.currentVoice
  }

  isReady(): boolean {
    return this.tts !== null && !this.isInitializing
  }

  isInitializingModel(): boolean {
    return this.isInitializing
  }

  dispose(): void {
    this.tts = null
    this.isInitializing = false
  }

  getCacheInfo(): { cacheDir: string; cacheExists: boolean; cacheSize?: number } {
    const cacheExists = fs.existsSync(this.cacheDir)
    let cacheSize: number | undefined
    
    if (cacheExists) {
      try {
        const files = fs.readdirSync(this.cacheDir, { recursive: true })
        cacheSize = 0
        files.forEach(file => {
          const filePath = path.join(this.cacheDir, file.toString())
          try {
            const stats = fs.statSync(filePath)
            if (stats.isFile()) {
              cacheSize! += stats.size
            }
          } catch (error) {
            // Ignore individual file errors
          }
        })
      } catch (error) {
        console.error('[KokoroTTS] Failed to calculate cache size:', error)
      }
    }

    return {
      cacheDir: this.cacheDir,
      cacheExists,
      cacheSize
    }
  }

  clearCache(): boolean {
    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true })
        this.ensureCacheDir()
        return true
      }
      return true
    } catch (error: any) {
      console.error('[KokoroTTS] Failed to clear cache:', error)
      return false
    }
  }
}

// Export singleton instance
export const kokoroTTSManager = new KokoroTTSManager()