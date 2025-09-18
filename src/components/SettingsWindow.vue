<template>
  <div class="settings-window h-screen w-full bg-gray-900 text-white flex flex-col overflow-hidden">
    <div class="title-bar flex items-center justify-between bg-gray-800 border-b border-gray-700 h-12 px-4 select-none"
         style="-webkit-app-region: drag;">
      <div class="flex items-center gap-3">
        <img :src="appIcon" alt="Alice" class="w-6 h-6" />
        <span class="font-medium text-sm">Alice Settings</span>
      </div>
      <button
        @click="closeWindow"
        class="close-button w-8 h-8 rounded-full bg-black/10 outline-none hover:bg-black/40 flex items-center justify-center transition-colors cursor-pointer"
        style="-webkit-app-region: no-drag;"
        aria-label="Close Settings Window"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M5.29289 5.29289C5.68342 4.90237 6.31658 4.90237 6.70711 5.29289L12 10.5858L17.2929 5.29289C17.6834 4.90237 18.3166 4.90237 18.7071 5.29289C19.0976 5.68342 19.0976 6.31658 18.7071 6.70711L13.4142 12L18.7071 17.2929C19.0976 17.6834 19.0976 18.3166 18.7071 18.7071C18.3166 19.0976 17.6834 19.0976 17.2929 18.7071L12 13.4142L6.70711 18.7071C6.31658 19.0976 5.68342 19.0976 5.29289 18.7071C4.90237 18.3166 4.90237 17.6834 5.29289 17.2929L10.5858 12L5.29289 6.70711C4.90237 6.31658 4.90237 5.68342 5.29289 5.29289Z" fill="#fff"/>
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-hidden">
      <Settings />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import Settings from './Settings.vue'

const appIcon = '/app_logo.png'

const closeWindow = async () => {
  if (window.ipcRenderer) {
    try {
      await window.ipcRenderer.invoke('settings-window:close')
    } catch (error) {
      console.error('Failed to close settings window:', error)
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', (e) => {
    if ((e.altKey && e.key === 'F4') || (e.ctrlKey && e.key === 'w')) {
      e.preventDefault()
      closeWindow()
    }
  })
})
</script>

<style scoped>
.settings-window {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
}

.title-bar {
  background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
}

.close-button:hover {
  transform: scale(1.05);
}

.close-button:active {
  transform: scale(0.95);
}
</style>