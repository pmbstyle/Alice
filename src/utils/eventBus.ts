import mitt from 'mitt'

type Events = {
  'start-listening': void
  'stop-listening': void
  'audio-ended': void
  'processing-complete': string
  'screenshot-ready': string
  'mute-playback-toggle': void
  'take-screenshot': void
  'cancel-tts': void
  'cancel-llm-stream': void
}

const eventBus = mitt<Events>()

export default eventBus
