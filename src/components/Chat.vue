<template>
  <div class="flex-1">
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
  </div>
</template>

<script setup lang="ts">
import { computed, defineEmits } from 'vue'
import { useGeneralStore } from '../stores/generalStore'
import { messageMarkdown } from '../utils/markdown'
import { storeToRefs } from 'pinia'

const generalStore = useGeneralStore()

const emit = defineEmits(['processRequest'])
const { chatHistory } = storeToRefs(generalStore)
const chatHistoryDisplay = computed(() => {
  let history = [...chatHistory.value]
  history = history.filter(
    item => !item.content[0].text.value.includes('[start screenshot]')
  )
  return history.reverse()
})

</script>