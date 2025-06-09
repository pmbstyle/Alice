<template>
  <Main v-if="!showOverlay" />
  <Overlay v-else />
  <div
    role="alert"
    class="alert alert-vertical sm:alert-horizontal update-notification"
    v-if="updateAvailable"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      class="stroke-info h-6 w-6 shrink-0"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      ></path>
    </svg>
    <span>A new version {{ updateInfo.version }} of Alice is available!</span>
    <div class="flex items-center">
      <button class="btn btn-sm mr-2" @click="updateAvailable = false">
        Ignore
      </button>
      <button
        class="btn btn-sm btn-primary btn-active"
        @click="installUpdate()"
      >
        Install & Restart
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import Main from './components/Main.vue'
import Overlay from './components/Overlay.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const route = useRoute()
const showOverlay = computed(() => {
  return route.hash === '#overlay'
})

const updateAvailable = ref(false)
const updateInfo = ref<any>({})

const installUpdate = () => {
  window.ipcRenderer.send('restart-and-install-update')
}

onMounted(() => {
  if (window.ipcRenderer) {
    window.ipcRenderer.on('update-downloaded', (event, info) => {
      console.log('Update downloaded in renderer:', info)
      updateInfo.value = info
      updateAvailable.value = true
    })
  }
})

onUnmounted(() => {
  if (window.ipcRenderer) {
    window.ipcRenderer.removeAllListeners('update-downloaded')
  }
})
</script>

<style scoped lang="postcss">
.update-notification {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}
</style>
