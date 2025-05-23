<template>
  <div class="flex-1">
    <div
      class="chat mb-2"
      v-for="(message, index) in chatHistoryDisplay"
      :key="message.api_message_id || `local-${index}`"
      :class="{
        'chat-start': message.role === 'assistant' || message.role === 'system',
        'chat-end':
          message.role === 'user' ||
          message.role === 'developer' ||
          message.role === 'tool',
      }"
    >
      <div
        class="chat-bubble mb-2"
        :class="{
          'chat-bubble-primary': message.role === 'assistant',
          'chat-bubble-success': message.role === 'system',
          'chat-bubble-info': message.role === 'tool',
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
  return [...chatHistory.value].reverse()
})

const getDisplayableMessageContent = (message: ChatMessage): string => {
  if (typeof message.content === 'string') {
    return messageMarkdown(message.content)
  } else if (Array.isArray(message.content)) {
    let combinedText = ''
    for (const part of message.content) {
      if (part.type === 'app_text' && part.text) {
        combinedText += part.text + ' '
      } else if (part.type === 'app_image_uri') {
        combinedText += '[Image sent] '
      }
    }
    return messageMarkdown(combinedText.trim())
  }
  return messageMarkdown('Error: Unable to display message content.')
}
</script>
