import videoSpeaking from '../assets/videos/speaking.mp4'
import videoStandBy from '../assets/videos/standby.mp4'
import videoProcessing from '../assets/videos/thinking.mp4'

const setVideo = (type: string) => {
  switch (type) {
    case 'SPEAKING':
      return videoSpeaking
    case 'STAND_BY':
      return videoStandBy
    case 'PROCESSING':
      return videoProcessing
    default:
      return videoStandBy
  }
}

export { setVideo }
