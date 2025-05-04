import { useGeneralStore } from '../stores/generalStore'
import { storeToRefs } from 'pinia'
import eventBus from '../utils/eventBus'

export function useAudioPlayback(
  startListening: () => void,
  stopListening: () => void
) {
  const generalStore = useGeneralStore()

  const {
    audioPlayer,
    isPlaying,
    audioContext,
    audioSource,
    statusMessage,
    isRecordingRequested,
    isRecording,
    updateVideo,
    isTTSEnabled,
  } = storeToRefs(generalStore)

  let isProcessingQueue = false

  const playNextAudio = async (tool = false) => {
    if (isProcessingQueue) {
      console.log('Already processing queue, skipping duplicate call')
      return
    }

    isProcessingQueue = true

    try {
      console.log(
        'playNextAudio called, queue size:',
        generalStore.audioQueue.length
      )

      if (generalStore.audioQueue.length === 0 || !isTTSEnabled.value) {
        isPlaying.value = false
        statusMessage.value = tool
          ? 'Thinking...'
          : isRecordingRequested.value
            ? 'Listening'
            : 'Stand by'
        if (isRecordingRequested.value) {
          startListening()
        }
        isProcessingQueue = false
        return
      }

      if (isRecording.value) {
        stopListening()
      }

      if (audioPlayer.value) {
        audioPlayer.value.pause()
        audioPlayer.value.removeAttribute('src')
      }

      isPlaying.value = true
      const audioResponse = generalStore.audioQueue.shift()
      console.log(
        'Processing audio chunk, remaining in queue:',
        generalStore.audioQueue.length
      )

      if (audioPlayer.value && audioResponse) {
        try {
          const blob = await audioResponse.blob()
          const audioUrl = URL.createObjectURL(blob)

          audioPlayer.value.src = audioUrl

          audioPlayer.value.addEventListener(
            'ended',
            () => {
              console.log('Audio chunk finished playing')
              URL.revokeObjectURL(audioUrl)
              setTimeout(() => {
                isProcessingQueue = false
                playNextAudio(tool)
              }, 100)
            },
            { once: true }
          )

          await audioPlayer.value.play()
          statusMessage.value = 'Speaking...'
        } catch (error) {
          console.error('Error playing audio:', error)
          isProcessingQueue = false
          playNextAudio(tool)
        }
      } else {
        isProcessingQueue = false
      }
    } catch (error) {
      console.error('Error in playNextAudio:', error)
      isProcessingQueue = false
    }
  }

  const togglePlaying = () => {
    console.log(
      'Toggling audio playback, isPlaying:',
      isPlaying.value,
      'isTTSEnabled:',
      isTTSEnabled.value,
      'Queue size:',
      generalStore.audioQueue.length
    )

    if (isPlaying.value) {
      audioPlayer.value?.pause()
      updateVideo.value('STAND_BY')
      statusMessage.value = isRecordingRequested.value
        ? 'Listening'
        : 'Stand by'

      if (audioContext.value) {
        audioContext.value.close()
        audioContext.value = null
      }

      console.log(
        'Clearing audio queue, had',
        generalStore.audioQueue.length,
        'items'
      )
      generalStore.audioQueue = []
      isProcessingQueue = false
      isTTSEnabled.value = false
      isPlaying.value = false

      if (isRecordingRequested.value) {
        isRecording.value = true
        eventBus.emit('start-listening')
      }
    } else {
      isTTSEnabled.value = !isTTSEnabled.value
      console.log('TTS Enabled set to:', isTTSEnabled.value)

      if (isTTSEnabled.value && generalStore.audioQueue.length > 0) {
        console.log('Starting playback of queued audio')
        isProcessingQueue = false
        playNextAudio(false)
      }
    }
  }

  const setupAudioPlayback = () => {
    console.log('Setting up audio playback system')

    if (audioPlayer.value) {
      console.log('Audio player element initialized:', !!audioPlayer.value)
    }

    generalStore.playAudio = async (audioResponse: Response, tool = false) => {
      console.log(
        'playAudio called with response, isTTSEnabled:',
        isTTSEnabled.value,
        'isPlaying:',
        isPlaying.value
      )

      if (!audioPlayer.value) {
        console.error('Audio player element not available')
        return
      }

      if (!isTTSEnabled.value) {
        console.log('TTS is disabled, skipping audio playback')
        statusMessage.value = isRecordingRequested.value
          ? 'Listening'
          : 'Stand by'
        return
      }

      console.log(
        'Adding audio to queue, current size:',
        generalStore.audioQueue.length
      )
      generalStore.audioQueue.push(audioResponse)

      if (!isPlaying.value || !isProcessingQueue) {
        console.log('Starting audio playback')
        isProcessingQueue = false
        playNextAudio(tool)
      } else {
        console.log('Already playing, added to queue for sequential playback')
      }
    }
  }

  return {
    playNextAudio,
    togglePlaying,
    setupAudioPlayback,
  }
}
