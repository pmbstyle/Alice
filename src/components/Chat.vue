<template>
  <div
    class="chat-wrapper h-[480px] ml-[380px] bg-gray-900 bg-opacity-90 flex flex-col absolute z-10 rounded-r-lg"
    :class="{ 'open': openChat }"
    >
    <div id="chatHistory" class="messages-wrapper pb-14 w-full">
      <template v-if="chatHistoryDisplay.length">
        <div
          class="chat mb-2"
          v-for="(message, index) in chatHistoryDisplay"
          :key="index"
          :class="{ 'chat-start': message.role === 'assistant', 'chat-end': message.role === 'user' }"
        >
          <div class="chat-bubble mb-2"
            :class="{ 'chat-bubble-primary': message.role === 'assistant' }"
            v-html="messageMarkdown((message.content[0] as any).text.value)">
          </div>
        </div>
      </template>
      <div class="mt-4" v-if="isInProgress">
        <span class="loading loading-ball loading-xs" v-for="n in 3" :key="n"></span>
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
  import { computed, defineEmits } from 'vue'
  import { useGeneralStore } from '../stores/generalStore.ts'
  import { messageMarkdown } from '../utils/markdown.ts'
  import { storeToRefs } from 'pinia'
  const generalStore = useGeneralStore()

  const emit = defineEmits(['processRequest'])
  const {
      isInProgress,
      chatHistory,
      chatInput,
      openChat,
      storeMessage
    } = storeToRefs(generalStore)
  const chatHistoryDisplay = computed(() => {
    let history = [...chatHistory.value]
    history = history.filter(item =>!item.content[0].text.value.includes('[start screenshot]'))
    return history.reverse()
  })

  const chatInputHandle = async () => {
    if (chatInput.value.length > 0) {
      storeMessage.value = true
      await emit('processRequest', chatInput.value)
    }
  }
</script>

<style scoped lang="postcss">
  .chat-wrapper {
    @apply max-w-0 overflow-hidden opacity-0 flex flex-col border-4 border-transparent;
    transition: width .1s ease-in-out;
    transition: opacity .3s ease-in-out;
    transition: border .3s ease-in-out;
    .messages-wrapper {
      flex:1;
      overflow-y:scroll;
    }
    &.open {
      @apply w-full max-w-[960px] py-4 pl-[300px] opacity-100 border-blue-500/50 shadow-md;
    }
  }
</style>