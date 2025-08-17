/// <reference types="vite/client" />

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
  transformersAPI: {
    getCachePath: () => Promise<string>
  }
}
