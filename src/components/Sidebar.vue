<template>
  <div
    class="sidebar-wrapper h-[480px] ml-[380px] bg-gray-900/90 flex flex-col absolute z-10 rounded-r-lg"
    :class="{ open: openSidebar }"
  >
    <div
      class="sidebar-content w-full flex-1 overflow-y-auto flex flex-col"
      ref="sidebarContentElement"
    >
      <Chat @changeView="changeView" v-if="view === 'chat'"/>
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
  </div>
</template>

<script setup lang="ts">
import { defineEmits, ref, watch } from 'vue'
import Chat from './Chat.vue'
import { useGeneralStore } from '../stores/generalStore'
import { storeToRefs } from 'pinia'
const generalStore = useGeneralStore()

const sidebarContentElement = ref<null | HTMLElement>(null)
const view = ref('chat')
const emit = defineEmits(['processRequest'])
const { chatHistory, openSidebar, chatInput, storeMessage } = storeToRefs(generalStore)
const changeView = (newView: string) => {
  view.value = newView
  if (newView === 'chat') {
    scrollChat()
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
watch(chatHistory.value, () => {
  scrollChat()
})

const scrollChat = () => {
  if (!sidebarContentElement.value) return
  sidebarContentElement.value.scrollTo({
    top: sidebarContentElement.value.scrollHeight,
    behavior: 'smooth',
  })
}
</script>