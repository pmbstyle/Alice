<template>
  <div class="h-screen flex w-full items-center justify-start relative">
    <div
      class="avatar-wrapper flex container h-full items-center justify-center relative z-2"
      :class="{ mini: isMinimized }"
    >
      <div class="avatar" :class="{ open: openSidebar }">
        <div
          class="avatar-ring"
          :class="{
            'ring-green-500!': audioState === 'SPEAKING',
            'ring-cyan-500!':
              audioState === 'PROCESSING_AUDIO' ||
              audioState === 'WAITING_FOR_RESPONSE',
            'ring-blue-500!': audioState === 'LISTENING',
            'w-[200px] h-[200px]': isMinimized,
            'w-[480px] h-[480px]': !isMinimized && isElectron,
            'w-[430px] h-[430px]': !isElectron,
          }"
          :style="{
            backgroundImage: `url('${bg}')`,
            backgroundPositionY: !isMinimized ? '-62px' : '-25px',
          }"
        >
          <audio ref="audioPlayerElement" class="hidden"></audio>
          <video
            class="max-w-screen-md rounded-full"
            :class="{
              'h-[200px]': isMinimized,
              'h-[480px]': !isMinimized && isElectron,
              'h-[430px]': !isElectron,
            }"
            ref="aiVideoElement"
            :src="videoSource"
            loop
            muted
            autoplay
            playsinline
          ></video>
          <Actions
            @takeScreenShot="handleTakeScreenshot"
            @togglePlaying="handleToggleTTS"
            @toggleRecording="handleToggleRecording"
            :isElectron="isElectron"
            :isTTSEnabled="isTTSEnabled"
            :audioState="audioState"
          />
        </div>
      </div>
      <Sidebar @processRequest="processRequestFromSidebar" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref as vueRef } from 'vue'
import { storeToRefs } from 'pinia'
import Actions from './Actions.vue'
import Sidebar from './Sidebar.vue'
import { bg } from '../utils/assetsImport'

import { useGeneralStore } from '../stores/generalStore'
import { useConversationStore } from '../stores/openAIStore'
import type { ChatMessage, OpenAI } from '../stores/openAIStore'
import { useAudioProcessing } from '../composables/useAudioProcessing'
import { useAudioPlayback } from '../composables/useAudioPlayback'
import { useScreenshot } from '../composables/useScreenshot'
import eventBus from '../utils/eventBus'

const { toggleRecordingRequest } = useAudioProcessing()
const { toggleTTSPreference } = useAudioPlayback()
const {
  screenShot,
  screenshotReady,
  takeScreenShot,
  setupScreenshotListeners,
  cleanupScreenshotListeners,
} = useScreenshot()

const generalStore = useGeneralStore()
const conversationStore = useConversationStore()

const {
  audioState,
  aiVideo,
  videoSource,
  audioPlayer,
  chatInput,
  openSidebar,
  isMinimized,
  storeMessage,
  isTTSEnabled,
  takingScreenShot,
} = storeToRefs(generalStore)
const { setAudioState } = generalStore
const {
  createOpenAIPrompt,
  sendMessageToThread,
  chat,
  uploadScreenshotToOpenAI,
} = conversationStore

const isElectron = typeof window !== 'undefined' && (window as any).electron
const audioPlayerElement = vueRef<HTMLAudioElement | null>(null)
const aiVideoElement = vueRef<HTMLVideoElement | null>(null)

onMounted(async () => {
  audioPlayer.value = audioPlayerElement.value
  aiVideo.value = aiVideoElement.value

  if (!audioPlayer.value) {
    console.error('Audio player element not found after mount!')
  }
  if (!aiVideo.value) {
    console.error('AI video element not found after mount!')
  } else {
    aiVideo.value
      .play()
      .catch(e => console.warn('Initial video play failed:', e))
  }

  if (isElectron) {
    setupScreenshotListeners()
  }

  eventBus.on('processing-complete', handleProcessingComplete)
})

onUnmounted(() => {
  console.log('Main component unmounted.')
  if (isElectron) {
    cleanupScreenshotListeners()
  }
  eventBus.off('processing-complete', handleProcessingComplete)
})

const handleTakeScreenshot = () => {
  if (isElectron && !takingScreenShot.value) {
    takeScreenShot()
  }
}

const handleToggleTTS = () => {
  toggleTTSPreference()
}

const handleToggleRecording = () => {
  toggleRecordingRequest()
}

const handleProcessingComplete = (transcription: string) => {
  console.log(
    '[Main.vue] Processing complete event received with transcription:',
    transcription
  )
  if (
    transcription &&
    transcription.trim() &&
    (audioState.value === 'PROCESSING_AUDIO' ||
      audioState.value === 'LISTENING')
  ) {
    generalStore.recognizedText = transcription
    processRequest(transcription)
  } else {
    console.warn(
      "[Main.vue] Transcription received, but state wasn't PROCESSING_AUDIO/LISTENING or text empty. State:",
      audioState.value
    )
    if (
      audioState.value !== 'SPEAKING' &&
      audioState.value !== 'WAITING_FOR_RESPONSE'
    ) {
      setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
    }
  }
}

const processRequestFromSidebar = (text: string) => {
  if (text && text.trim()) {
    if (audioState.value === 'IDLE' || audioState.value === 'LISTENING') {
      addMessageToHistory('user', text)
      processRequest(text)
      chatInput.value = ''
    } else {
      console.warn(
        'Cannot process sidebar request, system busy. State:',
        audioState.value
      )
      generalStore.statusMessage = 'Busy, please wait...'
      setTimeout(() => {
        if (generalStore.statusMessage === 'Busy, please wait...')
          generalStore.setAudioState(audioState.value)
      }, 2000)
    }
  }
}

const addMessageToHistory = (
  role: 'user' | 'assistant' | 'system',
  text: string,
  id?: string
) => {
  generalStore.chatHistory.unshift({
    id: id || `temp-${Date.now()}`,
    role: role,
    content: [{ type: 'text', text: { value: text, annotations: [] } }],
  })
}

const processRequest = async (text: string) => {
  console.log(`[Main.vue] Processing request from STT: "${text}"`)
  setAudioState('WAITING_FOR_RESPONSE')

  const appContentParts: AppChatMessageContentPart[] = [
    { type: 'app_text', text: text },
  ]

  if (screenshotReady.value && screenShot.value) {
    const imageDataUri = await conversationStore.uploadScreenshotToOpenAI(
      screenShot.value
    )
    if (imageDataUri) {
      appContentParts.push({ type: 'app_image_uri', uri: imageDataUri })
    } else {
      console.error(
        '[Main.vue] Screenshot processing failed, proceeding without image.'
      )
    }
    screenshotReady.value = false
    screenShot.value = ''
  }

  const userMessage: ChatMessage = {
    role: 'user',
    content: appContentParts,
  }

  generalStore.addMessageToHistory(userMessage)
  await conversationStore.chat()
}
</script>

<style scoped lang="postcss">
.avatar-ring {
  transition: ring-color 0.3s ease-in-out;
}
</style>
