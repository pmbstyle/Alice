<template>
  <div
    class="sidebar-wrapper h-[480px] ml-[380px] bg-gray-900/90 flex flex-col absolute z-10 rounded-r-lg"
    :class="{ open: openSidebar }"
  >
    <div
      class="sidebar-content w-full flex-1 overflow-y-auto flex flex-col"
      ref="sidebarContentElement"
    >
      <Chat @changeView="changeView" v-if="view === 'chat'" />
      <Settings @changeView="changeView" v-if="view === 'settings'" />
    </div>
    <div class="w-full pt-4 pr-4" v-if="view === 'chat'">
      <div class="gradient-border-wrapper">
        <input
          v-model="chatInput"
          @keyup.enter="chatInputHandle"
          class="input w-full rounded-lg bg-gray-800 border-0 text-white p-3 relative z-10"
          placeholder="Type your message here..."
        />
      </div>
    </div>
    <div class="flex justify-between items-center mb-2">
      <button
        class="text-gray-400 hover:text-white transition-colors duration-300"
        @click="changeView('settings')"
      >
        Settings
      </button>
      <button
        class="text-gray-400 hover:text-white transition-colors duration-300"
        @click="changeView('chat')"
      >
        Chat
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineEmits, ref, watch, onMounted, nextTick } from 'vue'
import Chat from './Chat.vue'
import Settings from './Settings.vue'
import { useGeneralStore } from '../stores/generalStore'
import { useSettingsStore } from '../stores/settingsStore'
import { storeToRefs } from 'pinia'

const generalStore = useGeneralStore()
const settingsStore = useSettingsStore()

const sidebarContentElement = ref<null | HTMLElement>(null)
const view = ref('chat')
const emit = defineEmits(['processRequest'])
const { chatHistory, openSidebar, chatInput, storeMessage } =
  storeToRefs(generalStore)
const changeView = (newView: string) => {
  view.value = newView
  if (newView === 'chat') {
    scrollChatToBottom()
  }
}
let debounceTimeout = ref<number | null>(null)
const debounceDelay = 300

const chatInputHandle = async () => {
  if (chatInput.value.length > 0) {
    if (debounceTimeout.value) {
      clearTimeout(debounceTimeout.value)
    }
    debounceTimeout.value = window.setTimeout(async () => {
      storeMessage.value = true
      await emit('processRequest', chatInput.value)
      chatInput.value = ''
    }, debounceDelay)
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
  if (!sidebarContentElement.value) return
  sidebarContentElement.value.scrollTo({
    top: sidebarContentElement.value.scrollHeight,
    behavior: 'smooth',
  })
}

const changeSidebarView = async (newView: 'chat' | 'settings') => {
  view.value = newView
  if (newView === 'chat') {
    await nextTick(() => scrollChatToBottom())
  }
  generalStore.forceOpenSettings = false
}

onMounted(async () => {
  if (generalStore.forceOpenSettings) {
    changeSidebarView('settings')
  }
  if (!settingsStore.initialLoadAttempted) {
    await settingsStore.loadSettings()
  }

  if (!generalStore.openSidebar) generalStore.openSidebar = true
  changeSidebarView('settings')

  watch(
    () => settingsStore.successMessage,
    newMessage => {
      if (
        newMessage &&
        settingsStore.areEssentialSettingsProvided &&
        view.value === 'settings'
      ) {
        setTimeout(() => {
          if (settingsStore.successMessage) {
            changeSidebarView('chat')
            settingsStore.successMessage = null
          }
        }, 1500)
      }
    }
  )
})
</script>
