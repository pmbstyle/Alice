<template>
  <div
    class="sidebar-wrapper h-[480px] ml-[380px] bg-gray-900/90 flex flex-col absolute z-10 rounded-r-lg"
    :class="{ open: openSidebar }"
  >
    <div
      v-if="openSidebar"
      class="sidebar-header p-2 flex justify-end items-center border-b border-gray-700 shadow-sm"
    >
      <button
        v-if="view === 'settings'"
        @click="changeSidebarView('chat')"
        class="p-2 rounded-full hover:bg-gray-700/50 transition-colors focus:outline-none"
        title="Back to Chat"
      >
        <img :src="chatIcon" alt="Chat" class="w-5 h-5" />
      </button>
    </div>

    <div
      class="sidebar-content w-full flex-1 overflow-y-auto flex flex-col relative"
      ref="sidebarContentElement"
    >
      <Chat @processRequest="$emit('processRequest')" v-if="view === 'chat'" />
      <Settings
        v-else-if="view === 'settings'"
        @view-change="changeSidebarView"
      />

      <div
        v-if="
          view === 'chat' && !isConversationReady && !settingsStore.isLoading
        "
        class="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center text-center p-4 z-10"
      >
        <div class="text-white">
          <p class="text-lg font-semibold mb-2">
            {{
              generalStore.statusMessage.includes('Error:')
                ? 'Initialization Failed'
                : 'Initializing AI...'
            }}
          </p>
          <p
            v-if="generalStore.statusMessage.includes('Error:')"
            class="text-sm text-red-400"
          >
            {{ generalStore.statusMessage }}
          </p>
          <p v-else class="text-sm">Please wait...</p>

          <button
            v-if="generalStore.statusMessage.includes('Error:')"
            @click="retryInitialization"
            class="mt-4 btn btn-sm btn-warning"
          >
            Retry Init
          </button>
          <button
            v-if="generalStore.statusMessage.includes('Error:')"
            @click="changeSidebarView('settings')"
            class="mt-4 ml-2 btn btn-sm btn-info"
          >
            Check Settings
          </button>
        </div>
      </div>
    </div>

    <div class="w-full pt-4 pr-4" v-if="view === 'chat'">
      <div
        class="gradient-border-wrapper"
        :class="{ 'opacity-50': !isConversationReady }"
      >
        <input
          v-model="chatInput"
          @keyup.enter="chatInputHandle"
          class="input w-full rounded-lg bg-gray-800 border-0 text-white p-3 relative z-10 disabled:cursor-not-allowed"
          placeholder="Type your message here..."
          :disabled="!isConversationReady"
        />
      </div>
      <div
        class="w-full px-4 pt-1 pb-2 text-center text-xs text-gray-500"
        v-if="!isConversationReady"
      >
        {{
          generalStore.statusMessage.includes('Error:')
            ? 'AI Services unavailable. Check settings or retry.'
            : 'Initializing AI services...'
        }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineEmits, ref, watch, onMounted, nextTick, computed } from 'vue'
import Chat from './Chat.vue'
import Settings from './Settings.vue'
import { useGeneralStore } from '../stores/generalStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useConversationStore } from '../stores/openAIStore'
import { storeToRefs } from 'pinia'
import { chatIcon } from '../utils/assetsImport'

const generalStore = useGeneralStore()
const settingsStore = useSettingsStore()
const conversationStore = useConversationStore()

const sidebarContentElement = ref<null | HTMLElement>(null)
const view = ref<'chat' | 'settings'>('chat')
const emit = defineEmits(['processRequest'])

const {
  openSidebar,
  chatInput,
  storeMessage,
  forceOpenSettings,
  statusMessage,
} = storeToRefs(generalStore)
const { chatHistory } = storeToRefs(generalStore)
const { isInitialized: conversationIsInitialized } =
  storeToRefs(conversationStore)

const isConversationReady = computed(() => conversationIsInitialized.value)

const changeSidebarView = async (newView: 'chat' | 'settings') => {
  console.log(`Sidebar: Changing view to ${newView}`)
  view.value = newView
  if (newView === 'chat') {
    await nextTick(() => scrollChatToBottom())
  }
  if (newView === 'chat' && forceOpenSettings.value) {
    if (settingsStore.areEssentialSettingsProvided) {
      generalStore.forceOpenSettings = false
    }
  }
}

let debounceTimeout = ref<number | null>(null)
const debounceDelay = 300

const chatInputHandle = async () => {
  if (chatInput.value.length > 0 && isConversationReady.value) {
    if (debounceTimeout.value) clearTimeout(debounceTimeout.value)
    debounceTimeout.value = window.setTimeout(async () => {
      storeMessage.value = true
      await emit('processRequest', chatInput.value)
      chatInput.value = ''
    }, debounceDelay)
  } else if (!isConversationReady.value) {
    console.warn('Sidebar: Chat input submitted but conversation not ready.')
  }
}

