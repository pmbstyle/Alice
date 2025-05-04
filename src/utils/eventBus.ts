import mitt from 'mitt'

type Events = {
  'start-listening': void
  'stop-listening': void
  'audio-ended': void
  'processing-complete': string
  'screenshot-ready': string
}

const eventBus = mitt<Events>()

export default eventBus
