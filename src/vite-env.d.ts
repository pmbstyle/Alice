/// <reference types="vite/client" />

import type {
  CustomToolsSnapshot,
  UploadCustomToolScriptResult,
  CustomToolExecutionResult,
  CustomToolDefinition,
} from '../types/customTools'
import type { CustomAvatarsSnapshot } from '../types/customAvatars'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ElectronAppSettings {
  VITE_OPENAI_API_KEY?: string
}

interface Window {
  ipcRenderer: import('electron').IpcRenderer
  electron: {
    resize: (dimensions: { width: number; height: number }) => void
    mini: (minimize: { minimize: boolean }) => void
    screenshot: () => void
    showOverlay: () => void
    getScreenshot: () => Promise<string | null>
    closeApp: () => void
  }
  settingsAPI: {
    loadSettings: () => Promise<ElectronAppSettings | null>
    saveSettings: (
      settings: any
    ) => Promise<{ success: boolean; error?: string }>
  }
  electronPaths: {
    getRendererDistPath: () => Promise<string>
  }
  httpAPI: {
    request: (args: {
      url: string
      method?: string
      headers?: Record<string, string>
      params?: Record<string, any>
      data?: any
      timeout?: number
    }) => Promise<{
      success: boolean
      data?: any
      status?: number
      statusText?: string
      headers?: any
      error?: string
      code?: string
      response?: {
        status: number
        statusText: string
        data: any
      }
    }>
  }
  pythonAPI: {
    // Python Backend Management
    start: () => Promise<{ success: boolean; error?: string }>
    stop: () => Promise<{ success: boolean; error?: string }>
    restart: () => Promise<{ success: boolean; error?: string }>
    health: () => Promise<{
      success: boolean
      healthy?: boolean
      error?: string
    }>
    serviceStatus: () => Promise<{
      success: boolean
      data?: any
      error?: string
    }>

    // STT (Speech-to-Text)
    stt: {
      transcribeAudio: (
        audioData: number[],
        sampleRate?: number,
        language?: string
      ) => Promise<{ success: boolean; data?: any; error?: string }>
      transcribeFile: (
        file: Blob,
        language?: string
      ) => Promise<{ success: boolean; data?: any; error?: string }>
      isReady: () => Promise<{
        success: boolean
        ready?: boolean
        error?: string
      }>
      getInfo: () => Promise<{ success: boolean; data?: any; error?: string }>
    }

    // TTS (Text-to-Speech)
    tts: {
      synthesize: (
        text: string,
        voice?: string
      ) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>
      getVoices: () => Promise<{ success: boolean; data?: any; error?: string }>
      test: () => Promise<{ success: boolean; data?: any; error?: string }>
      isReady: () => Promise<{
        success: boolean
        ready?: boolean
        error?: string
      }>
      getInfo: () => Promise<{ success: boolean; data?: any; error?: string }>
    }

    // Embeddings
    embeddings: {
      generate: (
        text: string
      ) => Promise<{
        success: boolean
        data?: { embedding: number[]; dimension: number }
        error?: string
      }>
      generateBatch: (
        texts: string[]
      ) => Promise<{
        success: boolean
        data?: { embeddings: number[][]; dimension: number; count: number }
        error?: string
      }>
      similarity: (
        embedding1: number[],
        embedding2: number[]
      ) => Promise<{
        success: boolean
        data?: { similarity: number }
        error?: string
      }>
      search: (
        queryEmbedding: number[],
        candidateEmbeddings: number[][],
        topK?: number
      ) => Promise<{ success: boolean; data?: any; error?: string }>
      test: () => Promise<{ success: boolean; data?: any; error?: string }>
      isReady: () => Promise<{
        success: boolean
        ready?: boolean
        error?: string
      }>
      getInfo: () => Promise<{ success: boolean; data?: any; error?: string }>
    }
  }
  customToolsAPI: {
    list: () => Promise<{ success: boolean; data?: CustomToolsSnapshot; error?: string }>
    refresh: () => Promise<{ success: boolean; data?: CustomToolsSnapshot; error?: string }>
    replaceJson: (
      rawJson: string
    ) => Promise<{ success: boolean; data?: CustomToolsSnapshot; error?: string }>
    uploadScript: (
      fileName: string,
      data: ArrayBuffer | Uint8Array
    ) => Promise<{ success: boolean; data?: UploadCustomToolScriptResult; error?: string }>
    upsert: (
      tool: Partial<CustomToolDefinition>
    ) => Promise<{ success: boolean; data?: CustomToolsSnapshot; error?: string }>
    toggle: (
      id: string,
      enabled: boolean
    ) => Promise<{ success: boolean; data?: CustomToolsSnapshot; error?: string }>
    delete: (id: string) => Promise<{ success: boolean; data?: CustomToolsSnapshot; error?: string }>
    execute: (
      name: string,
      args?: Record<string, any>
    ) => Promise<{ success: boolean; data?: CustomToolExecutionResult; error?: string }>
  }
  customAvatarsAPI: {
    list: () => Promise<{ success: boolean; data?: CustomAvatarsSnapshot; error?: string }>
    refresh: () => Promise<{ success: boolean; data?: CustomAvatarsSnapshot; error?: string }>
  }
}
