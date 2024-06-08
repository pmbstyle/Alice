<template>
  <div class="drawer drawer-end">
    <input id="my-drawer-4" type="checkbox" class="drawer-toggle" />
    <div class="h-screen flex w-full items-center justify-start relative">
      <div class="avatar-wrapper flex container h-full items-center justify-center relative z-2">
        <div class="avatar" :class="{'open': openChat}">
          <div
            class="rounded-full ring ring-offset-base-100 ring-offset-2 relative overflow-hidden w-[480px] h-[480px] !flex justify-center items-center z-20"
            :class="{ 'ring-success': isPlaying }">
            <audio ref="audioPlayer" class="hidden"></audio>
            <video class="max-w-screen-sm h-full rounded-full ring" ref="aiVideo" :src="videoSrc" loop muted :autoplay="isPlaying"></video>
            <div class="absolute bottom-0 py-2 z-20 flex flex-col w-full bg-black bg-opacity-60">
              <div class="pb-2 rounded-lg flex items-center justify-center gap-8">
                <img :src="isRecordingRequested ? micIconActive : micIcon" class="indicator" @click="toggleRecording"/>
                <img :src="isPlaying ? speakerIconInactive : speakerIcon" class="indicator" @click="togglePlaying"/>
                <img :src="chatIcon" class="indicator" @click="toggleChat()"/>
              </div>
              <div class="text-center dragable">
                {{ statusMessage }}
              </div>
            </div>
          </div>
        </div>
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
                  v-html="messageMarkdown(message.content[0].text.value)">
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import bg from './assets/images/bg.jpg'
import AiAvatarStatic from './assets/images/ai-avatar-static.png'
import UserAvatarStatic from './assets/images/user-avatar-static.png'
import videoSrc from './assets/videos/video.mp4'
import micIcon from './assets/images/mic.svg'
import micIconActive from './assets/images/mic-active.svg'
import speakerIcon from './assets/images/speaker.svg'
import speakerIconInactive from './assets/images/speaker-inactive.svg'
import chatIcon from './assets/images/chat.svg'

import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import axios from 'axios'
import { useSpeechRecognition } from '@vueuse/core'
import { useConversationStore } from './stores/conversationStore'
import { storeToRefs } from 'pinia'

const conversationStore = useConversationStore()

const { isListening, result, start, stop } = useSpeechRecognition({
  continuous: true,
  lang: 'en-US',
})

const { messages } = storeToRefs(conversationStore)

const recognizedText = ref<string>('')
const isRecordingRequested = ref<boolean>(false)
const isRecording = ref<boolean>(false)
const audioPlayer = ref<HTMLAudioElement | null>(null)
const aiVideo = ref<HTMLVideoElement | null>(null)
const isPlaying = ref<boolean>(false)
const isInProgress = ref<boolean>(false)
const chatHistory = ref<{ role: string, content: string }[]>(messages)
const chatHistoryDisplay = computed(() => { 
  let history = [...chatHistory.value]
  return history.reverse()
})
const statusMessage = ref<string>('Ready to chat')
const audioContext = ref<AudioContext | null>(null)
const audioSource = ref<AudioBufferSourceNode | null>(null)
const chatInput = ref<string>('')

const openChat = ref<boolean>(false)

watch(result, (newResult) => {
  recognizedText.value = newResult
  // if (recognizedText.value.length > 0 && chatHistory.value.length > 0) {
  //   chatHistory.value[chatHistory.value.length - 1].content[0].text.value = recognizedText.value
  // }
}, { immediate: true })

const requestMicrophonePermission = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('navigator.mediaDevices is not supported in this browser.')
    statusMessage.value = 'Microphone access is not supported in this browser.'
    return false
  }
  
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true })
    return true
  } catch (error) {
    console.error('Microphone permission denied or unavailable:', error)
    statusMessage.value = 'Microphone access denied or unavailable'
    return false
  }
}

const startListening = async () => {
  if (!isRecording.value || !isRecordingRequested.value) return

  const hasPermission = await requestMicrophonePermission()
  if (!hasPermission) {
    isRecording.value = false
    return
  }

  start()
  await nextTick()
  scrollChat()

  const audioContextInstance = new AudioContext()
  const analyser = audioContextInstance.createAnalyser()
  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)

  let stream: MediaStream

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    console.error('Error accessing microphone:', error)
    statusMessage.value = 'Microphone access denied or unavailable'
    isRecording.value = false
    return
  }

  const source = audioContextInstance.createMediaStreamSource(stream)
  source.connect(analyser)

  let silenceCounter = 0
  const silenceThreshold = 200

  const checkSilence = () => {
    if (!isRecording.value) return

    statusMessage.value = 'Listening'

    analyser.getByteFrequencyData(dataArray)
    const isSilent = dataArray.every(value => value < silenceThreshold)

    if (isSilent) {
      silenceCounter++
    } else {
      silenceCounter = 0
    }

    if (silenceCounter > 299) {
      if (recognizedText.value.length > 0) {
        stop()
        isRecording.value = false
        processRequest(recognizedText.value)
        recognizedText.value = ''
        silenceCounter = 0
      } else {
        silenceCounter = 0
        requestAnimationFrame(checkSilence)
        statusMessage.value = 'Listening'
      }
    } else {
      requestAnimationFrame(checkSilence)
    }
  }

  checkSilence()
}

