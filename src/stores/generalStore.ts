import { ref, watch, nextTick } from 'vue'
import { defineStore } from 'pinia'
import { Content } from '../api/gemini/liveApiClient'
import { useConversationStore } from './conversationStore'

interface RawAudioQueueItem {
  audioData: Float32Array
  sampleRate: number
}

export const useGeneralStore = defineStore('general', () => {
  const recognizedText = ref<string>('')
  const isRecordingRequested = ref<boolean>(false)
  const isRecording = ref<boolean>(false)
  const audioPlayer = ref<HTMLAudioElement | null>(null)
  const aiVideo = ref<HTMLVideoElement | null>(null)
  const videoSource = ref<string>('')
  const isPlaying = ref<boolean>(false)
  const isInProgress = ref<boolean>(false)
  const isProcessingRequest = ref<boolean>(false)
  const isTTSProcessing = ref<boolean>(false)
  const audioContext = ref<AudioContext | null>(null)
  const gainNode = ref<GainNode | null>(null)
  const chatHistory = ref<Content[]>([])
  const statusMessage = ref<string>('Ready')
  const audioQueue = ref<RawAudioQueueItem[]>([])
  const chatInput = ref<string>('')
  const openChat = ref<boolean>(false)
  const isMinimized = ref<boolean>(false)
  const storeMessage = ref<boolean>(false)
  const takingScreenShot = ref<boolean>(false)
  const updateVideo = ref<(type: string) => void>(() => {})

  const playAudioTTS = async (text: string, isTTS: boolean = true) => {
    if (!isTTS || !text.trim()) return
    if (!audioPlayer.value) {
      console.error('Audio player reference is not set.')
      return
    }

    const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API Key for TTS is missing!')
      statusMessage.value = 'TTS Config Error'
      return
    }

    const audioFormat = 'mp3'
    const mimeType = `audio/${audioFormat === 'mp3' ? 'mpeg' : audioFormat}`

    isTTSProcessing.value = true
    statusMessage.value = 'Generating speech...'
    updateVideo.value('PROCESSING')

    try {
      const ttsResponse = await fetch(
        'https://api.openai.com/v1/audio/speech',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: text,
            voice: 'nova',
            response_format: audioFormat,
          }),
        }
      )

      if (!ttsResponse.ok || !ttsResponse.body) {
        const errorData = await ttsResponse.json().catch(() => ({}))
        throw new Error(
          `TTS API failed with status ${ttsResponse.status}: ${errorData?.error?.message || ttsResponse.statusText || 'Unknown TTS error'}`
        )
      }

      audioQueue.value.push({ response: ttsResponse, format: audioFormat })

      if (!isPlaying.value) {
        playNextAudio()
      }
    } catch (error) {
      console.error('Error generating or queuing TTS:', error)
      statusMessage.value = 'TTS Error'
      isTTSProcessing.value = false
      if (audioQueue.value.length === 0 && !isProcessingRequest.value) {
        statusMessage.value = 'Ready.'
        updateVideo.value('STAND_BY')
      }
    }
  }

  const playAudioRaw = async (
    float32Data: Float32Array,
    sampleRate: number
  ) => {
    if (!audioPlayer.value) {
      return
    }
    if (!float32Data || float32Data.length === 0) {
      return
    }

    if (!(await ensureAudioContext())) return

    audioQueue.value.push({ audioData: float32Data, sampleRate })

    if (!isPlaying.value) {
      playNextAudioRaw()
    }
  }

  const playNextAudioRaw = async () => {
    const conversationStore = useConversationStore()

    if (audioQueue.value.length === 0) {
      isPlaying.value = false
      conversationStore.checkAndSendBufferedTurn()
      if (
        !conversationStore.isModelTurnComplete &&
        !isProcessingRequest.value
      ) {
        statusMessage.value = 'Ready.'
        updateVideo.value('STAND_BY')
      } else if (isProcessingRequest.value) {
        statusMessage.value = 'Thinking...'
        updateVideo.value('PROCESSING')
      } else {
        statusMessage.value = 'Ready.'
        updateVideo.value('STAND_BY')
      }
      return
    }

    if (!(await ensureAudioContext())) {
      isPlaying.value = false
      statusMessage.value = 'Playback Error'
      return
    }

    const currentAudioItem = audioQueue.value.shift()
    if (!currentAudioItem || !audioPlayer.value) {
      isPlaying.value = false
      playNextAudioRaw()
      return
    }

    isPlaying.value = true
    statusMessage.value = 'Speaking...'
    updateVideo.value('SPEAKING')

    const { audioData, sampleRate } = currentAudioItem
    const currentContext = audioContext.value!

    try {
      const audioBuffer = currentContext.createBuffer(
        1,
        audioData.length,
        sampleRate
      )
      audioBuffer.getChannelData(0).set(audioData)

      const sourceNode = currentContext.createBufferSource()
      sourceNode.buffer = audioBuffer

      if (!gainNode.value) {
        gainNode.value = currentContext.createGain()
        gainNode.value.connect(currentContext.destination)
      }
      sourceNode.connect(gainNode.value)

      sourceNode.onended = () => {
        sourceNode.disconnect()
        playNextAudioRaw()
      }

      gainNode.value.gain.setValueAtTime(1.0, currentContext.currentTime)
      sourceNode.start(0)
    } catch (error) {
      console.error('Error playing raw audio chunk:', error)
      statusMessage.value = 'Playback Error'
      isPlaying.value = false
      playNextAudioRaw()
    }
  }

  const playNextAudio = async () => {
    if (audioQueue.value.length === 0) {
      isPlaying.value = false
      isTTSProcessing.value = false
      try {
        if (!isProcessingRequest.value) {
          statusMessage.value = 'Ready.'
          updateVideo.value('STAND_BY')
        } else {
          statusMessage.value = 'Thinking...'
          updateVideo.value('PROCESSING')
        }
      } catch (e) {
        console.warn(
          'Could not check LLM processing state, setting default ready state.'
        )
        statusMessage.value = 'Ready.'
        updateVideo.value('STAND_BY')
      }
      return
    }

    const currentAudioItem = audioQueue.value.shift()
    if (!currentAudioItem || !audioPlayer.value) {
      isPlaying.value = false
      isTTSProcessing.value = false
      playNextAudio()
      return
    }

    isPlaying.value = true
    isTTSProcessing.value = true
    statusMessage.value = 'Speaking...'
    updateVideo.value('SPEAKING')

    const { response: audioResponse, format } = currentAudioItem
    const mimeType = `audio/${format === 'mp3' ? 'mpeg' : format}`

    let mediaSource: MediaSource | null = null
    try {
      mediaSource = new MediaSource()
    } catch (e) {
      console.error('MediaSource API not available.', e)
      statusMessage.value = 'Playback Error'
      isPlaying.value = false
      isTTSProcessing.value = false
      playNextAudio()
      return
    }

    const objectURL = URL.createObjectURL(mediaSource)
    audioPlayer.value.src = objectURL

    const cleanup = () => {
      if (audioPlayer.value) {
        audioPlayer.value.removeEventListener('ended', onAudioEnded)
      }
      if (mediaSource && audioPlayer.value?.src === objectURL) {
        URL.revokeObjectURL(objectURL)
      }
    }

    const onAudioEnded = () => {
      cleanup()
      playNextAudio()
    }

    audioPlayer.value.removeEventListener('ended', onAudioEnded)
    audioPlayer.value.addEventListener('ended', onAudioEnded, { once: true })

    mediaSource.addEventListener(
      'sourceopen',
      () => {
        if (!mediaSource || mediaSource.readyState !== 'open') {
          console.warn(
            "MediaSource state not 'open' during sourceopen handler."
          )
          cleanup()
          isPlaying.value = false
          isTTSProcessing.value = false
          playNextAudio()
          return
        }

        let sourceBuffer: SourceBuffer | null = null
        try {
          sourceBuffer = mediaSource.addSourceBuffer(mimeType)
        } catch (error) {
          console.error(
            'Error adding SourceBuffer with type',
            mimeType,
            ':',
            error
          )
          cleanup()
          isPlaying.value = false
          isTTSProcessing.value = false
          playNextAudio()
          return
        }

        const reader = audioResponse.body?.getReader()
        if (!reader) {
          console.error('Failed to get reader from audio response body.')
          cleanup()
          isPlaying.value = false
          isTTSProcessing.value = false
          playNextAudio()
          return
        }

        let isEndOfStream = false

        const appendChunk = (buffer: AllowSharedBufferSource) => {
          try {
            if (
              sourceBuffer &&
              !sourceBuffer.updating &&
              mediaSource &&
              mediaSource.readyState === 'open'
            ) {
              sourceBuffer.appendBuffer(buffer)
            } else if (sourceBuffer) {
              sourceBuffer.addEventListener(
                'updateend',
                () => {
                  if (
                    mediaSource &&
                    mediaSource.readyState === 'open' &&
                    !isEndOfStream
                  ) {
                    appendChunk(buffer)
                  }
                },
                { once: true }
              )
            } else {
              console.warn(
                'SourceBuffer or MediaSource not available/ready during append.'
              )
            }
          } catch (error) {
            console.error('Error appending buffer:', error)
            cleanup()
            isPlaying.value = false
            isTTSProcessing.value = false
            playNextAudio()
          }
        }

        const processStream = ({
          done,
          value,
        }: ReadableStreamReadResult<Uint8Array>): Promise<void> => {
          return new Promise((resolve, reject) => {
            if (done) {
              if (
                mediaSource &&
                mediaSource.readyState === 'open' &&
                sourceBuffer &&
                !sourceBuffer.updating &&
                !isEndOfStream
              ) {
                console.log('Stream ended, calling endOfStream().')
                isEndOfStream = true
                try {
                  mediaSource.endOfStream()
                } catch (e) {
                  console.error('Error ending stream:', e)
                }
              } else if (
                mediaSource &&
                mediaSource.readyState === 'open' &&
                sourceBuffer &&
                !isEndOfStream
              ) {
                sourceBuffer.addEventListener(
                  'updateend',
                  () => {
                    if (
                      mediaSource &&
                      mediaSource.readyState === 'open' &&
                      !isEndOfStream
                    ) {
                      console.log(
                        'Stream ended, calling endOfStream() after update.'
                      )
                      isEndOfStream = true
                      try {
                        mediaSource.endOfStream()
                      } catch (e) {
                        console.error('Error ending stream on updateend:', e)
                      }
                    }
                    resolve()
                  },
                  { once: true }
                )
                return
              } else {
                console.warn(
                  'Could not end stream, state:',
                  mediaSource?.readyState,
                  'updating:',
                  sourceBuffer?.updating,
                  'ended:',
                  isEndOfStream
                )
              }
              resolve()
              return
            }

            if (value) {
              appendChunk(value)
            }
            reader.read().then(processStream).then(resolve).catch(reject)
          })
        }

        reader
          .read()
          .then(processStream)
          .catch(err => {
            console.error('Error reading audio stream:', err)
            try {
              if (
                mediaSource &&
                mediaSource.readyState === 'open' &&
                !isEndOfStream
              )
                mediaSource.endOfStream()
            } catch (e) {}
            cleanup()
            isPlaying.value = false
            isTTSProcessing.value = false
            playNextAudio()
          })
      },
      { once: true }
    )

    mediaSource.addEventListener('sourceended', () => {})
    mediaSource.addEventListener('sourceclose', () => {
      cleanup()
    })

    try {
      if (
        audioPlayer.value.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA ||
        audioPlayer.value.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA
      ) {
        await audioPlayer.value.play()
      } else {
        const canPlayHandler = async () => {
          if (!audioPlayer.value) return
          audioPlayer.value.removeEventListener('canplay', canPlayHandler)
          try {
            await audioPlayer.value.play()
          } catch (playError) {
            console.error('Error playing audio after canplay:', playError)
            statusMessage.value = 'Playback Error'
            cleanup()
            isPlaying.value = false
            isTTSProcessing.value = false
            playNextAudio()
          }
        }
        audioPlayer.value.addEventListener('canplay', canPlayHandler, {
          once: true,
        })
      }
    } catch (error) {
      console.error('Error initiating audio playback:', error)
      statusMessage.value = 'Playback Error'
      cleanup()
      isPlaying.value = false
      isTTSProcessing.value = false
      playNextAudio()
    }
  }

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
        console.error('Error resuming AudioContext, creating new.', e)
      }
    }
    if (audioContext.value) {
      await audioContext.value
        .close()
        .catch(e => console.warn('Error closing previous AudioContext:', e))
    }

    try {
      console.log('Creating new AudioContext for playback.')
      audioContext.value = new AudioContext()
      gainNode.value = audioContext.value.createGain()
      gainNode.value.connect(audioContext.value.destination)
      return true
    } catch (e) {
      console.error('Failed to create AudioContext:', e)
      statusMessage.value = 'Audio Init Error'
      return false
    }
  }

  watch(statusMessage, newStatus => {
    switch (newStatus) {
      case 'Speaking...':
        updateVideo.value('SPEAKING')
        break
      case 'Thinking...':
      case 'Generating speech...':
      case 'Processing function results...':
      case 'Executing function...':
        updateVideo.value('PROCESSING')
        break
      default:
        if (
          !isPlaying.value &&
          !isProcessingRequest.value &&
          audioQueue.value.length === 0
        ) {
          updateVideo.value('STAND_BY')
        }
        break
    }
  })

  watch(
    [isProcessingRequest, isPlaying, isTTSProcessing],
    ([processing, playing, ttsGen]) => {
      if (!processing && !playing && !ttsGen && audioQueue.value.length === 0) {
        statusMessage.value = 'Ready.'
        updateVideo.value('STAND_BY')
      }
    }
  )

  return {
    recognizedText,
    isRecordingRequested,
    isRecording,
    audioPlayer,
    aiVideo,
    videoSource,
    isPlaying,
    isInProgress,
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
    playNextAudio,
  }
})