watch(
  chatHistory,
  () => {
    if (view.value === 'chat') {
      scrollChatToBottom()
    }
  },
  { deep: true }
)

const scrollChatToBottom = () => {
  requestAnimationFrame(() => {
    if (!sidebarContentElement.value) return
    sidebarContentElement.value.scrollTo({
      top: sidebarContentElement.value.scrollHeight,
      behavior: 'smooth',
    })
  })
}

const retryInitialization = async () => {
  if (!conversationStore.isInitialized) {
    generalStore.statusMessage = 'Retrying initialization...'
    await conversationStore.initialize()
    if (
      !conversationStore.isInitialized &&
      !generalStore.statusMessage.includes('Error:')
    ) {
      generalStore.statusMessage =
        'Retry failed. Please check settings or console.'
    } else if (conversationStore.isInitialized) {
      generalStore.statusMessage = 'Stand by'
    }
  }
}

onMounted(async () => {
  console.log('[Sidebar] Mounted. Checking settings and AI store state.')
  if (!settingsStore.initialLoadAttempted) {
    console.log('[Sidebar] Settings not loaded yet, awaiting load...')
    await settingsStore.loadSettings()
  }

  if (
    settingsStore.areEssentialSettingsProvided &&
    !conversationStore.isInitialized
  ) {
    console.log(
      '[Sidebar] Settings seem OK, attempting ConversationStore init.'
    )
    await conversationStore.initialize()
  }

  const needsSettings =
    settingsStore.isProduction && !settingsStore.areEssentialSettingsProvided
  const needsInit =
    settingsStore.areEssentialSettingsProvided &&
    !conversationStore.isInitialized

  if (needsSettings) {
    console.log('[Sidebar] Needs essential settings.')
    if (!openSidebar.value) generalStore.openSidebar = true
    changeSidebarView('settings')
    generalStore.statusMessage = 'Configuration needed.'
    const targetWidth = openSidebar.value ? 1200 : 500
    const targetHeight = 500
    console.log(`Resizing window to: ${targetWidth}x${targetHeight}`)
    ;(window as any).electron.resize({
      width: targetWidth,
      height: targetHeight,
    })
  } else if (forceOpenSettings.value) {
    console.log('[Sidebar] Forced to settings view.')
    if (!openSidebar.value) generalStore.openSidebar = true
    changeSidebarView('settings')
  } else if (needsInit) {
    console.warn(
      '[Sidebar] AI Store not initialized, showing chat but input should be disabled.'
    )
    changeSidebarView('chat')
    if (!generalStore.statusMessage.includes('Error')) {
      generalStore.statusMessage = 'Initializing AI...'
    }
  } else if (conversationStore.isInitialized) {
    console.log('[Sidebar] Settings OK, AI initialized. Showing chat.')
    changeSidebarView('chat')
    if (
      generalStore.statusMessage === 'Initializing AI...' ||
      generalStore.statusMessage.includes('Error:')
    ) {
      generalStore.statusMessage = 'Stand by'
    }
  } else {
    console.log(
      '[Sidebar] Defaulting to chat view (Dev mode or unexpected state).'
    )
    changeSidebarView('chat')
  }
})

watch(forceOpenSettings, shouldForce => {
  if (shouldForce && view.value !== 'settings') {
    console.log('[Sidebar] forceOpenSettings triggered.')
    if (!openSidebar.value) generalStore.openSidebar = true
    changeSidebarView('settings')
  }
})

watch(
  () => settingsStore.successMessage,
  async newMessage => {
    if (
      newMessage &&
      settingsStore.areEssentialSettingsProvided &&
      view.value === 'settings'
    ) {
      if (conversationStore.isInitialized) {
        console.log(
          '[Sidebar] Settings saved successfully and AI initialized, switching to chat view soon.'
        )
        setTimeout(() => {
          if (settingsStore.successMessage) {
            changeSidebarView('chat')
            settingsStore.successMessage = null
          }
        }, 1500)
      } else {
        console.warn(
          '[Sidebar] Settings saved, but AI store initialization failed. Staying on settings page.'
        )
      }
    }
  }
)

watch(openSidebar, isOpen => {
  if (
    !isOpen &&
    view.value === 'settings' &&
    settingsStore.areEssentialSettingsProvided &&
    !forceOpenSettings.value
  ) {
    console.log(
      '[Sidebar] Closed while in settings view (and settings are OK), resetting view to chat for next open.'
    )
    changeSidebarView('chat')
  }
})
</script>
