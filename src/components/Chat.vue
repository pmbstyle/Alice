<template>
  <div class="flex-1">
    <div
      class="chat mb-2"
      v-for="(message, index) in chatHistoryDisplay"
      :key="message.api_message_id || `local-${index}`"
      :class="{
        'chat-start': message.role === 'assistant' || message.role === 'system',
        'chat-end': message.role === 'user',
      }"
    >
      <div
        class="chat-bubble mb-2"
        :class="{
          'chat-bubble-primary': message.role === 'assistant',
          'chat-bubble-success': message.role === 'system',
        }"
        v-html="getDisplayableMessageContent(message)"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGeneralStore } from '../stores/generalStore'
import type {
  ChatMessage,
  AppChatMessageContentPart,
} from '../stores/openAIStore'
import { messageMarkdown } from '../utils/markdown'
import { storeToRefs } from 'pinia'

const generalStore = useGeneralStore()
const { chatHistory } = storeToRefs(generalStore)

const chatHistoryDisplay = computed(() => {
  return [...chatHistory.value].reverse().filter(message => {
    if (message.content.length && message.content[0]?.text === '') {
      return false
    }
    return (
      message.role === 'assistant' ||
      message.role === 'system' ||
      message.role === 'user'
    )
  })
})

const getDisplayableMessageContent = (message: ChatMessage): string => {
  if (typeof message.content === 'string') {
    return messageMarkdown(message.content)
  } else if (Array.isArray(message.content)) {
    let combinedText = ''
    for (const part of message.content) {
      if (part.type === 'app_text' && part.text) {
        combinedText += part.text + ' '
      }
    }
    return messageMarkdown(combinedText.trim())
  }
  return messageMarkdown('Error: Unable to display message content.')
}
</script>