const toggleRecording = async () => {
  isRecordingRequested.value = !isRecordingRequested.value
  if (!isRecordingRequested.value) {
    isRecording.value = false
    stop()
    stopVideo()
    statusMessage.value = 'Stand by'
  } else {
    isRecording.value = true
    startListening()
  }
}

const playAudio = async (audioDataURI: string) => {
  if (audioPlayer.value) {
    if (!isPlaying.value) {
      isPlaying.value = true
      if (audioContext.value) {
        audioContext.value.close()
      }
      audioContext.value = new AudioContext()
      const audioBuffer = await audioContext.value.decodeAudioData(audioDataURI)
      audioSource.value = audioContext.value.createBufferSource()

      audioSource.value.buffer = audioBuffer
      audioSource.value.connect(audioContext.value.destination)
      audioSource.value.onended = () => {
        isPlaying.value = false
        isRecording.value = true
        startListening()
        stopVideo()
      }
      audioSource.value.start()
      statusMessage.value = 'Playing response'
      if (audioPlayer.value) {
        audioPlayer.value.src = audioDataURI
        aiVideo.value?.play()
        await audioPlayer.value.play()
      }
    }
  }
}

const togglePlaying = () => {
  if (isPlaying.value) {
    audioPlayer.value?.pause()
    stopVideo()
    if (audioContext.value) {
      audioContext.value.close()
      audioContext.value = null
    }
    isPlaying.value = false
    if(isRecordingRequested.value) {
      isRecording.value = true
      startListening()
    }
  } else {
    audioSource.value.start()
    isPlaying.value = true
  }
}

const chatInputHandle = async () => {
  if (chatInput.value.length > 0) processRequest(chatInput.value)
}

const processRequest = async (text:string) => {
  statusMessage.value = 'Processing'
  let input = { role: 'user', content: text }
  await conversationStore.sendMessageToThread(input)
  chatInput.value = ''
  const audioURI = await conversationStore.chat()
  await playAudio(audioURI)
  scrollChat()
}

const scrollChat = () => {
  const chatHistoryElement = document.getElementById('chatHistory')
  if (chatHistoryElement) {
    chatHistoryElement.scrollTo({
      top: chatHistoryElement.scrollHeight,
      behavior:'smooth'
    })
  }
}

const messageMarkdown = (text: string) => {
  let output = text.replace(/(\r\n|\n|\r)/gm, '<br>')
  output = output.replace(/(https?:\/\/[^\s]+)/gm, '<a href="$1" target="_blank">$1</a>')
  output = output.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
  output = output.replace(/(^|\s)#([^\s]+)/gm, '$1<span class="hashtag">#$2</span>')
  output = output.replace(/(^|\s)@([^\s]+)/gm, '$1<span class="mention">@$2</span>')
  return output
}

const stopVideo = () => {
  if (aiVideo.value) {
    aiVideo.value.pause()
    aiVideo.value.currentTime = 0
  }
}

const toggleChat = async () => {
  openChat.value = !openChat.value
  await nextTick()
  if (openChat.value) {
    window.electron.resize({ width: 1200, height: 500 })
  } else {
    window.electron.resize({ width: 500, height: 500 })
  }
}

onMounted(async () => {
  await conversationStore.createNewThread()
})

onUnmounted(() => {
  if (isRecording.value) {
    stop()
  }
  if (audioContext.value) {
    audioContext.value.close()
  }
})
</script>

<style scoped lang="postcss">
.avatar-wrapper {
  height:500px;
}
.indicator {
  cursor: pointer;
  transition: all 0.3s ease-in-out;
  @apply p-2 rounded-full touch-auto w-14; 
  &:hover {
    @apply bg-primary bg-opacity-10;
  }
}
.avatar{
  transition: all .1s ease-in-out;
  &.open {
    @apply pr-[505px];
  }
}
.dragable {
  -webkit-user-select: none;
  -webkit-app-region: drag;
  cursor: move;
}
.chat-wrapper {
  @apply max-w-0 overflow-hidden opacity-0 flex flex-col;
  transition: width .1s ease-in-out;
  transition: opacity .3s ease-in-out;
  .messages-wrapper {
    flex:1;
    overflow-y:scroll;
  }
  &.open {
    @apply w-full max-w-[960px] py-4 pl-[300px] opacity-100;
  }
}
</style>
