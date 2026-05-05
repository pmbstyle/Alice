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
  VITE_GOOGLE_API_KEY?: string
}

declare global {
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
    customToolsAPI?: AliceCustomToolsAPI
    customAvatarsAPI?: AliceCustomAvatarsAPI
  }
}

/*
  Typed API shapes kept here for reference while the renderer still exposes a
  broad IPC bridge. Once the bridge is narrowed, these can replace the `any`
  globals above.
*/
interface AliceCustomToolsAPI {
  list: () => Promise<{
    success: boolean
    data?: CustomToolsSnapshot
    error?: string
  }>
  refresh: () => Promise<{
    success: boolean
    data?: CustomToolsSnapshot
    error?: string
  }>
  replaceJson: (
    rawJson: string
  ) => Promise<{ success: boolean; data?: CustomToolsSnapshot; error?: string }>
  uploadScript: (
    fileName: string,
    data: ArrayBuffer | Uint8Array
  ) => Promise<{
    success: boolean
    data?: UploadCustomToolScriptResult
    error?: string
  }>
  upsert: (
    tool: Partial<CustomToolDefinition>
  ) => Promise<{ success: boolean; data?: CustomToolsSnapshot; error?: string }>
  toggle: (
    id: string,
    enabled: boolean
  ) => Promise<{ success: boolean; data?: CustomToolsSnapshot; error?: string }>
  delete: (
    id: string
  ) => Promise<{ success: boolean; data?: CustomToolsSnapshot; error?: string }>
  execute: (
    name: string,
    args?: Record<string, any>
  ) => Promise<{
    success: boolean
    data?: CustomToolExecutionResult
    error?: string
  }>
}

interface AliceCustomAvatarsAPI {
  list: () => Promise<{
    success: boolean
    data?: CustomAvatarsSnapshot
    error?: string
  }>
  refresh: () => Promise<{
    success: boolean
    data?: CustomAvatarsSnapshot
    error?: string
  }>
}
