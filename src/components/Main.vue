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
            <Actions
              @takeScreenShot="takeScreenShot"
              @togglePlaying="togglePlaying"
              @toggleRecording="toggleRecording"
            />
          </div>
        </div>
        <Chat @processRequest="processRequest"/>
      </div>
    </div>
</template>

<script setup lang="ts">
  import Actions from './Actions.vue'
  import Chat from './Chat.vue'
  import { bg } from '../utils/assetsImport.ts'
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
    statusMessage,
    audioContext,
    audioSource,
    chatInput,
    openChat,
    isMinimized,
    storeMessage,
    takingScreenShot
  } = storeToRefs(generalStore)

  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: BlobPart[] = []

  const silenceThreshold = 43
  const minRMSValue = 1e-10
  const bufferLength = 10
  let rmsBuffer = Array(bufferLength).fill(0)

  const screenShot = ref<string>('')

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
}

.avatar{
  transition: all .1s ease-in-out;
  &.open {
    @apply pr-[505px];
  }
}
</style>
  