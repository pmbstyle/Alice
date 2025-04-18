import { ref, watch, nextTick } from 'vue'
import { defineStore } from 'pinia'
import { Content } from '../api/gemini/liveApiClient'
import { useConversationStore } from './conversationStore'

interface RawAudioQueueItem {
  audioData: Float32Array
  sampleRate: number
}

export const useGeneralStore = defineStore('general', () => {
  const isRecordingRequested = ref<boolean>(false)
  const isRecording = ref<boolean>(false)
  const aiVideo = ref<HTMLVideoElement | null>(null)
  const videoSource = ref<string>('')
  const isPlaying = ref<boolean>(false)
  const isProcessingRequest = ref<boolean>(false)
  const isTTSProcessing = ref<boolean>(false)
  const audioContext = ref<AudioContext | null>(null)
  const gainNode = ref<GainNode | null>(null)
  const currentAudioSource = ref<AudioBufferSourceNode | null>(null)
  const chatHistory = ref<Content[]>([])
  const statusMessage = ref<string>('Ready')
  const audioQueue = ref<RawAudioQueueItem[]>([])
  const chatInput = ref<string>('')
  const recognizedText = ref<string>('')
  const openChat = ref<boolean>(false)
  const isMinimized = ref<boolean>(false)
  const storeMessage = ref<boolean>(false)
  const takingScreenShot = ref<boolean>(false)
  const updateVideo = ref<(type: string) => void>(() => {})
  const scheduledTime = ref(0)
  let justStartedSpeaking = false

  const ensureAudioContext = async (): Promise<boolean> => {
    if (audioContext.value && audioContext.value.state === 'running') {
      return true
    }
    if (audioContext.value && audioContext.value.state === 'suspended') {
      try {
        await audioContext.value.resume()
        console.log('Resumed existing AudioContext.')
        return true
      } catch (e) {
        console.error(
          'Error resuming suspended AudioContext, will create new.',
          e
        )
        if (audioContext.value) {
          await audioContext.value
            .close()
            .catch(closeErr =>
              console.warn('Error closing failed context:', closeErr)
            )
        }
        audioContext.value = null
        gainNode.value = null
      }
    }
    if (!audioContext.value || audioContext.value.state === 'closed') {
      try {
        const newContext = new AudioContext()
        audioContext.value = newContext
        gainNode.value = newContext.createGain()
        gainNode.value.connect(newContext.destination)
        scheduledTime.value = newContext.currentTime
        return true
      } catch (e) {
        console.error('Failed to create AudioContext:', e)
        statusMessage.value = 'Audio Init Error'
        audioContext.value = null
        gainNode.value = null
        return false
      }
    }
    console.warn(
      'ensureAudioContext reached unexpected state:',
      audioContext.value?.state
    )
    return false
  }

  const forceStopAudioPlayback = () => {
    if (
      !isPlaying.value &&
      audioQueue.value.length === 0 &&
      !currentAudioSource.value
    ) {
      return
    }
    console.log('Force stopping audio playback.')
    justStartedSpeaking = false
    if (currentAudioSource.value) {
      try {
        currentAudioSource.value.onended = null
        currentAudioSource.value.stop()
        currentAudioSource.value.disconnect()
      } catch (e) {
        console.warn('Error stopping current audio source:', e)
      }
      currentAudioSource.value = null
    }
    audioQueue.value = []
    isPlaying.value = false
    isTTSProcessing.value = false

    if (isRecording.value || isRecordingRequested.value) {
      statusMessage.value = 'Listening...'
    } else if (!isProcessingRequest.value) {
      statusMessage.value = 'Ready'
      updateVideo.value('STAND_BY')
    } else {
    }
  }

  const playAudioRaw = async (
    float32Data: Float32Array,
    sampleRate: number
  ) => {
    if (!(await ensureAudioContext())) {
      console.error('Audio context not available for playAudioRaw.')
      return
    }
    if (!float32Data || float32Data.length === 0) {
      console.warn('playAudioRaw received empty audio data.')
      return
    }

    audioQueue.value.push({ audioData: float32Data, sampleRate })

    if (!isPlaying.value) {
      isPlaying.value = true
      justStartedSpeaking = true
      playNextAudioRaw()
    }
  }

  const playNextAudioRaw = async () => {
    const conversationStore = useConversationStore()

    if (!isPlaying.value) {
      audioQueue.value = []
      currentAudioSource.value = null
      conversationStore.checkAndSendBufferedTurn()
      if (!isProcessingRequest.value) {
        statusMessage.value = 'Ready'
      }
      return
    }

    if (audioQueue.value.length === 0) {
      return
    }

    if (!(await ensureAudioContext()) || !audioContext.value) {
      console.error('Audio context not ready for playNextAudioRaw.')
      isPlaying.value = false
      statusMessage.value = 'Playback Error'
      return
    }

    if (justStartedSpeaking) {
      statusMessage.value = 'Speaking...'
      justStartedSpeaking = false
    }

    const currentAudioItem = audioQueue.value.shift()
    if (!currentAudioItem) {
      console.warn('playNextAudioRaw: Shifted null item from queue.')
      if (audioQueue.value.length === 0 && isPlaying.value) {
        isPlaying.value = false
        currentAudioSource.value = null
        conversationStore.checkAndSendBufferedTurn()
        if (!isProcessingRequest.value) {
          statusMessage.value = 'Ready'
        }
      } else if (isPlaying.value) {
        playNextAudioRaw()
      }
      return
    }

    const { audioData, sampleRate } = currentAudioItem
    const currentContext = audioContext.value

    try {
      const audioBuffer = currentContext.createBuffer(
        1,
        audioData.length,
        sampleRate
      )
      audioBuffer.getChannelData(0).set(audioData)
      const sourceNode = currentContext.createBufferSource()
      sourceNode.buffer = audioBuffer

      if (!gainNode.value || gainNode.value.context !== currentContext) {
        console.warn('Recreating GainNode.')
        gainNode.value = currentContext.createGain()
        gainNode.value.connect(currentContext.destination)
      }

      sourceNode.connect(gainNode.value)
      currentAudioSource.value = sourceNode

      sourceNode.onended = () => {
        if (currentAudioSource.value === sourceNode) {
          currentAudioSource.value = null
        }
        sourceNode.disconnect()

        if (isPlaying.value) {
          if (audioQueue.value.length === 0) {
            isPlaying.value = false
            conversationStore.checkAndSendBufferedTurn()
            if (!isProcessingRequest.value) {
              statusMessage.value = 'Ready'
            } else {
            }
          } else {
            playNextAudioRaw()
          }
        } else {
          audioQueue.value = []
        }
      }

      gainNode.value.gain.setValueAtTime(1.0, currentContext.currentTime)
      const calculatedStartTime = Math.max(
        currentContext.currentTime,
        scheduledTime.value
      )
      sourceNode.start(calculatedStartTime)
      scheduledTime.value = calculatedStartTime + audioBuffer.duration
    } catch (error) {
      console.error('Error playing raw audio chunk:', error)
      statusMessage.value = 'Playback Error'
      forceStopAudioPlayback()
    }
  }

  const ttsAudioPlayer = ref<HTMLAudioElement | null>(null)
  const playAudioTTS = async (text: string, isTTS: boolean = true) => {
    if (!isTTS || !text.trim()) return
    if (!ttsAudioPlayer.value) {
      const player = new Audio()
      player.addEventListener('ended', onTtsEnded)
      player.addEventListener('error', onTtsError)
      document.body.appendChild(player)
      player.style.display = 'none'
      ttsAudioPlayer.value = player
    }
    const audioPlayerElement = ttsAudioPlayer.value
    const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API Key for TTS is missing!')
      statusMessage.value = 'TTS Config Error'
      return
    }
    const audioFormat = 'mp3'
    forceStopAudioPlayback()
    justStartedSpeaking = true
    isTTSProcessing.value = true
    isPlaying.value = true
    statusMessage.value = 'Generating speech...'
    updateVideo.value('PROCESSING')
    let audioUrl: string | null = null
    try {
      const ttsResponse = await fetch(
        'https://api.openai.com/v1/audio/speech',
        {
          /* ... options ... */
        }
      )
      if (!ttsResponse.ok || !ttsResponse.body)
        throw new Error('TTS API failed')
      const audioBlob = await ttsResponse.blob()
      audioUrl = URL.createObjectURL(audioBlob)
      audioPlayerElement.src = audioUrl
      await audioPlayerElement.play()
      if (isPlaying.value && justStartedSpeaking) {
        statusMessage.value = 'Speaking...'
        justStartedSpeaking = false
      }
    } catch (error) {
      console.error('Error generating or playing TTS:', error)
      statusMessage.value = 'TTS Error'
      cleanupTts(audioUrl)
    }
  }
  const cleanupTts = (audioUrl: string | null) => {
    isPlaying.value = false
    isTTSProcessing.value = false
    justStartedSpeaking = false
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (!isProcessingRequest.value && audioQueue.value.length === 0)
      statusMessage.value = 'Ready'
    const conversationStore = useConversationStore()
    conversationStore.checkAndSendBufferedTurn()
  }
  const onTtsEnded = () => {
    const currentSrc = ttsAudioPlayer.value?.src
    cleanupTts(currentSrc || null)
  }
  const onTtsError = (e: Event) => {
    console.error('HTML Audio Player Error (TTS):', e)
    const currentSrc = ttsAudioPlayer.value?.src
    cleanupTts(currentSrc || null)
    statusMessage.value = 'TTS Playback Error'
  }

  watch(statusMessage, (newStatus, oldStatus) => {
    if (isPlaying.value) {
      if (newStatus === 'Speaking...') updateVideo.value('SPEAKING')
      return
    }
    switch (newStatus) {
      case 'Generating speech...':
      case 'Processing function results...':
      case 'Executing function...':
      case 'Sending message...':
      case 'Sending image...':
      case 'Image sent, processing...':
      case 'Connecting...':
      case 'Initializing session...':
      case 'Processing...':
      case 'Listening...':
        updateVideo.value('PROCESSING')
        break
      default:
        updateVideo.value('STAND_BY')
        break
    }
  })

  watch(
    [isProcessingRequest, isPlaying, isTTSProcessing, isRecording],
    (
      [processing, playing, ttsGen, recording],
      [oldProcessing, oldPlaying, oldTtsGen, oldRecording]
    ) => {
      const wasActive = oldProcessing || oldPlaying || oldTtsGen || oldRecording
      const isActive = processing || playing || ttsGen || recording

      if (wasActive && !isActive && audioQueue.value.length === 0) {
        const isErrorOrFinal =
          statusMessage.value.includes('Error') ||
          statusMessage.value.includes('Failed') ||
          statusMessage.value === 'Interrupted' ||
          statusMessage.value === 'Stopped' ||
          statusMessage.value === 'Session closed'

        if (!isErrorOrFinal) {
          statusMessage.value = 'Ready'
        }
      }
    }
  )

  return {
    recognizedText,
    isRecordingRequested,
    isRecording,
    aiVideo,
    videoSource,
    isPlaying,
    isProcessingRequest,
    chatHistory,
    statusMessage,
    chatInput,
    openChat,
    isMinimized,
    storeMessage,
    takingScreenShot,
    updateVideo,
    audioQueue,
    isTTSProcessing,
    playAudioRaw,
    playAudioTTS,
    playNextAudioRaw,
    forceStopAudioPlayback,
    ensureAudioContext,
  }
})
