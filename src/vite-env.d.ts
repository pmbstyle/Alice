/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ElectronAppSettings {
  // Define structure matching AppSettings in settingsManager.ts
  VITE_OPENAI_API_KEY?: string;
}

interface Window {
ipcRenderer: import('electron').IpcRenderer;
electron: {
  resize: (dimensions: { width: number; height: number }) => void;
  mini: (minimize: { minimize: boolean }) => void;
  screenshot: () => void;
  showOverlay: () => void;
  getScreenshot: () => Promise<string | null>;
  closeApp: () => void;
};
settingsAPI: {
  loadSettings: () => Promise<ElectronAppSettings | null>;
  saveSettings: (settings: ElectronAppSettings) => Promise<{ success: boolean; error?: string }>;
};
}