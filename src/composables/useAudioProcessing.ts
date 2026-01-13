import { ref, watch, onUnmounted, onMounted } from 'vue'
import * as vad from '@ricky0123/vad-web'
import { float32ArrayToWav } from '../utils/audioProcess'
import { useGeneralStore } from '../stores/generalStore'
import { useConversationStore } from '../stores/conversationStore'
import { useSettingsStore } from '../stores/settingsStore'
import { storeToRefs } from 'pinia'
import eventBus from '../utils/eventBus'
import { similarityRatio, matchesPhonetically } from '../utils/stringSimilarity'

let ipcListenersRegistered = false

export function useAudioProcessing() {
  const generalStore = useGeneralStore()
  const conversationStore = useConversationStore()
  const settingsStore = useSettingsStore()

  const {
    audioState,
    isRecordingRequested,
    awaitingWakeWord,
    wakeWordDetected,
  } = storeToRefs(generalStore)
  const { setAudioState } = generalStore

  const myvad = ref<vad.MicVAD | null>(null)
  const isVadInitializing = ref(false)
  const isSpeechDetected = ref(false)
  const vadAssetBasePath = ref<string>('./')

  const handleGlobalMicToggle = () => {
    toggleRecordingRequest()
  }

  const handleGlobalMutePlayback = () => {
    eventBus.emit('mute-playback-toggle')
  }

  const handleGlobalTakeScreenshot = () => {
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
    if (window.ipcRenderer && !ipcListenersRegistered) {
      window.ipcRenderer.on('global-hotkey-mic-toggle', handleGlobalMicToggle)
      window.ipcRenderer.on(
        'global-hotkey-mute-playback',
        handleGlobalMutePlayback
      )
      window.ipcRenderer.on(
        'global-hotkey-take-screenshot',
        handleGlobalTakeScreenshot
      )
      ipcListenersRegistered = true
    }
  })

  /**
   * Calculate the RMS (Root Mean Square) energy of an audio signal
   * Returns a value between 0-1 representing the audio loudness
   */
  const calculateAudioEnergy = (audio: Float32Array): number => {
    let sumSquares = 0
    for (let i = 0; i < audio.length; i++) {
      sumSquares += audio[i] * audio[i]
    }
    const rms = Math.sqrt(sumSquares / audio.length)
    return rms
  }

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
        positiveSpeechThreshold: settingsStore.config.vadSpeechThreshold || 0.5,
        negativeSpeechThreshold: 0.15, // Lower threshold to keep listening longer
        minSpeechFrames: Math.floor((settingsStore.config.vadMinSpeechDuration || 500) / 30), // 30ms per frame at 16kHz
        redemptionFrames: 15, // INCREASED: Wait 1500ms after silence before ending (50 frames * 30ms)
        preSpeechPadFrames: 15, // INCREASED: Capture 600ms before speech starts (20 frames * 30ms)
        submitUserSpeechOnPause: false, // Don't end on short pauses
        onSpeechStart: () => {
          if (
            audioState.value === 'SPEAKING' ||
            audioState.value === 'WAITING_FOR_RESPONSE'
          ) {
            console.log(
              `[VAD Barge-In] User interrupted Alice during ${audioState.value}. Stopping processes.`
            )
            eventBus.emit('cancel-llm-stream')
            generalStore.stopPlaybackAndClearQueue()
          }
          isSpeechDetected.value = true
          console.log('[VAD Callback] Speech started.')
        },
        onSpeechEnd: (audio: Float32Array) => {
          const sampleRate = 16000
          const durationMs = (audio.length / sampleRate) * 1000

          console.log(
            `[VAD Callback] Speech ended. Audio length: ${audio?.length} samples (${durationMs.toFixed(0)}ms). Current state: ${audioState.value}`
          )

          if (audioState.value === 'LISTENING' && isSpeechDetected.value) {
            // Calculate audio stats for logging only (not filtering)
            const audioEnergy = calculateAudioEnergy(audio)
            const sampleRate = 16000
            const durationMs = (audio.length / sampleRate) * 1000

            console.log(`[VAD Stats] Audio energy: ${audioEnergy.toFixed(4)}, Duration: ${durationMs.toFixed(0)}ms`)
            console.log('[VAD] Processing audio (filters disabled for wake word detection)')

            // Process ALL audio - no filtering
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

  const checkForWakeWord = (
    transcription: string
  ): { hasWakeWord: boolean; command: string; matchInfo?: string } => {
    // Skip wake word checking if disabled
    if (
      !settingsStore.config.localSttEnabled ||
      !settingsStore.config.localSttWakeWord ||
      settingsStore.config.sttProvider !== 'local'
    ) {
      return { hasWakeWord: true, command: transcription }
    }

    const wakeWord = settingsStore.config.localSttWakeWord.toLowerCase().trim()
    const text = transcription.toLowerCase().trim()
    const sensitivity = settingsStore.config.localSttWakeWordSensitivity || 0.75

    if (!wakeWord) {
      return { hasWakeWord: true, command: transcription }
    }

    // Split into words and only check the FIRST 4 WORDS
    const allWords = text.split(/\s+/)
    const firstWords = allWords.slice(0, 4)

    console.log(`[Wake Word] Checking first ${firstWords.length} words: "${firstWords.join(' ')}"`)

    // Check each of the first 4 words for similarity to wake word
    for (let i = 0; i < firstWords.length; i++) {
      const word = firstWords[i].replace(/[.,!?;:]/g, '') // Remove punctuation

      // Check using phonetic matching first (includes custom mappings like "eyalis")
      // Then fallback to fuzzy similarity matching
      const isMatch = matchesPhonetically(word, wakeWord, sensitivity)

      if (isMatch) {
        // Calculate similarity for logging purposes
        const similarity = similarityRatio(word, wakeWord)
        // Found a match! Check if there's a "hey" or "ok" prefix before it
        let usedPrefix = ''

        if (i > 0) {
          const prevWord = firstWords[i - 1].replace(/[.,!?;:]/g, '')
          if (prevWord === 'hey' || prevWord === 'ok') {
            usedPrefix = prevWord + ' '
          }
        }

        // Extract command: everything AFTER the wake word position
        const commandWords = allWords.slice(i + 1)
        const command = commandWords.join(' ').replace(/^[,.\s]+/, '').trim()

        // Create match info for debugging
        const matchInfo = similarity < 1.0
          ? `Matched "${word}" to "${wakeWord}" (${(similarity * 100).toFixed(0)}% similar)`
          : `Exact match: "${word}"`

        console.log(
          `[Wake Word] ✓ Detected: "${usedPrefix}${word}" at position ${i} ` +
          `(similarity: ${(similarity * 100).toFixed(1)}%)`
        )

        return {
          hasWakeWord: true,
          command: command || transcription, // Fallback to full text if no command
          matchInfo,
        }
      }
    }

    // No match found in first 4 words
    console.log(
      `[Wake Word] ✗ Not detected in first ${firstWords.length} words ` +
      `(threshold: ${(sensitivity * 100).toFixed(0)}%)`
    )

    // Optional: Log the best match for debugging
    const bestMatch = firstWords
      .map(word => ({
        word: word.replace(/[.,!?;:]/g, ''),
        similarity: similarityRatio(word.replace(/[.,!?;:]/g, ''), wakeWord)
      }))
      .sort((a, b) => b.similarity - a.similarity)[0]

    if (bestMatch && bestMatch.similarity > 0.3) {
      console.log(
        `[Wake Word] Best candidate was "${bestMatch.word}" ` +
        `(${(bestMatch.similarity * 100).toFixed(1)}% similar)`
      )
    }

    return { hasWakeWord: false, command: transcription }
  }

  const processAudioRecording = async (audio: Float32Array) => {
    if (audioState.value !== 'LISTENING' || !audio || audio.length === 0) {
      console.warn(
        '[Audio Processing] Processing aborted (invalid state or no audio).'
      )
      isSpeechDetected.value = false
      return
    }

    setAudioState('PROCESSING_AUDIO')

    try {
      const wavBuffer = float32ArrayToWav(audio, 16000)
      console.log(`[Audio Processing] Sending ${audio.length} samples (${(audio.length / 16000).toFixed(2)}s) to transcription service`)

      const transcription =
        await conversationStore.transcribeAudioMessage(wavBuffer)

      console.log(`[Audio Processing] Transcription received: "${transcription}"`)

      if (transcription && transcription.trim()) {
        if (
          settingsStore.config.localSttEnabled &&
          settingsStore.config.sttProvider === 'local'
        ) {
          const { hasWakeWord, command } = checkForWakeWord(transcription)

          if (hasWakeWord) {
            generalStore.recognizedText = command
            eventBus.emit('processing-complete', command)
          } else {
            console.log(
              '[Audio Processing] Wake word not detected, continuing to listen'
            )
            setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
            isSpeechDetected.value = false
          }
        } else {
          generalStore.recognizedText = transcription
          eventBus.emit('processing-complete', transcription)
        }
      } else {
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

  watch(isRecordingRequested, isRequested => {
    console.log(
      `[VAD Lifecycle] Mic request changed to: ${isRequested}. Current state: ${audioState.value}`
    )
    if (isRequested) {
      if (!myvad.value && !isVadInitializing.value) {
        initializeVAD()
      }
      if (audioState.value === 'IDLE' || audioState.value === 'CONFIG') {
        setAudioState('LISTENING')
        if (
          settingsStore.config.localSttEnabled &&
          settingsStore.config.sttProvider === 'local'
        ) {
          awaitingWakeWord.value = true
          wakeWordDetected.value = false
        } else {
          awaitingWakeWord.value = false
          wakeWordDetected.value = false
        }
      }
    } else {
      destroyVAD()
      if (audioState.value === 'LISTENING') {
        setAudioState('IDLE')
      }

      awaitingWakeWord.value = false
      wakeWordDetected.value = false
    }
  })

  const toggleRecordingRequest = () => {
    isRecordingRequested.value = !isRecordingRequested.value
    console.log(
      `Recording request toggled via UI: ${isRecordingRequested.value}`
    )
  }

  onUnmounted(() => {
    destroyVAD()
    if (window.ipcRenderer) {
      window.ipcRenderer.off('global-hotkey-mic-toggle', handleGlobalMicToggle)
      window.ipcRenderer.off(
        'global-hotkey-mute-playback',
        handleGlobalMutePlayback
      )
      window.ipcRenderer.off(
        'global-hotkey-take-screenshot',
        handleGlobalTakeScreenshot
      )
    }
  })

  return {
    toggleRecordingRequest,
  }
}
