<template>
  <div
    class="sidebar-wrapper h-[480px] ml-[380px] bg-gray-900/90 flex flex-col absolute z-10 rounded-r-lg"
    :class="{ open: openSidebar }"
  >
    <div
      class="sidebar-content w-full flex-1 overflow-y-auto flex flex-col relative"
      ref="sidebarContentElement"
    >
      <Chat
        @processRequest="$emit('processRequest')"
        v-if="sideBarView === 'chat'"
      />
      <Settings
        v-if="sideBarView === 'settings'"
        @view-change="changeSidebarView"
      />
      <MemoryManagerComponent v-if="sideBarView === 'memories'" />

      <div
        v-if="
          sideBarView === 'chat' &&
          !isConversationReady &&
          !settingsStore.isLoading
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

    <div class="w-full pt-4 pr-4" v-if="sideBarView === 'chat'">
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
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import Chat from './Chat.vue'
import Settings from './Settings.vue'
import MemoryManagerComponent from './MemoryManager.vue'
import { useGeneralStore } from '../stores/generalStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useConversationStore } from '../stores/openAIStore'
import { storeToRefs } from 'pinia'

const generalStore = useGeneralStore()
const settingsStore = useSettingsStore()
const conversationStore = useConversationStore()

const sidebarContentElement = ref<null | HTMLElement>(null)
const emit = defineEmits(['processRequest'])

const { openSidebar, chatInput, storeMessage, sideBarView } =
  storeToRefs(generalStore)
const { chatHistory } = storeToRefs(generalStore)
const { isInitialized: conversationIsInitialized } =
  storeToRefs(conversationStore)

const isConversationReady = computed(() => conversationIsInitialized.value)

const changeSidebarView = async (newView: 'chat' | 'settings') => {
  sideBarView.value = newView
  if (newView === 'chat') {
    await nextTick(() => scrollChatToBottom())
  }
}

let debounceTimeout = ref<number | null>(null)
const debounceDelay = 300

const chatInputHandle = async () => {
  const text = chatInput.value.trim()
  if (text.length > 0 && isConversationReady.value) {
    if (debounceTimeout.value) clearTimeout(debounceTimeout.value)

    debounceTimeout.value = window.setTimeout(async () => {
      chatInput.value = ''

      const userMessage: ChatMessage = {
        role: 'user',
        content: text,
        t,
      }
      generalStore.addMessageToHistory(userMessage)
      await conversationStore.chat()
    }, debounceDelay)
  } else if (!isConversationReady.value) {
    console.warn('Sidebar: Chat input submitted but conversation not ready.')
    generalStore.statusMessage = 'AI not ready. Please wait or check settings.'
  }
}

watch(
  chatHistory,
  () => {
    if (sideBarView.value === 'chat') {
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
    generalStore.statusMessage = 'Retrying init...'
    await conversationStore.initialize()
  }
}

const resizeWindow = async (open: boolean) => {
  const targetWidth = open ? 1200 : 500
  const targetHeight = 500
  if (window.electron?.resize) {
    window.electron.resize({
      width: targetWidth,
      height: targetHeight,
    })
  }
}

onMounted(async () => {
  if (!settingsStore.initialLoadAttempted) {
    console.log('[Sidebar] Settings not loaded yet, awaiting load...')
    await settingsStore.loadSettings()
  }

  const needsSettingsConfig =
    settingsStore.isProduction && !settingsStore.areEssentialSettingsProvided
  const canInitializeAI = settingsStore.areEssentialSettingsProvided
  const aiNeedsInitialization =
    canInitializeAI && !conversationStore.isInitialized

  if (needsSettingsConfig) {
    console.log('[Sidebar] Needs essential settings configuration.')
    generalStore.openSidebar = true
    resizeWindow(true)
    changeSidebarView('settings')
    generalStore.setAudioState('CONFIG')
  } else if (aiNeedsInitialization) {
    console.log('[Sidebar] Settings OK, attempting AI ConversationStore init.')
    generalStore.statusMessage = 'Initializing AI...'
    changeSidebarView('chat')
    if (!generalStore.openSidebar) {
      generalStore.openSidebar = true
      resizeWindow(true)
    }

    const initSuccess = await conversationStore.initialize()
    if (initSuccess) {
      console.log('[Sidebar] AI initialized successfully on mount.')
      if (
        generalStore.audioState === 'CONFIG' ||
        generalStore.statusMessage.startsWith('Initializing AI')
      ) {
        if (generalStore.isRecordingRequested) {
          generalStore.setAudioState('LISTENING')
        } else {
          generalStore.setAudioState('IDLE')
        }
      }
    } else {
      console.log('[Sidebar] AI initialization failed on mount.')
    }
  } else if (conversationStore.isInitialized) {
    console.log('[Sidebar] AI already initialized on mount.')
    changeSidebarView('chat')
    if (generalStore.audioState === 'CONFIG') {
      if (generalStore.isRecordingRequested) {
        generalStore.setAudioState('LISTENING')
      } else {
        generalStore.setAudioState('IDLE')
      }
    } else if (
      generalStore.audioState !== 'LISTENING' &&
      generalStore.audioState !== 'SPEAKING' &&
      generalStore.audioState !== 'PROCESSING_AUDIO' &&
      generalStore.audioState !== 'WAITING_FOR_RESPONSE' &&
      !generalStore.isRecordingRequested
    ) {
      generalStore.setAudioState('IDLE')
    }
  } else {
    console.warn(
      '[Sidebar] Unexpected state on mount. Defaulting to chat view.'
    )
    changeSidebarView('chat')
    if (generalStore.audioState === 'CONFIG') generalStore.setAudioState('IDLE')
  }
})

watch(
  () => settingsStore.successMessage,
  async newMessage => {
    if (newMessage && sideBarView.value === 'settings') {
      if (
        conversationStore.isInitialized &&
        settingsStore.areEssentialSettingsProvided
      ) {
        console.log(
          '[Sidebar] Settings saved & AI (re)initialized. Switching to chat view in 1.5s.'
        )
        settingsStore.successMessage = null

        setTimeout(() => {
          changeSidebarView('chat')
          if (generalStore.audioState === 'CONFIG') {
            if (generalStore.isRecordingRequested) {
              generalStore.setAudioState('LISTENING')
            } else {
              generalStore.setAudioState('IDLE')
            }
          }
        }, 1500)
      } else {
        console.warn(
          '[Sidebar] Settings saved (message: "',
          newMessage,
          '"), but AI store initialization failed. Staying on settings page.'
        )
      }
    }
  }
)
</script>
