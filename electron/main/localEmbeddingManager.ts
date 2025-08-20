import { pipeline, Pipeline } from '@huggingface/transformers'
import { BrowserWindow } from 'electron'
import path from 'path'
import os from 'os'

process.env.ONNX_WEB_WEBGPU_DISABLED = 'true'
process.env.ONNX_WEB_INIT_TIMEOUT = '30000'

class LocalEmbeddingManager {
  private embeddingPipeline: Pipeline | null = null
  private isInitializing = false
  private modelId = 'Xenova/all-MiniLM-L6-v2'
  private cacheDir: string

  constructor() {
    this.cacheDir = path.join(os.homedir(), '.cache', 'alice-electron', 'transformers')
    this.ensureCacheDir()
  }

  private ensureCacheDir(): void {
    try {
      const fs = require('fs')
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true })
      }
    } catch (error: any) {
      // Ignore cache directory creation errors
    }
  }

  async initialize(): Promise<boolean> {
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return this.embeddingPipeline !== null
    }

    if (this.embeddingPipeline) {
      return true
    }

    this.isInitializing = true

    try {
      this.sendProgressUpdate('Loading embedding model...', 0)

      process.env.TRANSFORMERS_CACHE = this.cacheDir
      process.env.HF_HOME = this.cacheDir
      process.env.ONNX_WEB_INIT_TIMEOUT = '30000'
      process.env.ONNX_WEB_WASM_ENABLE_SIMD = 'true'
      process.env.ONNX_WEB_WEBGPU_DISABLED = 'true'

      this.embeddingPipeline = await pipeline('feature-extraction', this.modelId, {
        device: 'cpu',
        dtype: 'fp32',
        execution_providers: ['wasm'],
        progress_callback: (progress: any) => {
          if (progress.progress !== undefined) {
            const progressPercent = Math.round(progress.progress * 100)
            this.sendProgressUpdate(`Loading embedding model... ${progressPercent}%`, progressPercent)
          }
        }
      })

      this.sendProgressUpdate('Embedding model ready!', 100)
      return true
    } catch (error: any) {
      this.embeddingPipeline = null
      this.sendProgressUpdate(`Failed to initialize: ${error.message}`, -1)
      return false
    } finally {
      this.isInitializing = false
    }
  }

  private sendProgressUpdate(message: string, progress: number): void {
    const allWindows = BrowserWindow.getAllWindows()
    allWindows.forEach(window => {
      window.webContents.send('local-embedding-progress', { message, progress })
    })
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.embeddingPipeline) {
      return null
    }

    try {
      if (!text.trim()) {
        return []
      }

      this.sendProgressUpdate('Generating embedding...', 0)

      return new Promise((resolve) => {
        setImmediate(async () => {
          try {
            const result = await this.embeddingPipeline!(text, { pooling: 'mean', normalize: true })
            
            this.sendProgressUpdate('Embedding ready!', 100)

            let embedding: number[] = []
            if (result && result.data) {
              embedding = Array.from(result.data)
            } else if (Array.isArray(result)) {
              embedding = result
            } else {
              resolve(null)
              return
            }

            const TARGET_DIMENSION = 1536
            if (embedding.length < TARGET_DIMENSION) {
              const padding = new Array(TARGET_DIMENSION - embedding.length).fill(0)
              embedding = [...embedding, ...padding]
            } else if (embedding.length > TARGET_DIMENSION) {
              embedding = embedding.slice(0, TARGET_DIMENSION)
            }

            resolve(embedding)
          } catch (error: any) {
            resolve(null)
          }
        })
      })
    } catch (error: any) {
      return null
    }
  }

  async generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    if (!this.embeddingPipeline) {
      return texts.map(() => null)
    }

    try {
      this.sendProgressUpdate(`Generating ${texts.length} embeddings...`, 0)

      const results: (number[] | null)[] = []
      for (let i = 0; i < texts.length; i++) {
        const progress = Math.round((i / texts.length) * 100)
        this.sendProgressUpdate(`Generating embedding ${i + 1}/${texts.length}...`, progress)
        
        const embedding = await this.generateEmbedding(texts[i])
        results.push(embedding)
      }

      this.sendProgressUpdate('All embeddings ready!', 100)
      return results
    } catch (error: any) {
      return texts.map(() => null)
    }
  }

  isReady(): boolean {
    return this.embeddingPipeline !== null && !this.isInitializing
  }

  isInitializingModel(): boolean {
    return this.isInitializing
  }

  async testEmbedding(): Promise<{ success: boolean; dimensions?: number; sampleValues?: number[]; error?: string }> {
    try {
      const testText = "This is a test embedding"
      const embedding = await this.generateEmbedding(testText)
      
      if (embedding && embedding.length > 0) {
        return {
          success: true,
          dimensions: embedding.length,
          sampleValues: embedding.slice(0, 5) // First 5 values for verification
        }
      } else {
        return {
          success: false,
          error: "Generated embedding is empty"
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  dispose(): void {
    this.embeddingPipeline = null
    this.isInitializing = false
  }

  getCacheInfo(): { cacheDir: string; cacheExists: boolean; cacheSize?: number } {
    const fs = require('fs')
    const cacheExists = fs.existsSync(this.cacheDir)
    let cacheSize: number | undefined

    if (cacheExists) {
      try {
        const files = fs.readdirSync(this.cacheDir, { recursive: true })
        cacheSize = 0
        files.forEach((file: any) => {
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
        // Ignore cache calculation errors
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
      const fs = require('fs')
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true })
        this.ensureCacheDir()
        return true
      }
      return true
    } catch (error: any) {
      return false
    }
  }
}

export const localEmbeddingManager = new LocalEmbeddingManager()