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
    audioState.value === 'PROCESSING_AUDIO'
  ) {
    processRequest(transcription)
  } else {
    console.warn(
      "[Main.vue] Transcription received, but state wasn't PROCESSING_AUDIO or text empty. State:",
      audioState.value
    )
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
  console.log(`[Main.vue] Processing request: "${text}"`)

  let messageContent: any[] = [{ type: 'text', text: text }]

  if (screenshotReady.value && screenShot.value) {
    console.log('[Main.vue] Screenshot ready, attempting upload.')
    try {
      const fileId = await uploadScreenshotToOpenAI(screenShot.value)
      if (fileId) {
        messageContent.push({
          type: 'image_file',
          image_file: { file_id: fileId },
        })
        console.log('[Main.vue] Screenshot added to message content.')
      } else {
        console.error(
          '[Main.vue] Screenshot upload failed, proceeding without image.'
        )
        addMessageToHistory('system', '(System: Failed to upload screenshot)')
      }
    } catch (error) {
      console.error('[Main.vue] Error during screenshot upload:', error)
      addMessageToHistory('system', '(System: Error uploading screenshot)')
    } finally {
      screenshotReady.value = false
      screenShot.value = ''
    }
  }
  const userMessagePayload = {
    role: 'user',
    content: messageContent,
  }

  const alreadyAdded =
    generalStore.chatHistory[0]?.role === 'user' &&
    generalStore.chatHistory[0]?.content[0]?.text?.value === text
  if (!alreadyAdded) {
    addMessageToHistory('user', text)
  }

  const prompt = await createOpenAIPrompt(
    userMessagePayload,
    storeMessage.value
  )

  if (!prompt || !prompt.message) {
    console.error('[Main.vue] Failed to create prompt.')
    setAudioState(isTTSEnabled.value ? 'LISTENING' : 'IDLE')
    addMessageToHistory('system', '(System: Error preparing request)')
    return
  }

  const messageSent = await sendMessageToThread(
    prompt.message,
    storeMessage.value
  )

  if (!messageSent) {
    console.error('[Main.vue] Failed to send message to thread.')
    setAudioState(isTTSEnabled.value ? 'LISTENING' : 'IDLE')
    addMessageToHistory('system', '(System: Error sending message)')
    return
  }

  setAudioState('WAITING_FOR_RESPONSE')
  await chat(prompt.history)
}
</script>

<style scoped lang="postcss">
.avatar-ring {
  transition: ring-color 0.3s ease-in-out;
}
</style>
