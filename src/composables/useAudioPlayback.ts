import { ref, watch, onUnmounted } from 'vue'
import { useGeneralStore } from '../stores/generalStore'
import { storeToRefs } from 'pinia'

export function useAudioPlayback() {
  const generalStore = useGeneralStore()
  const {
    audioState,
    audioPlayer,
    audioQueue,
    isTTSEnabled,
    isRecordingRequested,
  } = storeToRefs(generalStore)
  const { setAudioState } = generalStore

  const isProcessingQueue = ref(false)

  const playNextAudio = async () => {
    if (isProcessingQueue.value) {
      console.log('[Playback] playNextAudio skipped: Already processing queue.')
      return
    }
    if (audioState.value !== 'SPEAKING' || !isTTSEnabled.value) {
      console.log(
        `[Playback] playNextAudio skipped: State is ${audioState.value} or TTS disabled.`
      )
      isProcessingQueue.value = false
      return
    }
    if (audioQueue.value.length === 0) {
      console.log('[Playback] Queue empty, transitioning state.')
      setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      isProcessingQueue.value = false
      return
    }
    if (!audioPlayer.value) {
      console.error('[Playback] Audio player element not available.')
      setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
      isProcessingQueue.value = false
      return
    }

    isProcessingQueue.value = true
    const audioResponse = audioQueue.value.shift()
    console.log(
      `[Playback] Processing next audio chunk. Queue size: ${audioQueue.value.length}`
    )

    if (!audioResponse) {
      console.warn('[Playback] Dequeued undefined audio response.')
      isProcessingQueue.value = false
      playNextAudio()
      return
    }

    try {
      const blob = await audioResponse.blob()
      const audioUrl = URL.createObjectURL(blob)

      if (audioPlayer.value.src) {
        URL.revokeObjectURL(audioPlayer.value.src)
      }
      audioPlayer.value.src = audioUrl

      audioPlayer.value.onended = null
      audioPlayer.value.onerror = null

      audioPlayer.value.onended = () => {
        console.log('[Playback] Audio chunk finished playing.')
        URL.revokeObjectURL(audioUrl)
        isProcessingQueue.value = false
        requestAnimationFrame(playNextAudio)
      }

      audioPlayer.value.onerror = e => {
        console.error(
          '[Playback] Error playing audio:',
          e,
          audioPlayer.value?.error
        )
        URL.revokeObjectURL(audioUrl)
        isProcessingQueue.value = false
        requestAnimationFrame(playNextAudio)
      }

      await audioPlayer.value.play()
      console.log('[Playback] Audio play() called.')
    } catch (error: any) {
      console.error('[Playback] Error setting up or playing audio:', error)
      isProcessingQueue.value = false
      if (typeof audioUrl === 'string' && audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl)
      }
      requestAnimationFrame(playNextAudio)
    }
  }

  watch(audioState, (newState, oldState) => {
    console.log(
      `[Playback Watcher] Audio state changed from ${oldState} to ${newState}`
    )
    if (newState === 'SPEAKING') {
      if (!isProcessingQueue.value && audioQueue.value.length > 0) {
        console.log('[Playback Watcher] State is SPEAKING, starting playback.')
        playNextAudio()
      } else {
        console.log(
          '[Playback Watcher] State is SPEAKING, but already processing or queue empty.'
        )
      }
    } else if (oldState === 'SPEAKING' && newState !== 'SPEAKING') {
      console.log('[Playback Watcher] State left SPEAKING, stopping playback.')
      stopPlaybackAndClearQueue()
    }
  })

  const stopPlaybackAndClearQueue = () => {
    console.log('[Playback Control] Stopping playback and clearing queue.')
    if (audioPlayer.value) {
      audioPlayer.value.pause()
      if (audioPlayer.value.src && audioPlayer.value.src.startsWith('blob:')) {
        URL.revokeObjectURL(audioPlayer.value.src)
      }
      audioPlayer.value.src = ''
      audioPlayer.value.onended = null
      audioPlayer.value.onerror = null
    }
    audioQueue.value = []
    isProcessingQueue.value = false
  }

  const toggleTTSPreference = () => {
    const newState = !isTTSEnabled.value
    isTTSEnabled.value = newState
    console.log(`TTS preference toggled via UI: ${newState}`)

    if (!newState) {
      if (audioState.value === 'SPEAKING') {
        console.log('TTS disabled while speaking - stopping playback.')
        stopPlaybackAndClearQueue()
        if (audioState.value === 'SPEAKING') {
          setAudioState(isRecordingRequested.value ? 'LISTENING' : 'IDLE')
        }
      } else if (audioQueue.value.length > 0) {
        console.log('TTS disabled - clearing pending audio queue.')
        audioQueue.value = []
      }
    }
  }

  const initiatePlaybackIfNeeded = () => {
    if (
      audioState.value !== 'SPEAKING' &&
      !isProcessingQueue.value &&
      audioQueue.value.length > 0 &&
      isTTSEnabled.value
    ) {
      console.log(
        '[Playback Initiator] Queue has items and not speaking, setting state to SPEAKING.'
      )
      setAudioState('SPEAKING')
    }
  }

  watch(
    audioQueue,
    (newQueue, oldQueue) => {
      if (newQueue.length > oldQueue.length) {
        initiatePlaybackIfNeeded()
      }
    },
    { deep: true }
  )

  onUnmounted(() => {
    console.log('[Audio Playback] Component unmounted, ensuring cleanup.')
    stopPlaybackAndClearQueue()
  })

  return {
    toggleTTSPreference,
  }
}
