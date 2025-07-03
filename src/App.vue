<template>
  <OnboardingWizard v-if="showOnboarding" />
  <Main v-else-if="!showOverlay" />
  <Overlay v-else />
  <CommandApprovalDialog
    :is-visible="commandApprovalVisible"
    :command="pendingCommand"
    :is-minified="generalStore.isMinimized"
    @approve="handleCommandApproval"
    @cancel="handleCommandCancel"
  />
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
import OnboardingWizard from './components/OnboardingWizard.vue'
import CommandApprovalDialog from './components/CommandApprovalDialog.vue'
import { useSettingsStore } from './stores/settingsStore'
import { useGeneralStore } from './stores/generalStore'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const route = useRoute()
const settingsStore = useSettingsStore()
const generalStore = useGeneralStore()

const showOverlay = computed(() => {
  return route.hash === '#overlay'
})

const showOnboarding = computed(() => {
  return !settingsStore.settings.onboardingCompleted
})

const updateAvailable = ref(false)
const updateInfo = ref<any>({})

const commandApprovalVisible = ref(false)
const pendingCommand = ref('')
const commandApprovalResolve = ref<(value: any) => void>()

const installUpdate = () => {
  window.ipcRenderer.send('restart-and-install-update')
}

const handleCommandApproval = (
  approvalType: 'once' | 'session' | 'forever'
) => {
  commandApprovalVisible.value = false
  const commandName = pendingCommand.value.split(' ')[0]

  if (approvalType === 'forever') {
    settingsStore.addApprovedCommand(commandName)
  } else if (approvalType === 'session') {
    settingsStore.addSessionApprovedCommand(commandName)
  }

  if (commandApprovalResolve.value) {
    commandApprovalResolve.value({ approved: true, approvalType })
  }
}

const handleCommandCancel = () => {
  commandApprovalVisible.value = false
  if (commandApprovalResolve.value) {
    commandApprovalResolve.value({ approved: false })
  }
}

const requestCommandApproval = (command: string): Promise<any> => {
  return new Promise(resolve => {
    pendingCommand.value = command
    commandApprovalVisible.value = true
    commandApprovalResolve.value = resolve
  })
}

onMounted(async () => {
  await settingsStore.loadSettings()

  ;(window as any).requestCommandApproval = requestCommandApproval

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
