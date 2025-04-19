<template>
  <div
    class="chat-wrapper h-[480px] ml-[380px] bg-gray-900 bg-opacity-90 flex flex-col absolute z-10 rounded-r-lg"
    :class="{ open: openChat }"
  >
    <div
      id="chatHistory"
      class="messages-wrapper pb-14 w-full flex-grow overflow-y-auto"
    >
      <template v-if="chatHistoryDisplay.length">
        <div
          class="chat mb-2 px-4"
          v-for="(message, index) in chatHistoryDisplay"
          :key="`${message.role}-${index}`"
          :class="{
            'chat-start': message.role === 'model',
            'chat-end': message.role === 'user',
          }"
        >
          <template v-for="(part, partIndex) in message.parts" :key="partIndex">
            <div
              v.if="getPartContent(part)"
              class="chat-bubble mb-2 break-words max-w-full"
              :class="{
                'chat-bubble-primary': message.role === 'model',
                'bg-gray-700': message.role === 'user' && part.functionResponse,
                'opacity-80 italic': part.functionResponse,
              }"
              v-html="getPartContent(part)"
            ></div>
          </template>
        </div>
      </template>
      <div class="mt-4 text-center" v-if="isInProgress">
        <span
          class="loading loading-ball loading-xs"
          v-for="n in 3"
          :key="n"
        ></span>
      </div>
      <div
        v-if="!chatHistoryDisplay.length && !isInProgress"
        class="text-center text-gray-500 pt-10"
      >
        Chat history is empty.
      </div>
    </div>
    <div class="w-full pt-4 px-4">
      <div class="gradient-border-wrapper">
        <input
          v-model="chatInput"
          @keyup.enter="chatInputHandle"
          class="input w-full rounded-lg bg-gray-800 text-white p-3 relative z-10"
          placeholder="Type your message here..."
          :disabled="isInProgress || isRecording"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch, onMounted } from 'vue'
import { useGeneralStore } from '../stores/generalStore.ts'
import { messageMarkdown } from '../utils/markdown.ts'
import { storeToRefs } from 'pinia'
import { Content, ContentPart } from '../api/gemini/liveApiClient'

const generalStore = useGeneralStore()

const emit = defineEmits(['processRequest'])
const {
  isInProgress,
  chatHistory,
  chatInput,
  openChat,
  storeMessage,
  isRecording,
} = storeToRefs(generalStore)

const chatHistoryDisplay = computed(() => {
  const filteredHistory = chatHistory.value.filter(item => {
    return (
      item.parts &&
      item.parts.length > 0 &&
      item.parts[0]?.text !== '[User Speaking...]'
    )
  })
  return filteredHistory
})

const getPartContent = (part: ContentPart): string | null => {
  if (part.text) {
    return messageMarkdown(part.text)
  } else if (part.functionResponse) {
    const responseData =
      part.functionResponse.response?.output ??
      part.functionResponse.response?.error ??
      '[No Response Data]'
    const responseString =
      typeof responseData === 'string'
        ? responseData
        : JSON.stringify(responseData)
    const shortResponse =
      responseString.length > 100
        ? responseString.substring(0, 97) + '...'
        : responseString
    return messageMarkdown(
      `*Function Result (${part.functionResponse.name}):* \`${shortResponse}\``
    )
  } else if (part.inlineData) {
    return messageMarkdown(`*[Inline Data: ${part.inlineData.mimeType}]*`)
  } else if (part.functionCall) {
    return messageMarkdown(
      `*Function Call Requested: ${part.functionCall.name}*`
    )
  }
  return null
}

let debounceTimeout = ref<number | null>(null)
const debounceDelay = 300

const chatInputHandle = async () => {
  const trimmedInput = chatInput.value.trim()
  if (trimmedInput.length > 0 && !isInProgress.value && !isRecording.value) {
    if (debounceTimeout.value) {
      clearTimeout(debounceTimeout.value)
    }
    debounceTimeout.value = window.setTimeout(async () => {
      storeMessage.value = true
      await emit('processRequest', trimmedInput)
      chatInput.value = ''
    }, debounceDelay)
  } else if (trimmedInput.length === 0) {
    chatInput.value = ''
  }
}

const scrollToBottom = () => {
  nextTick(() => {
    const chatHistoryElement = document.getElementById('chatHistory')
    if (chatHistoryElement) {
      chatHistoryElement.scrollTop = chatHistoryElement.scrollHeight
    }
  })
}

watch(
  () => chatHistory.value.length,
  () => {
    scrollToBottom()
  }
)

onMounted(() => {
  scrollToBottom()
})
</script>

<style scoped lang="postcss">
.chat-wrapper {
  @apply max-w-0 overflow-hidden opacity-0 flex flex-col border-4 border-transparent;
  transition:
    width 0.1s ease-in-out,
    opacity 0.3s ease-in-out,
    border 0.3s ease-in-out;

  &.open {
    @apply w-full max-w-[calc(100vw-120px)] py-4 pl-4 pr-4 opacity-100 border-blue-500/50 shadow-md;
  }
}
.messages-wrapper {
  @apply flex-grow overflow-y-auto flex flex-col-reverse;
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: #2d3748;
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: #4a5568;
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: #718096;
  }
}

.chat {
  @apply w-full flex;
  &.chat-start {
    @apply justify-start;
    .chat-bubble {
      @apply mr-auto;
    }
  }
  &.chat-end {
    @apply justify-end;
    .chat-bubble {
      @apply ml-auto;
    }
  }
}

.chat-bubble {
  @apply max-w-[85%] md:max-w-[75%] break-words px-4 py-2 rounded-lg;
  @apply bg-gray-600 text-white;

  &.chat-bubble-primary {
    @apply bg-blue-600 text-white;
  }
}

.gradient-border-wrapper {
  position: relative;
  border-radius: 0.5rem;
  padding: 1px;
  z-index: 0;
  overflow: hidden;
}

.gradient-border-wrapper::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 0.5rem;
  background: linear-gradient(
    -45deg,
    #00f5cc 0%,
    #00bfff 20%,
    #5865f2 45%,
    #8a2be2 75%,
    #ff0080 100%
  );
  background-size: 200% 200%;
  background-position: 0 0;
  opacity: 0;
  transition:
    background-position 1s ease,
    opacity 0.4s ease;
  z-index: -1;
}

.gradient-border-wrapper:focus-within::after {
  background-position: 100% 100%;
  opacity: 1;
}
</style>
