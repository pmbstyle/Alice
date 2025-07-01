<template>
  <div class="flex-1" @click="handleChatClick">
    <transition-group name="list" tag="div">
      <div
        class="chat mb-2"
        v-for="(message, index) in chatHistoryDisplay"
        :key="message.api_message_id || `local-${index}`"
        :class="{
          'chat-start':
            message.role === 'assistant' || message.role === 'system',
          'chat-end': message.role === 'user',
        }"
      >
        <div
          class="chat-bubble mb-2"
          :class="{
            'chat-bubble-primary': message.role === 'assistant',
            'chat-bubble-accent': message.role === 'developer',
            'chat-bubble-info': message.role === 'system',
          }"
          v-html="getDisplayableMessageContent(message)"
        ></div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGeneralStore } from '../stores/generalStore'
import type {
  ChatMessage,
  AppChatMessageContentPart,
} from '../stores/conversationStore'
import { messageMarkdown } from '../utils/markdown'
import { storeToRefs } from 'pinia'

const generalStore = useGeneralStore()
const { chatHistory } = storeToRefs(generalStore)

const chatHistoryDisplay = computed(() => {
  return [...chatHistory.value].reverse().filter(message => {
    const isGenerallyDisplayableRole =
      message.role === 'assistant' ||
      message.role === 'system' ||
      message.role === 'developer' ||
      message.role === 'user'

    if (!isGenerallyDisplayableRole) {
      return false
    }

    if (message.role === 'assistant') {
      if (typeof message.content === 'string') {
        if (message.content.trim() === '') {
          return false
        }
      } else if (Array.isArray(message.content)) {
        if (message.content.length === 0) {
          return false
        }
        const hasDisplayableContent = message.content.some(
          part =>
            (part.type === 'app_text' &&
              part.text &&
              part.text.trim() !== '') ||
            part.type === 'app_generated_image_path'
        )
        if (!hasDisplayableContent) {
          return false
        }
      } else if (message.content == null) {
        return false
      }
    }

    return true
  })
})

const openImageWithSystemViewer = (absoluteFilePath: string) => {
  if (!absoluteFilePath) {
    console.warn('Cannot open image: No absolute path provided.')
    return
  }
  const correctedPath = absoluteFilePath.replace(/\\/g, '/')
  console.log(
    `Requesting to open image with system viewer at OS path: ${correctedPath}`
  )
  window.ipcRenderer
    .invoke('electron:open-path', { target: correctedPath })
    .then(result => {
      if (!result.success) {
        console.error(
          "Failed to open image via IPC ('electron:open-path'):",
          result.message
        )
      }
    })
    .catch(err =>
      console.error("Error invoking 'electron:open-path' for image:", err)
    )
}

const getDisplayableMessageContent = (message: ChatMessage): string => {
  if (typeof message.content === 'string') {
    return messageMarkdown(message.content)
  } else if (Array.isArray(message.content)) {
    let combinedHtml = ''
    for (const part of message.content as AppChatMessageContentPart[]) {
      if (part.type === 'app_text' && part.text) {
        if (part.text.trim() !== '') {
          combinedHtml += messageMarkdown(part.text) + '<br/>'
        }
      } else if (part.type === 'app_file' && part.fileName) {
        combinedHtml += `
          <div class="attached-file my-2 p-2 bg-gray-700/50 rounded-lg flex items-center gap-2 max-w-xs">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 shrink-0">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <span class="font-mono text-sm truncate" title="${part.fileName}">${part.fileName}</span>
          </div>
          <br/>`
      } else if (
        part.type === 'app_generated_image_path' &&
        part.path &&
        part.absolutePathForOpening
      ) {
        const imageSrcForDisplay = `alice-image://${part.path}`
        const imageClass = part.isPartial
          ? 'partial-image-preview'
          : 'final-image'
        const titleText = part.isPartial
          ? `Partial Image Preview ${part.partialIndex || ''} (Click to open if available)`
          : 'Generated Image (Click to open)'

        combinedHtml += `
          <div class="generated-image-container my-2 ${imageClass}">
            <img 
              src="${imageSrcForDisplay}" 
              alt="${titleText}" 
              class="max-w-xs md:max-w-sm rounded-lg cursor-pointer shadow-lg generated-alice-image" 
              data-absolute-path="${part.absolutePathForOpening}"
              title="${titleText}"
            />
            ${part.isPartial ? `<span class="text-xs text-gray-400 block text-center">Generating ...</span>` : ''}
          </div>
          <br/>`
      } else if (part.type === 'app_image_uri' && part.uri) {
        combinedHtml += `
          <img 
            src="${part.uri}" 
            alt="User provided image" 
            class="max-w-xs md:max-w-sm rounded-lg my-2 shadow-lg" 
            title="User provided image"
          />
          <br/>`
      }
    }

    return combinedHtml.length > 5 && combinedHtml.endsWith('<br/>')
      ? combinedHtml.slice(0, -5)
      : combinedHtml || (message.role === 'assistant' ? '...' : '')
  }
  return messageMarkdown('Error: Unable to display message content.')
}

const handleChatClick = (event: MouseEvent) => {
  let targetElement = event.target as HTMLElement

  if (
    targetElement.tagName === 'IMG' &&
    targetElement.classList.contains('generated-alice-image')
  ) {
    const absoluteImagePath = targetElement.getAttribute('data-absolute-path')
    if (absoluteImagePath) {
      openImageWithSystemViewer(absoluteImagePath)
      event.preventDefault()
      return
    } else {
      console.warn(
        "Clicked generated image has no 'data-absolute-path' attribute."
      )
    }
  }

  for (
    let i = 0;
    i < 3 && targetElement && targetElement !== event.currentTarget;
    i++
  ) {
    if (targetElement.tagName === 'A') {
      const href = targetElement.getAttribute('href')
      if (
        href &&
        (href.startsWith('http://') ||
          href.startsWith('https://') ||
          href.startsWith('mailto:'))
      ) {
        console.log(
          `Clicked on a standard link: ${href}. Electron's default handler should open it.`
        )
        return
      }
    }
    if (targetElement.parentElement) {
      targetElement = targetElement.parentElement
    } else {
      break
    }
  }
}
</script>

<style scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(30px);
}

.partial-image-preview img {
  border: 2px dashed #00f5cc;
  opacity: 0.8;
}
.final-image img {
  border: 2px solid #5865f2;
}

.chat-bubble {
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.chat-bubble * {
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}

.chat-bubble p, 
.chat-bubble div, 
.chat-bubble span,
.chat-bubble code {
  word-break: break-all;
  overflow-wrap: anywhere;
}

.chat-bubble pre {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
}
</style>
