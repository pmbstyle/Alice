import videoSpeaking from '../assets/videos/speaking.mp4'
import videoStandBy from '../assets/videos/hd/standby.mp4'
import videoProcessing from '../assets/videos/hd/processing.mp4'

import videoEmotionBored from '../assets/videos/emotions/bored.mp4'
import videoEmotionWow from '../assets/videos/emotions/wow.mp4'
import videoEmotionSad from '../assets/videos/emotions/sad.mp4'
import videoEmotionSmile from '../assets/videos/emotions/smiling.mp4'
import videoEmotionWings from '../assets/videos/emotions/wings.mp4'

const setVideo = (type: string) => {
  switch (type) {
    case 'SPEAKING':
      return videoSpeaking
    case 'STAND_BY':
      return videoStandBy
    case 'PROCESSING':
      return videoProcessing
      //return videoStandBy
    case 'EMOTION_BORED':
      return videoEmotionBored
    case 'EMOTION_WOW':
      return videoEmotionWow
    case 'EMOTION_SAD':
      return videoEmotionSad
    case 'EMOTION_SMILE':
      return videoEmotionSmile
    case 'EMOTION_WINGS':
      return videoEmotionWings
    default:
      return videoStandBy
  }
}

export {
  setVideo
}