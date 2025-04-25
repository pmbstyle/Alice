<template>
  <div
    class="chat-wrapper h-[480px] ml-[380px] bg-gray-900/90 flex flex-col absolute z-10 rounded-r-lg"
    :class="{ open: openChat }"
  >
    <div
      id="chatHistory"
      class="messages-wrapper w-full overflow-y-auto"
      ref="chatHistoryElement"
    >
      <template v-if="chatHistoryDisplay.length">
        <div
          class="chat mb-2"
          v-for="(message, index) in chatHistoryDisplay"
          :key="index"
          :class="{
            'chat-start': message.role === 'assistant',
            'chat-end': message.role === 'user',
          }"
        >
          <div
            class="chat-bubble mb-2"
            :class="{ 'chat-bubble-primary': message.role === 'assistant' }"
            v-html="messageMarkdown(message.content[0].text.value)"
          ></div>
        </div>
      </template>
      <div class="mt-4" v-if="isInProgress">
        <span
          class="loading loading-ball loading-xs"
          v-for="n in 3"
          :key="n"
        ></span>
      </div>
    </div>
    <div class="w-full pt-4 pr-4">
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
import { computed, defineEmits, ref, watch } from 'vue'
import { useGeneralStore } from '../stores/generalStore'
import { messageMarkdown } from '../utils/markdown'
import { storeToRefs } from 'pinia'
const generalStore = useGeneralStore()

const chatHistoryElement = ref<null | HTMLElement>(null)

const emit = defineEmits(['processRequest'])
const { isInProgress, chatHistory, chatInput, openChat, storeMessage } =
  storeToRefs(generalStore)
const chatHistoryDisplay = computed(() => {
  let history = [...chatHistory.value]
  history = history.filter(
    item => !item.content[0].text.value.includes('[start screenshot]')
  )
  return history.reverse()
})

let debounceTimeout = ref<number | null>(null)
const debounceDelay = 300

watch(chatHistoryDisplay, () => {
  scrollChat()
})

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

const scrollChat = () => {
  if (!chatHistoryElement.value) return
  chatHistoryElement.value.scrollTo({
    top: chatHistoryElement.value.scrollHeight,
    behavior: 'smooth',
  })
}
</script>