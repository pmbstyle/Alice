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
            'ring-green-500!': isPlaying,
            'w-[200px] h-[200px]': isMinimized,
            'w-[480px] h-[480px]': !isMinimized && isElectron,
            'w-[430px] h-[430px]': !isElectron,
          }"
          :style="{
            backgroundImage: `url('${bg}'`,
            backgroundPositionY: !isMinimized ? '-62px' : '-25px',
          }"
        >
          <audio ref="audioPlayer" class="hidden"></audio>
          <video
            class="max-w-screen-md rounded-full"
            :class="{
              'h-[200px]': isMinimized,
              'h-[480px]': !isMinimized && isElectron,
              'h-[430px]': !isElectron,
            }"
            ref="aiVideo"
            :src="videoSource"
            loop
            muted
            :autoplay="isPlaying"
          ></video>
          <Actions
            @takeScreenShot="takeScreenShot"
            @togglePlaying="togglePlaying"
            @toggleRecording="toggleRecording"
            :isElectron="isElectron"
            :isTTSEnabled="isTTSEnabled"
          />
        </div>
      </div>
      <Sidebar @processRequest="processRequest" />
    </div>
  </div>
</template>

<script setup lang="ts">
import Actions from './Actions.vue'
import Sidebar from './Sidebar.vue'
import { bg } from '../utils/assetsImport'
import { setVideo } from '../utils/videoProcess'
import { onMounted, nextTick } from 'vue'
import { useGeneralStore } from '../stores/generalStore'
import { useConversationStore } from '../stores/openAIStore'
import { storeToRefs } from 'pinia'
import { useAudioProcessing } from '../composables/useAudioProcessing'
import { useAudioPlayback } from '../composables/useAudioPlayback'
import { useScreenshot } from '../composables/useScreenshot'
import eventBus from '../utils/eventBus'

const generalStore = useGeneralStore()
const conversationStore = useConversationStore()
const isElectron = typeof window !== 'undefined' && window?.electron

const { toggleRecording, startListening, stopListening } = useAudioProcessing()
const { setupAudioPlayback, togglePlaying } = useAudioPlayback(
  startListening,
  stopListening
)
const {
  screenShot,
  screenshotReady,
  takeScreenShot,
  setupScreenshotListeners,
} = useScreenshot()

const {
  aiVideo,
  videoSource,
  isPlaying,
  statusMessage,
  audioPlayer,
  chatInput,
  openSidebar,
  isMinimized,
  storeMessage,
  updateVideo,
  isTTSEnabled,
} = storeToRefs(generalStore)

generalStore.setProvider('openai')

const processRequest = async (text: string) => {
  updateVideo.value('PROCESSING')

  let messageContent: any[] = [{ type: 'text', text: text }]

  if (screenshotReady.value && screenShot.value) {
    try {
      const fileId = await conversationStore.uploadScreenshotToOpenAI(
        screenShot.value
      )

      messageContent.push({
        type: 'image_file',
        image_file: {
          file_id: fileId,
        },
      })

      screenshotReady.value = false
      screenShot.value = ''
    } catch (error) {
      console.error('Error uploading screenshot:', error)
      statusMessage.value = 'Error uploading screenshot'
    }
  }

  const userMessage = {
    role: 'user',
    content: messageContent,
  }

  generalStore.chatHistory.unshift({
    role: 'user',
    content: [
      {
        type: 'text',
        text: { value: text, annotations: [] },
      },
    ],
  })

  const prompt = await conversationStore.createOpenAIPrompt(
    userMessage,
    storeMessage.value
  )

  await conversationStore.sendMessageToThread(
    prompt.message,
    storeMessage.value
  )

  chatInput.value = ''
  await conversationStore.chat(prompt.history)
}

onMounted(async () => {
  await conversationStore.createNewThread()

  audioPlayer.value = document.querySelector('audio')
  if (audioPlayer.value) {
    console.log('Audio player element initialized:', !!audioPlayer.value)
  } else {
    console.error('Audio player element not found')
  }

  updateVideo.value = async (type: string) => {
    const playVideo = async (videoType: string) => {
      videoSource.value = setVideo(videoType)
      await nextTick()
      aiVideo.value?.play()
    }
    await playVideo(type)
  }
  updateVideo.value('STAND_BY')

  setupAudioPlayback()

  eventBus.on('processing-complete', transcription => {
    console.log(
      'Processing complete event received with transcription:',
      transcription
    )
    if (transcription && transcription.trim()) {
      processRequest(transcription)
    } else {
      statusMessage.value = 'No speech detected'
    }
  })

  if (isElectron) {
    setupScreenshotListeners()
  }
})
</script>
