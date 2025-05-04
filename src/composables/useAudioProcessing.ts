import { ref, watch, onUnmounted } from 'vue'
import * as vad from '@ricky0123/vad-web'
import { float32ArrayToWav } from '../utils/audioProcess'
import { useGeneralStore } from '../stores/generalStore'
import { useConversationStore } from '../stores/openAIStore'
import { storeToRefs } from 'pinia'
import eventBus from '../utils/eventBus'

export function useAudioProcessing() {
  const generalStore = useGeneralStore()
  const conversationStore = useConversationStore()

  const { audioState, isRecordingRequested } = storeToRefs(generalStore)
  const { setAudioState } = generalStore

  const myvad = ref<vad.MicVAD | null>(null)
  const isVadInitializing = ref(false)
  const isSpeechDetected = ref(false)

  const initializeVAD = async () => {
    if (myvad.value || isVadInitializing.value) {
      console.log('VAD init skipped: Already initialized or initializing.')
      return
    }

    console.log('[VAD Manager] Initializing VAD...')
    isVadInitializing.value = true
    isSpeechDetected.value = false

    await destroyVAD()

    try {
      const vadInstance = await vad.MicVAD.new({
        baseAssetPath: './',
        onnxWASMBasePath: './',
        onSpeechStart: () => {
          isSpeechDetected.value = true
          console.log('[VAD Callback] Speech started.')
        },
        onSpeechEnd: (audio: Float32Array) => {
          console.log(
            `[VAD Callback] Speech ended. Audio length: ${audio?.length}. Current state: ${audioState.value}`
          )
          if (audioState.value === 'LISTENING' && isSpeechDetected.value) {
            processAudioRecording(audio)
          } else {
            console.log(
              '[VAD Callback] Speech ended, but not processing (state changed or no speech detected).'
            )
            if (audioState.value === 'LISTENING') {
              isSpeechDetected.value = false
            }
          }
        },
      })

      myvad.value = vadInstance
      myvad.value.start()
      console.log('[VAD Manager] VAD initialized and started successfully.')
    } catch (error) {
      console.error('[VAD Manager] VAD initialization failed:', error)
      setAudioState('IDLE')
      generalStore.statusMessage = 'Error: Mic/VAD init failed'
    } finally {
      isVadInitializing.value = false
    }
  }

  const destroyVAD = async () => {
    if (!myvad.value) {
      return
    }

    console.log('[VAD Manager] Destroying VAD instance...')
    try {
      myvad.value.pause()
      console.log('[VAD Manager] VAD paused.')
    } catch (error) {
      console.error('[VAD Manager] Error pausing VAD:', error)
    } finally {
      myvad.value = null
      console.log('[VAD Manager] VAD instance reference removed.')
    }
  }

  const processAudioRecording = async (audio: Float32Array) => {
    if (audioState.value !== 'LISTENING' || !audio || audio.length === 0) {
      console.warn(
        '[Audio Processing] Processing aborted (invalid state or no audio).'
      )
      return
    }

    console.log('[Audio Processing] Starting audio processing...')
    setAudioState('PROCESSING_AUDIO')

    try {
      const wavBuffer = float32ArrayToWav(audio, 16000)
      console.log(
        '[Audio Processing] Converted to WAV, sending for transcription...'
      )

      const transcription =
        await conversationStore.transcribeAudioMessage(wavBuffer)
      console.log('[Audio Processing] Received transcription:', transcription)

      if (transcription && transcription.trim()) {
        generalStore.recognizedText = transcription
        eventBus.emit('processing-complete', transcription)
      } else {
        console.log('[Audio Processing] No speech detected in transcription.')
        setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
        isSpeechDetected.value = false
      }
    } catch (error) {
      console.error('[Audio Processing] Error during transcription:', error)
      generalStore.statusMessage = 'Error: Transcription failed'
      setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      isSpeechDetected.value = false
    }
  }

  watch(audioState, (newState, oldState) => {
    console.log(
      `[VAD Watcher] Audio state changed from ${oldState} to ${newState}`
    )
    if (newState === 'LISTENING') {
      initializeVAD()
    } else if (oldState === 'LISTENING' && newState !== 'LISTENING') {
      destroyVAD()
    }
  })

  watch(isRecordingRequested, requested => {
    console.log(`[VAD Watcher] Recording requested changed: ${requested}`)
    const currentState = audioState.value

    if (requested) {
      if (currentState === 'IDLE') {
        setAudioState('LISTENING')
      }
    } else {
      if (currentState === 'LISTENING' || currentState === 'PROCESSING_AUDIO') {
        setAudioState('IDLE')
      }
    }
  })

  const toggleRecordingRequest = () => {
    isRecordingRequested.value = !isRecordingRequested.value
    console.log(
      `Recording request toggled via UI: ${isRecordingRequested.value}`
    )
  }

  onUnmounted(() => {
    console.log('[Audio Processing] Component unmounted, ensuring VAD cleanup.')
    destroyVAD()
  })

  return {
    toggleRecordingRequest,
  }
}
