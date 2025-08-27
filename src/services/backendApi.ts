/**
 * Go Backend API Service
 * Handles communication with the Go AI backend server
 */

import axios, { AxiosInstance, AxiosError } from 'axios'

// Response types matching the Go backend API
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

export interface HealthResponse {
  status: string
  services: {
    stt: boolean
    tts: boolean
    embeddings: boolean
  }
  version: string
  runtime: string
}

export interface TranscriptionResult {
  text: string
  confidence?: number
  duration?: number
}

export interface SynthesisResult {
  audio: number[] // Will be converted from base64
  format: string
  sample_rate: number
  duration?: number
}

export interface EmbeddingResult {
  embedding: number[]
  dimension: number
}

export interface EmbeddingsResult {
  embeddings: number[][]
  dimension: number
}

export interface Voice {
  id: string
  name: string
  language: string
  gender?: string
}

export interface SimilarityResult {
  similarity: number
}

export interface SearchResult {
  indices: number[]
  similarities: number[]
}

class BackendApiError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message)
    this.name = 'BackendApiError'
  }
}

export class BackendApi {
  private client: AxiosInstance
  private baseUrl = 'http://127.0.0.1:8765' // Default, will be updated

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl, // Set default URL immediately
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.code === 'ECONNREFUSED') {
          throw new BackendApiError('Backend server is not running', 503)
        }
        
        if (error.response) {
          const message = error.response.data?.error || 'Backend server error'
          throw new BackendApiError(message, error.response.status)
        }
        
        throw new BackendApiError(error.message || 'Network error')
      }
    )
  }

  /**
   * Initialize the API client with the backend URL
   */
  async initialize(): Promise<void> {
    try {
      // Check if we're in Electron environment
      if (typeof window !== 'undefined' && window.electronAPI) {
        // Get API URL from Electron main process
        const result = await window.electronAPI.invoke('backend:get-api-url')
        if (result?.success && result.data?.apiUrl) {
          this.baseUrl = result.data.apiUrl
          this.client.defaults.baseURL = this.baseUrl
          console.log('[BackendApi] Initialized with Electron URL:', this.baseUrl)
          return
        }
      }
      
      // Fallback to default URL
      console.log('[BackendApi] Using default URL:', this.baseUrl)
    } catch (error) {
      console.error('[BackendApi] Failed to get API URL, using default:', error)
      // Keep default URL
    }
  }

  /**
   * Check if the backend is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.get<ApiResponse<HealthResponse>>('/api/health')
      return response.data.success && response.data.data?.status === 'healthy'
    } catch (error) {
      return false
    }
  }

  /**
   * Get backend health information
   */
  async getHealth(): Promise<HealthResponse> {
    const response = await this.client.get<ApiResponse<HealthResponse>>('/api/health')
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Health check failed')
    }
    
    return response.data.data!
  }

  /**
   * Get service status
   */
  async getServiceStatus(): Promise<{ stt: boolean; tts: boolean; embeddings: boolean }> {
    const health = await this.getHealth()
    return health.services
  }

  // STT Methods

  /**
   * Transcribe audio data
   */
  async transcribeAudio(
    audioData: Float32Array, 
    sampleRate = 16000, 
    language?: string
  ): Promise<TranscriptionResult> {
    const response = await this.client.post<ApiResponse<TranscriptionResult>>('/api/stt/transcribe-audio', {
      audio_data: Array.from(audioData),
      sample_rate: sampleRate,
      language,
    })
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Transcription failed')
    }
    
    return response.data.data!
  }

  /**
   * Transcribe audio file
   */
  async transcribeFile(file: File, language?: string): Promise<TranscriptionResult> {
    const formData = new FormData()
    formData.append('file', file)
    if (language) {
      formData.append('language', language)
    }

    const response = await this.client.post<ApiResponse<TranscriptionResult>>(
      '/api/stt/transcribe-file',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'File transcription failed')
    }
    
    return response.data.data!
  }

  /**
   * Check if STT is ready
   */
  async isSTTReady(): Promise<boolean> {
    try {
      const response = await this.client.get<ApiResponse<{ ready: boolean }>>('/api/stt/ready')
      return response.data.success && response.data.data?.ready === true
    } catch (error) {
      return false
    }
  }

  /**
   * Get STT service information
   */
  async getSTTInfo(): Promise<any> {
    const response = await this.client.get<ApiResponse<any>>('/api/stt/info')
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Failed to get STT info')
    }
    
    return response.data.data
  }

  // TTS Methods

  /**
   * Synthesize speech from text
   */
  async synthesizeSpeech(text: string, voice?: string): Promise<SynthesisResult> {
    const response = await this.client.post<ApiResponse<SynthesisResult>>('/api/tts/synthesize', {
      text,
      voice,
    })
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Speech synthesis failed')
    }
    
    return response.data.data!
  }

  /**
   * Get available voices
   */
  async getAvailableVoices(): Promise<Voice[]> {
    const response = await this.client.get<ApiResponse<{ voices: Voice[] }>>('/api/tts/voices')
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Failed to get voices')
    }
    
    return response.data.data!.voices
  }

  /**
   * Check if TTS is ready
   */
  async isTTSReady(): Promise<boolean> {
    try {
      const response = await this.client.get<ApiResponse<{ ready: boolean }>>('/api/tts/ready')
      return response.data.success && response.data.data?.ready === true
    } catch (error) {
      return false
    }
  }

  /**
   * Get TTS service information
   */
  async getTTSInfo(): Promise<any> {
    const response = await this.client.get<ApiResponse<any>>('/api/tts/info')
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Failed to get TTS info')
    }
    
    return response.data.data
  }

  /**
   * Get current default voice
   */
  async getDefaultVoice(): Promise<string> {
    const response = await this.client.get<ApiResponse<{ default_voice: string }>>('/api/tts/default-voice')
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Failed to get default voice')
    }
    
    return response.data.data!.default_voice
  }

  /**
   * Set default voice
   */
  async setDefaultVoice(voice: string): Promise<void> {
    const response = await this.client.post<ApiResponse<any>>('/api/tts/default-voice', {
      voice,
    })
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Failed to set default voice')
    }
  }

  // Embeddings Methods

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.client.post<ApiResponse<EmbeddingResult>>('/api/embeddings/generate', {
      text,
    })
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Embedding generation failed')
    }
    
    return response.data.data!.embedding
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.client.post<ApiResponse<EmbeddingsResult>>('/api/embeddings/generate-batch', {
      texts,
    })
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Batch embedding generation failed')
    }
    
    return response.data.data!.embeddings
  }

  /**
   * Compute similarity between embeddings
   */
  async computeSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    const response = await this.client.post<ApiResponse<SimilarityResult>>('/api/embeddings/similarity', {
      embedding1,
      embedding2,
    })
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Similarity computation failed')
    }
    
    return response.data.data!.similarity
  }

  /**
   * Search for similar embeddings
   */
  async searchSimilar(
    queryEmbedding: number[], 
    candidateEmbeddings: number[][], 
    topK = 10
  ): Promise<{ indices: number[]; similarities: number[] }> {
    const response = await this.client.post<ApiResponse<SearchResult>>('/api/embeddings/search', {
      query_embedding: queryEmbedding,
      candidate_embeddings: candidateEmbeddings,
      top_k: topK,
    })
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Similarity search failed')
    }
    
    return response.data.data!
  }

  /**
   * Check if embeddings service is ready
   */
  async isEmbeddingsReady(): Promise<boolean> {
    try {
      const response = await this.client.get<ApiResponse<{ ready: boolean }>>('/api/embeddings/ready')
      return response.data.success && response.data.data?.ready === true
    } catch (error) {
      return false
    }
  }

  /**
   * Get embeddings service information
   */
  async getEmbeddingsInfo(): Promise<any> {
    const response = await this.client.get<ApiResponse<any>>('/api/embeddings/info')
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Failed to get embeddings info')
    }
    
    return response.data.data
  }

  // Model Management

  /**
   * Download a specific model
   */
  async downloadModel(service: 'stt' | 'tts' | 'embeddings'): Promise<{
    success: boolean
    message?: string
    error?: string
  }> {
    const response = await this.client.post<ApiResponse<any>>(`/api/models/download/${service}`, {}, {
      timeout: 300000 // 5 minutes for model downloads
    })
    
    return {
      success: response.data.success,
      message: response.data.data?.message,
      error: response.data.error
    }
  }

  /**
   * Get model status
   */
  async getModelStatus(): Promise<any> {
    const response = await this.client.get<ApiResponse<any>>('/api/models/status')
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Failed to get model status')
    }
    
    return response.data.data
  }

  /**
   * Get model download status
   */
  async getModelDownloadStatus(): Promise<{
    stt: { installed: boolean; downloading: boolean }
    tts: { installed: boolean; downloading: boolean }
    embeddings: { installed: boolean; downloading: boolean }
  }> {
    const response = await this.client.get<ApiResponse<any>>('/api/models/download-status')
    
    if (!response.data.success) {
      throw new BackendApiError(response.data.error || 'Failed to get model download status')
    }
    
    return response.data.data
  }
}

// Global instance
export const backendApi = new BackendApi()