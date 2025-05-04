import { ref, onMounted } from 'vue'
import * as vad from '@ricky0123/vad-web'
import { float32ArrayToWav } from '../utils/audioProcess'
import { useGeneralStore } from '../stores/generalStore'
import { useConversationStore } from '../stores/openAIStore'
import { storeToRefs } from 'pinia'
import eventBus from '../utils/eventBus'

export function useAudioProcessing() {
  const generalStore = useGeneralStore()
  const conversationStore = useConversationStore()

  const {
    recognizedText,
    isRecordingRequested,
    isRecording,
    statusMessage,
    isTTSProcessing,
  } = storeToRefs(generalStore)

  let myvad: vad.MicVAD | null = null
  const isProcessingAudio = ref(false)
  const processingDebounceTimer = ref<number | null>(null)
  let audioChunks: BlobPart[] = []
  let mediaRecorder: MediaRecorder | null = null

  const startListening = () => {
    if (!isRecordingRequested.value || isTTSProcessing.value) return
    statusMessage.value = 'Listening'
    recognizedText.value = ''

    if (myvad) {
      try {
        myvad.pause()
        myvad = null
      } catch (error) {
        console.error('Error cleaning up previous VAD instance:', error)
      }
    }

    vad.MicVAD.new({
      baseAssetPath: './',
      onnxWASMBasePath: './',
      onSpeechStart: () => {
        isRecording.value = true
        console.log('Speech started - recording active')
      },
      onSpeechEnd: (audio: Float32Array) => {
        console.log('Speech ended - processing recording')
        if (isRecording.value && !isProcessingAudio.value) {
          stopRecording(audio)
        }
      },
    })
      .then(vadInstance => {
        myvad = vadInstance
        myvad.start()
        console.log('VAD started - listening for speech')
      })
      .catch(err => {
        console.error('VAD initialization error:', err)
        statusMessage.value = 'Error initializing VAD'
      })
  }

  const stopRecording = (audio: Float32Array) => {
    console.log('Stop recording called with audio length:', audio?.length || 0)
    if (mediaRecorder) {
      mediaRecorder.stop()
      mediaRecorder = null
    }

    if (processingDebounceTimer.value) {
      clearTimeout(processingDebounceTimer.value)
    }

    processingDebounceTimer.value = window.setTimeout(() => {
      if (!isProcessingAudio.value) {
        processAudioRecording(audio)
      }
    }, 300)
  }

  const processAudioRecording = async (
    audio?: Float32Array
  ): Promise<string> => {
    if (isProcessingAudio.value) return ''
    console.log('Processing audio recording...')

    try {
      isProcessingAudio.value = true
      statusMessage.value = 'Processing audio...'

      if (audio && audio.length > 0) {
        const wavBuffer = float32ArrayToWav(audio, 16000)
        console.log('Converted audio to WAV, sending for transcription...')
        const transcription =
          await conversationStore.transcribeAudioMessage(wavBuffer)
        console.log('Received transcription:', transcription)

        recognizedText.value = transcription

        if (transcription.trim()) {
          eventBus.emit('processing-complete', transcription)
          return transcription
        } else {
          console.log('No speech detected in transcription')
          statusMessage.value = 'No speech detected'
        }
      } else {
        console.log('No audio data captured')
        statusMessage.value = 'No audio data captured'
      }
    } catch (error) {
      console.error('Error processing audio:', error)
      statusMessage.value = 'Error processing audio'
    } finally {
      audioChunks = []
      stopListening()
      isProcessingAudio.value = false
      console.log('Audio processing complete')
    }
    return ''
  }

  const stopListening = () => {
    console.log('Stopping listening')
    if (myvad) {
      try {
        myvad.pause()
        myvad.destroy()
        myvad = null
      } catch (error) {
        console.error('Error stopping VAD:', error)
      }
    }

    if (processingDebounceTimer.value) {
      clearTimeout(processingDebounceTimer.value)
      processingDebounceTimer.value = null
    }

    isRecording.value = false
  }

  const toggleRecording = () => {
    isRecordingRequested.value = !isRecordingRequested.value
    console.log('Recording toggled:', isRecordingRequested.value ? 'ON' : 'OFF')

    if (!isRecordingRequested.value) {
      stopListening()
    } else {
      if (myvad) {
        try {
          myvad.pause()
          myvad = null
        } catch (error) {
          console.error('Error cleaning up VAD:', error)
        }
      }
      isProcessingAudio.value = false
      if (processingDebounceTimer.value) {
        clearTimeout(processingDebounceTimer.value)
        processingDebounceTimer.value = null
      }
      isRecording.value = true
      startListening()
    }
  }

  onMounted(() => {
    eventBus.on('start-listening', startListening)
    eventBus.on('stop-listening', stopListening)
  })

  return {
    startListening,
    stopListening,
    toggleRecording,
    processAudioRecording,
  }
}
