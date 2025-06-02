import { ref, watch, onUnmounted, onMounted } from 'vue'
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
  const vadAssetBasePath = ref<string>('./')

  const handleGlobalMicToggle = () => {
    console.log('[AudioProcessing] Global hotkey for mic toggle received.')
    toggleRecordingRequest()
  }

  const handleGlobalMutePlayback = () => {
    console.log('[AudioProcessing] Global hotkey for mute playback received.')
    eventBus.emit('mute-playback-toggle')
  }

  const handleGlobalTakeScreenshot = () => {
    console.log('[AudioProcessing] Global hotkey for take screenshot received.')
    eventBus.emit('take-screenshot')
  }

  onMounted(async () => {
    if (
      window.location.protocol === 'file:' &&
      window.electronPaths?.getRendererDistPath
    ) {
      try {
        const rendererDistPath =
          await window.electronPaths.getRendererDistPath()
        let fileUrlPath = rendererDistPath.replace(/\\/g, '/')
        if (fileUrlPath.match(/^[A-Za-z]:\//)) {
          fileUrlPath = `/${fileUrlPath}`
        }
        vadAssetBasePath.value = `file://${fileUrlPath}/`
        console.log(
          '[VAD Asset Path] Electron production, IPC derived base path:',
          vadAssetBasePath.value
        )
      } catch (error) {
        console.error(
          'Failed to get rendererDistPath via IPC. Falling back.',
          error
        )
        let path = window.location.href
        path = path.split('#')[0]
        path = path.substring(0, path.lastIndexOf('/') + 1)
        vadAssetBasePath.value = path
        console.warn(
          '[VAD Asset Path] IPC failed, fallback to href derived path:',
          vadAssetBasePath.value
        )
      }
    } else if (window.location.protocol === 'file:') {
      console.warn(
        '[VAD Asset Path] Electron production, but electronPaths API not found. Using relative path "./". This might fail.'
      )
      vadAssetBasePath.value = './'
    } else {
      console.log(
        '[VAD Asset Path] Development/Web, using relative base path "./"'
      )
      vadAssetBasePath.value = './'
    }
    if (window.ipcRenderer) {
      window.ipcRenderer.on('global-hotkey-mic-toggle', handleGlobalMicToggle)
      window.ipcRenderer.on('global-hotkey-mute-playback', handleGlobalMutePlayback)
      window.ipcRenderer.on('global-hotkey-take-screenshot', handleGlobalTakeScreenshot)
    }
  })

  const initializeVAD = async () => {
    if (myvad.value || isVadInitializing.value) {
      console.log('VAD init skipped: Already initialized or initializing.')
      return
    }
    if (
      vadAssetBasePath.value === './' &&
      window.location.protocol === 'file:'
    ) {
      console.warn(
        '[VAD Manager] Attempting to initialize VAD, but asset path might not be fully resolved yet. Waiting briefly...'
      )
      await new Promise(resolve => setTimeout(resolve, 200))
      if (vadAssetBasePath.value === './') {
        console.error(
          "[VAD Manager] CRITICAL: VAD asset path still './' in file protocol after delay. VAD will likely fail."
        )
      }
    }

    console.log('[VAD Manager] Initializing VAD...')
    isVadInitializing.value = true
    isSpeechDetected.value = false

    await destroyVAD()

    try {
      const assetPath = vadAssetBasePath.value
      console.log(
        `[VAD Manager] Attempting to load VAD with baseAssetPath: ${assetPath}`
      )

      const vadInstance = await vad.MicVAD.new({
        baseAssetPath: assetPath,
        onnxWASMBasePath: assetPath,
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
            isSpeechDetected.value = false
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
      isSpeechDetected.value = false
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
      isSpeechDetected.value = false
      console.log('[VAD Manager] VAD instance reference removed.')
    }
  }

  const processAudioRecording = async (audio: Float32Array) => {
    if (audioState.value !== 'LISTENING' || !audio || audio.length === 0) {
      console.warn(
        '[Audio Processing] Processing aborted (invalid state or no audio).'
      )
      isSpeechDetected.value = false
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
      if (!myvad.value && !isVadInitializing.value) {
        initializeVAD()
      } else if (myvad.value && myvad.value.paused) {
        try {
          myvad.value.start()
          console.log(
            '[VAD Manager] VAD instance existed and was paused, restarted.'
          )
          isSpeechDetected.value = false
        } catch (e) {
          console.error(
            '[VAD Manager] Error restarting existing VAD instance, re-initializing.',
            e
          )
          initializeVAD()
        }
      } else if (isVadInitializing.value) {
        console.log(
          '[VAD Watcher] VAD is already initializing. Will not call initializeVAD again.'
        )
      } else {
        console.log(
          '[VAD Watcher] VAD instance already exists and is not paused.'
        )
        isSpeechDetected.value = false
      }
    } else if (oldState === 'LISTENING' && newState !== 'LISTENING') {
      if (myvad.value) {
        destroyVAD()
      }
    }
  })

  watch(isRecordingRequested, (requested, oldRequestedValue) => {
    console.log(
      `[VAD Watcher] isRecordingRequested changed from ${oldRequestedValue} to ${requested}. Current audioState: ${audioState.value}`
    )
    const currentState = audioState.value

    if (requested) {
      if (currentState === 'IDLE' || currentState === 'CONFIG') {
        setAudioState('LISTENING')
      } else if (
        currentState === 'SPEAKING' ||
        currentState === 'WAITING_FOR_RESPONSE'
      ) {
        console.log(
          `[VAD Watcher] Recording requested while Alice is ${currentState}. Will listen after current action.`
        )
      } else if (currentState === 'PROCESSING_AUDIO') {
        console.log(
          '[VAD Watcher] Recording requested during audio processing. Will listen after.'
        )
      }
    } else {
      if (currentState === 'LISTENING') {
        setAudioState('IDLE')
      } else if (currentState === 'PROCESSING_AUDIO') {
        console.log(
          '[VAD Watcher] Recording stopped request during audio processing. Will go to IDLE after if no TTS.'
        )
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
    if (window.ipcRenderer) {
      window.ipcRenderer.off('global-hotkey-mic-toggle', handleGlobalMicToggle)
      window.ipcRenderer.off('global-hotkey-mute-playback', handleGlobalMutePlayback)
      window.ipcRenderer.off('global-hotkey-take-screenshot', handleGlobalTakeScreenshot)
    }
  })

  return {
    toggleRecordingRequest,
  }
}
