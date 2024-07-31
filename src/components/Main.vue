<template>
    <div class="h-screen flex w-full items-center justify-start relative">
      <div class="avatar-wrapper flex container h-full items-center justify-center relative z-2" :class="{'mini':isMinimized}">
        <div class="avatar" :class="{'open': openChat}">
          <div
            class="avatar-ring"
            :class="{ 'ring-success': isPlaying, 'w-[200px] h-[200px]':isMinimized, 'w-[480px] h-[480px]': !isMinimized }"
            :style="{backgroundImage:`url('${bg}'`}">
            <audio ref="audioPlayer" class="hidden"></audio>
            <video class="max-w-screen-md rounded-full ring"
              :class="{'h-[200px]':isMinimized, 'h-[480px]': !isMinimized }"
              ref="aiVideo" :src="videoSource" loop muted :autoplay="isPlaying"></video>
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
            <div class="absolute w-full px-2 flex justify-between z-80" :class="{'top-[80px]':isMinimized, 'top-[220px]':!isMinimized}">
              <button
                class="btn btn-circle bg-disabled border-0 p-2 btn-indicator-side tooltip tooltip-right"
                data-tip="Screenshot"
                :class="{'btn-sm':isMinimized}"
                @click="takeScreenShot">
                  <img :src="takingScreenShot ? uploadIcon : cameraIcon" class="indicator indicator-side" :class="{'mini':isMinimized}"/>
              </button>
              <button
                class="btn btn-circle bg-default border-0 p-2 btn-indicator-side tooltip tooltip-left"
                :data-tip="isMinimized ? 'Maximize' : 'Minimize'"
                :class="{'btn-sm':isMinimized}"
                @click="toggleMinimize">
                  <img :src="isMinimized ? maxiIcon : miniIcon" class="indicator indicator-side" :class="{'mini':isMinimized}"/>
              </button>
            </div>
            <div class="absolute w-full flex justify-center z-80 top-2">
              <button
                class="btn btn-circle bg-disabled border-0 p-2 btn-indicator-side close tooltip tooltip-bottom"
                data-tip="Close Link"
                :class="{'btn-sm':isMinimized}"
                @click="closeWindow()">
                  <img :src="closeIcon" class="indicator indicator-side"/>
              </button>
            </div>
          </div>
        </div>
        <Chat @processRequest="processRequest"/>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  import Chat from './Chat.vue'
  import {
    bg,
    micIcon,
    micIconActive,
    speakerIcon,
    speakerIconInactive,
    chatIcon,
    miniIcon,
    maxiIcon,
    cameraIcon,
    uploadIcon,
    closeIcon
  } from '../utils/assetsImport.ts'

  import { setVideo } from '../utils/videoProcess.ts'
  
  import { ref, onMounted, nextTick } from 'vue'
  import { useGeneralStore } from '../stores/generalStore.ts'
  import { useConversationStore } from '../stores/openAIStore.ts'
  import { storeToRefs } from 'pinia'
  
  
  const generalStore = useGeneralStore()
  const conversationStore = useConversationStore()
  
  const {
    recognizedText,
    isRecordingRequested,
    isRecording,
    audioPlayer,
    aiVideo,
    videoSource,
    isPlaying,
    isInProgress,
    chatHistory,
    statusMessage,
    audioContext,
    audioSource,
    chatInput,
    openChat,
    isMinimized,
    storeMessage
  } = storeToRefs(generalStore)
  
  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: BlobPart[] = []
  
  const silenceThreshold = 43
  const minRMSValue = 1e-10
  const bufferLength = 10
  let rmsBuffer = Array(bufferLength).fill(0)
  
  const screenShot = ref<string>('')
  const takingScreenShot = ref<boolean>(false)
  
  const startListening = () => {
    if(!isRecordingRequested.value) return
    statusMessage.value = 'Listening'
    updateVideo('STAND_BY')
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
          storeMessage.value = true
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
    statusMessage.value = 'Stand by'
    updateVideo('STAND_BY')
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
  
  const togglePlaying = () => {
    if (isPlaying.value) {
      audioPlayer.value?.pause()
      updateVideo('STAND_BY')
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
      audioSource.value?.start()
      isPlaying.value = true
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
          updateVideo('STAND_BY')
          startListening()
        }
        audioSource.value.start()
        statusMessage.value = 'Playing response'
        if (audioPlayer.value) {
          audioPlayer.value.src = audioDataURI
          updateVideo('SPEAKING')
          await audioPlayer.value.play()
        }
      }
    }
  }
  
  const processRequest = async (text:string) => {
    statusMessage.value = 'Processing'
    updateVideo('PROCESSING')
    const prompt = await conversationStore.createOpenAIPrompt(text, storeMessage.value)
    console.log('prompt:',prompt)
    await conversationStore.sendMessageToThread(prompt.message, storeMessage.value)
    scrollChat()
    chatInput.value = ''
    const audioURI = await conversationStore.chat(prompt.history)
    await playAudio(audioURI as string)
    updateVideo('SPEAKING')
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
      if(openChat.value) {
        toggleChat()
        setTimeout(() => {
          (window as any).electron.mini({minimize:true})
        }, 1000)
      } else {
        (window as any).electron.mini({minimize:true})
      }
    } else {
      (window as any).electron.mini({minimize:false})
    }
  }
  
  const takeScreenShot = async () => {
    if(!takingScreenShot.value) {
      takingScreenShot.value = true
      statusMessage.value = 'Taking a screenshot'
      await (window as any).electron.showOverlay()
    } else {
      const dataURI = await (window as any).ipcRenderer.invoke('get-screenshot')
      console.log('vue dataURI:', dataURI)
      screenShot.value = dataURI
      statusMessage.value = 'Screenshot taken'
      const description = await conversationStore.describeImage(screenShot.value)
      let prompt = {role: 'user', content:'Here is a description of the users screenshot: [start screenshot]'+JSON.stringify(description)+'[/end screenshot]'}
      await conversationStore.sendMessageToThread(prompt, false)
      statusMessage.value = 'Screenshot stored'
      takingScreenShot.value = false
    }
  }
  const updateVideo = async (type: string) => {
    const playVideo = async (videoType: string) => {
      videoSource.value = setVideo(videoType)
      await nextTick()
      aiVideo.value?.play()
    }
    await playVideo(type)
  }

  const closeWindow = () => {
    (window as any).electron.closeApp()
  }
  
  onMounted(async () => {
    await conversationStore.createNewThread()
    updateVideo('STAND_BY')
  })
  </script>
  
  <style scoped lang="postcss">
  .avatar-wrapper {
    height:500px;
    &.mini {
      height:200px;
    }
    .avatar-ring {
      @apply rounded-full ring ring-offset-base-100 ring-offset-2
      relative overflow-hidden !flex justify-center items-center
      z-20 bg-no-repeat bg-cover bg-center shadow-md;
    }
    .avatar:hover {
      .btn-indicator-side {
        opacity: 1;
      }
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
    &.indicator-side {
      @apply rounded-none p-0;
      &:hover {
        @apply bg-opacity-0;
      }
    }
  }

  .btn-indicator-side {
    transition: all 0.3s ease-in-out;
    opacity:0;
    @apply bg-opacity-30;
    &:hover {
      @apply bg-opacity-80;
      &.close {
        @apply bg-red-500;
      }
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
  </style>
  