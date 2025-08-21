/**
 * Python Backend API Client
 * Communication layer between Electron and Python AI backend
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios'

// Response types
export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  services: {
    stt: boolean
    tts: boolean
    embeddings: boolean
  }
  version: string
}

export interface TranscriptionResponse {
  text: string
  language: string
  language_probability: number
  duration: number
  segments: Array<{
    start: number
    end: number
    text: string
    words: Array<{
      start: number
      end: number
      word: string
      probability: number
    }>
  }>
}

export interface EmbeddingResponse {
  embedding: number[]
  dimension: number
}

export interface EmbeddingsResponse {
  embeddings: number[][]
  dimension: number
  count: number
}

export interface SimilarityResponse {
  similarity: number
}

export interface ServiceInfo {
  status: string
  [key: string]: any
}

export class PythonApiClient {
  private client: AxiosInstance
  private baseUrl: string

  constructor(baseUrl: string = 'http://127.0.0.1:8765') {
    this.baseUrl = baseUrl
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Add request interceptor for error handling
    this.client.interceptors.request.use(
      (config) => config,
      (error) => {
        console.error('[PythonAPI] Request error:', error)
        return Promise.reject(error)
      }
    )

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('[PythonAPI] Response error:', error.response?.data || error.message)
        return Promise.reject(error)
      }
    )
  }

  // Health and status endpoints
  async checkHealth(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/api/health')
    return response.data
  }

  async getModelStatus(): Promise<Record<string, ServiceInfo>> {
    const response = await this.client.get<Record<string, ServiceInfo>>('/api/models/status')
    return response.data
  }

  // STT endpoints
  async transcribeAudio(audioData: Float32Array, sampleRate: number = 16000, language?: string): Promise<TranscriptionResponse> {
    const response = await this.client.post<TranscriptionResponse>('/api/stt/transcribe', {
      audio_data: Array.from(audioData),
      sample_rate: sampleRate,
      language,
    })
    return response.data
  }

  async transcribeFile(file: Blob, language?: string): Promise<TranscriptionResponse> {
    const formData = new FormData()
    formData.append('file', file)
    if (language) {
      formData.append('language', language)
    }

    const response = await this.client.post<TranscriptionResponse>('/api/stt/transcribe-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  }

  async isSTTReady(): Promise<boolean> {
    try {
      const response = await this.client.get<{ ready: boolean }>('/api/stt/ready')
      return response.data.ready
    } catch {
      return false
    }
  }

  async getSTTInfo(): Promise<ServiceInfo> {
    const response = await this.client.get<ServiceInfo>('/api/stt/info')
    return response.data
  }

  // TTS endpoints
  async synthesizeSpeech(text: string, voice?: string): Promise<ArrayBuffer> {
    const response = await this.client.post('/api/tts/synthesize', {
      text,
      voice,
    }, {
      responseType: 'arraybuffer',
      headers: {
        'Accept': 'audio/wav',
      },
    })
    return response.data
  }

  async getAvailableVoices(): Promise<Record<string, any>> {
    const response = await this.client.get<Record<string, any>>('/api/tts/voices')
    return response.data
  }

  async testTTS(): Promise<any> {
    const response = await this.client.post('/api/tts/test')
    return response.data
  }

  async isTTSReady(): Promise<boolean> {
    try {
      const response = await this.client.get<{ ready: boolean }>('/api/tts/ready')
      return response.data.ready
    } catch {
      return false
    }
  }

  async getTTSInfo(): Promise<ServiceInfo> {
    const response = await this.client.get<ServiceInfo>('/api/tts/info')
    return response.data
  }

  // Embeddings endpoints
  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    const response = await this.client.post<EmbeddingResponse>('/api/embeddings/generate', {
      text,
    })
    return response.data
  }

  async generateEmbeddings(texts: string[]): Promise<EmbeddingsResponse> {
    const response = await this.client.post<EmbeddingsResponse>('/api/embeddings/generate-batch', {
      texts,
    })
    return response.data
  }

  async computeSimilarity(embedding1: number[], embedding2: number[]): Promise<SimilarityResponse> {
    const response = await this.client.post<SimilarityResponse>('/api/embeddings/similarity', {
      embedding1,
      embedding2,
    })
    return response.data
  }

  async searchSimilar(queryEmbedding: number[], candidateEmbeddings: number[][], topK: number = 5): Promise<any> {
    const response = await this.client.post('/api/embeddings/search', {
      query_embedding: queryEmbedding,
      candidate_embeddings: candidateEmbeddings,
      top_k: topK,
    })
    return response.data
  }

  async testEmbeddings(): Promise<any> {
    const response = await this.client.post('/api/embeddings/test')
    return response.data
  }

  async isEmbeddingsReady(): Promise<boolean> {
    try {
      const response = await this.client.get<{ ready: boolean }>('/api/embeddings/ready')
      return response.data.ready
    } catch {
      return false
    }
  }

  async getEmbeddingsInfo(): Promise<ServiceInfo> {
    const response = await this.client.get<ServiceInfo>('/api/embeddings/info')
    return response.data
  }

  // Utility methods
  updateBaseUrl(newBaseUrl: string): void {
    this.baseUrl = newBaseUrl
    this.client.defaults.baseURL = newBaseUrl
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.get('/api/health', { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  // Helper method to check if all services are ready
  async areAllServicesReady(): Promise<boolean> {
    try {
      const [sttReady, ttsReady, embeddingsReady] = await Promise.all([
        this.isSTTReady(),
        this.isTTSReady(),
        this.isEmbeddingsReady(),
      ])
      return sttReady && ttsReady && embeddingsReady
    } catch {
      return false
    }
  }

  // Helper method to wait for services to be ready
  async waitForServices(timeout: number = 30000, interval: number = 1000): Promise<boolean> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      try {
        const health = await this.checkHealth()
        if (health.status === 'healthy') {
          return true
        }
      } catch {
        // Ignore errors and keep trying
      }
      
      await new Promise(resolve => setTimeout(resolve, interval))
    }
    
    return false
  }
}

// Global instance
export const pythonApi = new PythonApiClient()