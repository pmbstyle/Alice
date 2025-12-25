<template>
  <template v-if="showOnboarding || showSettings || showOverlay">
    <Overlay v-if="showOverlay" />
    <OnboardingWizard v-if="showOnboarding" />
    <SettingsWindow v-if="showSettings" />
  </template>
  <Main v-else />
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
        <template v-if="!generalStore.isMinimized">Install & Restart</template>
        <template v-else>Install</template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import Main from './components/Main.vue'
import Overlay from './components/Overlay.vue'
import OnboardingWizard from './components/wizard/OnboardingWizard.vue'
import SettingsWindow from './components/SettingsWindow.vue'
import CommandApprovalDialog from './components/CommandApprovalDialog.vue'
import { useSettingsStore } from './stores/settingsStore'
import { useGeneralStore } from './stores/generalStore'
import { useConversationStore } from './stores/conversationStore'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const route = useRoute()
const settingsStore = useSettingsStore()
const generalStore = useGeneralStore()
const conversationStore = useConversationStore()

const showOverlay = computed(() => {
  return route.hash === '#overlay'
})

const showSettings = computed(() => {
  return route.hash === '#settings'
})

const showOnboarding = computed(() => {
  return route.hash !== '#settings' && route.hash !== '#overlay' && !settingsStore.settings.onboardingCompleted
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

const handleContextAction = async (data: any) => {
  try {
    const { prompt } = data

    await conversationStore.initialize()
    await conversationStore.chatWithContextAction(prompt)
  } catch (error) {
    // Handle context action error silently
  }
}

onMounted(async () => {
  await settingsStore.loadSettings()
  ;(window as any).requestCommandApproval = requestCommandApproval

  if (window.ipcRenderer) {
    window.ipcRenderer.on('update-downloaded', (event, info) => {
      updateInfo.value = info
      updateAvailable.value = true
    })

    window.ipcRenderer.on('context-action', (event, data) => {
      handleContextAction(data)
    })

    window.ipcRenderer.on('settings-changed', async (event, data) => {
      if (data.type === 'settings-saved' && data.success && data.validationComplete) {
        try {
          generalStore.statusMessage = 'Applying new settings...'
          const isProduction = await window.ipcRenderer.invoke('app:is-packaged')

          if (isProduction) {
            await window.ipcRenderer.invoke('app:restart')
          } else {
            window.location.reload()
          }
        } catch (error) {
          console.error('[App] Error handling settings change:', error)
          generalStore.statusMessage = 'Error: Failed to apply new settings'
        }
      } else if (data.type === 'settings-saved' && !data.success) {
        console.log('[App] Settings validation failed, not applying changes')
        generalStore.statusMessage = 'Settings validation failed'
      }
    })
  }
})

onUnmounted(() => {
  if (window.ipcRenderer) {
    window.ipcRenderer.removeAllListeners('update-downloaded')
    window.ipcRenderer.removeAllListeners('context-action')
    window.ipcRenderer.removeAllListeners('kokoro-tts-progress')
    window.ipcRenderer.removeAllListeners('local-embedding-progress')
    window.ipcRenderer.removeAllListeners('settings-changed')
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
