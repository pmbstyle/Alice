<template>
  <div
    class="chat-wrapper h-[480px] ml-[380px] bg-gray-900 bg-opacity-90 flex flex-col absolute z-10 rounded-r-lg"
    :class="{ open: openChat }"
  >
    <div id="chatHistory" class="messages-wrapper pb-14 w-full">
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
      <input
        v-model="chatInput"
        @keyup.enter="chatInputHandle"
        class="input w-full rounded-lg bg-gray-800 text-white"
        placeholder="Type your message here..."
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineEmits, ref } from 'vue'
import { useGeneralStore } from '../stores/generalStore.ts'
import { messageMarkdown } from '../utils/markdown.ts'
import { storeToRefs } from 'pinia'
const generalStore = useGeneralStore()

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

const chatInputHandle = async () => {
  if (chatInput.value.length > 0) {
    if (debounceTimeout.value) {
      clearTimeout(debounceTimeout.value)
    }
    debounceTimeout.value = window.setTimeout(async () => {
      storeMessage.value = true
      await emit('processRequest', chatInput.value)
    }, debounceDelay)
  }
}
</script>

<style scoped lang="postcss">
.chat-wrapper {
  @apply max-w-0 overflow-hidden opacity-0 flex flex-col border-4 border-transparent;
  transition: width 0.1s ease-in-out;
  transition: opacity 0.3s ease-in-out;
  transition: border 0.3s ease-in-out;
  .messages-wrapper {
    flex: 1;
    overflow-y: scroll;
  }
  &.open {
    @apply w-full max-w-[960px] py-4 pl-[300px] opacity-100 border-blue-500/50 shadow-md;
  }
}
.messages-wrapper::-webkit-scrollbar {
  width: 8px;
}

.messages-wrapper::-webkit-scrollbar-track {
  background: #333; /* Darker background */
  border-radius: 4px;
}

.messages-wrapper::-webkit-scrollbar-thumb {
  background: #555; /* Lighter thumb */
  border-radius: 4px;
}

.messages-wrapper::-webkit-scrollbar-thumb:hover {
  background: #777; /* Even lighter on hover */
}
</style>
