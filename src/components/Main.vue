<template>
  <div class="h-screen flex w-full items-center justify-start relative">
    <div
      class="avatar-wrapper flex container h-full items-center justify-center relative z-2"
      :class="{ mini: isMinimized }"
    >
      <div class="avatar" :class="{ open: openChat }">
        <div
          class="avatar-ring"
          :class="{
            'ring-success': isPlaying,
            'w-[200px] h-[200px]': isMinimized,
            'w-[480px] h-[480px]': !isMinimized && isElectron,
            'w-[430px] h-[430px]': !isElectron,
          }"
          :style="{ backgroundImage: `url('${bg}'` }"
        >
          <audio ref="audioPlayer" class="hidden"></audio>
          <video
            class="max-w-screen-md rounded-full ring"
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
          />
        </div>
      </div>
      <Chat @processRequest="processRequest" />
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
import { useGeminiStore } from '../stores/geminiStore.ts'
import { storeToRefs } from 'pinia'

const generalStore = useGeneralStore()
const geminiStore = useGeminiStore()
const isElectron = typeof window !== 'undefined' && window?.electron

const {
  recognizedText,
  isRecordingRequested,
  isRecording,
  audioPlayer,
  aiVideo,
  videoSource,
  isPlaying,
  statusMessage,
  chatInput,
  openChat,
  isMinimized,
  storeMessage,
  takingScreenShot,
  updateVideo,
} = storeToRefs(generalStore)
generalStore.setProvider('gemini')

let mediaRecorder: MediaRecorder | null = null
let audioChunks: BlobPart[] = []
const screenShot = ref<string>('')

// Audio processing variables
const audioBufferSize = 4096;
const audioSampleRate = 16000; // 16kHz is common for speech recognition
let audioContext: AudioContext | null = null;
let audioProcessor: ScriptProcessorNode | null = null;
let audioSource: MediaStreamAudioSourceNode | null = null;
let audioStream: MediaStream | null = null;

// Start recording audio and streaming to Gemini
const startListening = async () => {
  if (!isRecordingRequested.value) return;
  
  try {
    // First connect to Gemini
    const connected = await geminiStore.connect();
    if (!connected) {
      statusMessage.value = 'Failed to connect to Gemini';
      isRecordingRequested.value = false;
      return;
    }
    
    // Start the audio stream session
    await geminiStore.startAudioStream();
    
    statusMessage.value = 'Listening';
    recognizedText.value = '';

    // Get microphone access
    audioStream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: audioSampleRate
      } 
    });
    
    // Set up audio processing
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: audioSampleRate
    });
    
    audioSource = audioContext.createMediaStreamSource(audioStream);
    audioProcessor = audioContext.createScriptProcessor(audioBufferSize, 1, 1);
    
    // Connect the audio nodes
    audioSource.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
    
    // Process and send audio data
    audioProcessor.onaudioprocess = (e) => {
      if (!isRecordingRequested.value) {
        stopListening();
        return;
      }
      
      const inputBuffer = e.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);
      
      // Check if there's actual audio (not just silence)
      const rms = calculateRMS(inputData);
      
      // Only send if not silence and not too quiet
      if (rms > 0.01) {
        geminiStore.streamAudio(inputData);
      }
    };
    
    isRecording.value = true;
    updateVideo.value('PROCESSING');
    
  } catch (error) {
    console.error('Error starting audio recording:', error);
    statusMessage.value = 'Error accessing microphone';
    handleRecordingError();
  }
}

const calculateRMS = (buffer: Float32Array) => {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / buffer.length)
}

const handleRecordingError = async () => {
  statusMessage.value = 'Recording error';
  isRecording.value = false;
  isRecordingRequested.value = false;
  
  // Clean up audio resources
  stopListening();
  
  await new Promise(resolve => setTimeout(resolve, 1000));
}

const stopListening = async () => {
  // End the audio stream session
  await geminiStore.endAudioStream();
  
  // Clean up audio resources
  if (audioProcessor) {
    audioProcessor.disconnect();
    audioProcessor = null;
  }
  
  if (audioSource) {
    audioSource.disconnect();
    audioSource = null;
  }
  
  if (audioContext && audioContext.state !== 'closed') {
    // Don't close the context, just disconnect
    // audioContext.close();
    // audioContext = null;
  }
  
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }
  
  isRecording.value = false;
  statusMessage.value = 'Stopped listening';
  updateVideo.value('STAND_BY');
}

const toggleRecording = async () => {
  isRecordingRequested.value = !isRecordingRequested.value;
  
  if (isRecordingRequested.value) {
    await startListening();
  } else {
    await stopListening();
  }
}

const togglePlaying = () => {
  isPlaying.value = !isPlaying.value;
  
  if (isPlaying.value) {
    updateVideo.value('SPEAKING');
    // If we're recording, stop it while playing
    if (isRecording.value) {
      stopListening();
      isRecordingRequested.value = false;
    }
  } else {
    updateVideo.value('STAND_BY');
  }
}

const processRequest = async (text: string) => {
  // If we're recording, stop it while processing a text request
  if (isRecording.value) {
    await stopListening();
    isRecordingRequested.value = false;
  }
  
  updateVideo.value('PROCESSING');
  await geminiStore.sendMessage(text);
}

const takeScreenShot = async () => {
  if (!takingScreenShot.value) {
    takingScreenShot.value = true
    statusMessage.value = 'Taking a screenshot'
    await (window as any).electron.showOverlay()
  } else {
    const dataURI = await (window as any).ipcRenderer.invoke('get-screenshot')
    screenShot.value = dataURI
    statusMessage.value = 'Screenshot taken'
    await geminiStore.sendImage(screenShot.value)
    statusMessage.value = 'Screenshot analyzed'
    takingScreenShot.value = false
  }
}

const scrollChat = () => {
  const chatHistoryElement = document.getElementById('chatHistory')
  if (chatHistoryElement) {
    chatHistoryElement.scrollTo({
      top: chatHistoryElement.scrollHeight,
      behavior: 'smooth',
    })
  }
}

onMounted(async () => {
  // Connect to Gemini on mount
  await geminiStore.connect()

  updateVideo.value = async (type: string) => {
    const playVideo = async (videoType: string) => {
      videoSource.value = setVideo(videoType)
      await nextTick()
      aiVideo.value?.play()
    }
    await playVideo(type)
  }

  updateVideo.value('STAND_BY')

  // Set up audio player event listeners
  if (audioPlayer.value) {
    audioPlayer.value.addEventListener('play', () => {
      isPlaying.value = true
      updateVideo.value('SPEAKING')
    })

    audioPlayer.value.addEventListener('ended', () => {
      isPlaying.value = false
      updateVideo.value('STAND_BY')

      // Resume recording if it was requested
      if (isRecordingRequested.value && !isRecording.value) {
        startListening()
      }
    })
  }
})
</script>

<style scoped lang="postcss">
.avatar-wrapper {
  height: 500px;
  &.mini {
    height: 200px;
  }
  .avatar-ring {
    @apply rounded-full ring ring-offset-base-100 ring-offset-2
    relative overflow-hidden !flex justify-center items-center
    z-20 bg-no-repeat bg-cover bg-center shadow-md;
  }
}

.avatar {
  transition: all 0.1s ease-in-out;
  &.open {
    @apply pr-[505px];
  }
}
</style>
