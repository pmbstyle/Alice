<template>
  <div class="h-screen flex w-full items-center justify-start relative">
    <div class="avatar-wrapper flex container h-full items-center justify-center relative z-2" :class="{'mini':isMinimized}">
      <div class="avatar" :class="{'open': openChat}">
        <div
          class="rounded-full ring ring-offset-base-100 ring-offset-2 relative overflow-hidden !flex justify-center items-center z-20"
          :class="{ 'ring-success': isPlaying, 'w-[200px] h-[200px]':isMinimized, 'w-[480px] h-[480px]': !isMinimized }">
          <audio ref="audioPlayer" class="hidden"></audio>
          <video class="max-w-screen-sm h-full rounded-full ring" ref="aiVideo" :src="videoSrc" loop muted :autoplay="isPlaying"></video>
          <div class="absolute bottom-0 py-2 z-20 flex flex-col w-full bg-black bg-opacity-60">
            <div class="pb-2 rounded-lg flex items-center justify-center gap-8">
              <img :src="isRecordingRequested ? micIconActive : micIcon" class="indicator" :class="{'mini':isMinimized}" @click="toggleRecording"/>
              <img :src="isPlaying ? speakerIconInactive : speakerIcon" class="indicator" :class="{'mini':isMinimized}" @click="togglePlaying"/>
              <img :src="chatIcon" class="indicator" :class="{'hidden':isMinimized}" @click="toggleChat()"/>
            </div>
            <div class="text-center dragable" :class="{'text-xs':isMinimized}">
              {{ statusMessage }}
            </div>
          </div>
          <div class="absolute right-2 z-80" :class="{'top-[80px]':isMinimized, 'top-[220px]':!isMinimized}">
            <button class="btn btn-circle bg-default border-0" :class="{'btn-sm':isMinimized}" @click="toggleMinimize">
              <img :src="isMinimized ? maxiIcon : miniIcon" class="indicator" :class="{'mini':isMinimized}"/>
            </button>
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
import miniIcon from './assets/images/mini.svg'
import maxiIcon from './assets/images/maxi.svg'

import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import axios from 'axios'
import { useConversationStore } from './stores/conversationStore'
import { storeToRefs } from 'pinia'


const conversationStore = useConversationStore()

const { messages } = storeToRefs(conversationStore)

const recognizedText = ref<string>('')
const isRecordingRequested = ref<boolean>(false)
const isRecording = ref<boolean>(false)
const audioPlayer = ref<HTMLAudioElement | null>(null)
const aiVideo = ref<HTMLVideoElement | null>(null)
const isPlaying = ref<boolean>(false)
const isInProgress = ref<boolean>(false)
const chatHistory = ref<{ role: string, content: string }[]>(messages as any)
const chatHistoryDisplay = computed(() => { 
  let history = [...chatHistory.value]
  return history.reverse()
})
const statusMessage = ref<string>('Ready to chat')
const audioContext = ref<AudioContext | null>(null)
const audioSource = ref<AudioBufferSourceNode | null>(null)
const chatInput = ref<string>('')

const openChat = ref<boolean>(false)
const isMinimized = ref<boolean>(false)

let mediaRecorder: MediaRecorder | null = null
let audioChunks: BlobPart[] = []
let silenceTimeout: NodeJS.Timeout | null = null

const silenceThreshold = 43
const minRMSValue = 1e-10
const bufferLength = 10
let rmsBuffer = Array(bufferLength).fill(0)
let dynamicSilenceThreshold = silenceThreshold

const startListening = () => {
  if(!isRecordingRequested.value) return
  statusMessage.value = 'Listening'
  recognizedText.value = ''
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      const audioContext = new (window.AudioContext)()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      source.connect(analyser)

      mediaRecorder = new MediaRecorder(stream)
      mediaRecorder.start()
      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data)
      }
      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped...')
        statusMessage.value = 'Stop listening'
        if(!isRecordingRequested.value) return
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' })
        const arrayBuffer = await audioBlob.arrayBuffer()
        const transcription = await conversationStore.transcribeAudioMessage(arrayBuffer as Buffer)
        recognizedText.value = transcription
        processRequest(transcription)
      }

      let silenceCounter = 0
      let isSilent = false

      const detectSilence = () => {
        analyser.getByteTimeDomainData(dataArray)
        let sumSquares = 0.0
        for (let i = 0; i < bufferLength; i++) {
          const normalized = (dataArray[i] / 128.0) - 1.0
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / bufferLength)
        rmsBuffer.shift()
        rmsBuffer.push(rms)
        const avgRMS = rmsBuffer.reduce((sum, val) => sum + val, 0) / rmsBuffer.length
        const db = 20 * Math.log10(Math.max(avgRMS, minRMSValue)) * -1

        // if (avgRMS > 0) {
        //   dynamicSilenceThreshold = Math.max(dynamicSilenceThreshold, db - 10)
        // }

        isSilent = (db > silenceThreshold)
        isSilent ? silenceCounter++ : silenceCounter = 0

        if (silenceCounter > 499) {
          stopListening()
          silenceCounter = 0
        } else {
          requestAnimationFrame(detectSilence)
        }
      }

      detectSilence();
    })
    .catch(error => console.error('Error accessing media devices:', error))
  isRecording.value = true
}

const stopListening = () => {
  if (!mediaRecorder) return
  mediaRecorder.stop()
  audioChunks = []
  isRecording.value = false
}

const toggleRecording = () => {
  isRecordingRequested.value = !isRecordingRequested.value
  if (!isRecordingRequested.value) {
    stopListening()
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
      const audioBuffer = await audioContext.value.decodeAudioData(audioDataURI as ArrayBuffer)
      audioSource.value = audioContext.value.createBufferSource()

      audioSource.value.buffer = audioBuffer
      audioSource.value.connect(audioContext.value.destination)
      audioSource.value.onended = () => {
        statusMessage.value = 'Stand by'
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
    audioSource?.value.start()
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
  await playAudio(audioURI as string)
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
    (window as any).electron.resize({ width: 1200, height: 500 })
  } else {
    (window as any).electron.resize({ width: 500, height: 500 })
  }
}

const toggleMinimize = async () => {
  isMinimized.value = !isMinimized.value
  await nextTick()
  if (isMinimized.value) {
    (window as any).electron.mini({minimize:true})
  } else {
    (window as any).electron.mini({minimize:false})
  }
}

onMounted(async () => {
  await conversationStore.createNewThread()
  await processRequest('Hi Alice! Lets get it rolling.')
})
</script>

<style scoped lang="postcss">
.avatar-wrapper {
  height:500px;
  &.mini {
    height:200px;
  }
}
.indicator {
  cursor: pointer;
  transition: all 0.3s ease-in-out;
  @apply p-2 rounded-full touch-auto w-14; 
  &:hover {
    @apply bg-primary bg-opacity-10;
  }
  &.mini {
    @apply w-4 h-4 p-0;
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
