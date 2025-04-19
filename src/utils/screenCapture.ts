import { Logger } from './logger'

const logger = new Logger('ScreenCapture')

interface ScreenCaptureConfig {
  width?: number
  quality?: number
  onStop?: () => void
}

interface ScreenSource {
  id: string
  name: string
  thumbnail?: { toDataURL(): string }
  display_id?: string
  appIcon?: { toDataURL(): string } | null
}

declare global {
  interface Window {
    ipcRenderer?: {
      invoke(channel: string, ...args: any[]): Promise<any>
    }
  }
}

export class ScreenCapture {
  private config: Required<ScreenCaptureConfig>
  private stream: MediaStream | null = null
  private videoElement: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  public isInitialized: boolean = false
  private aspectRatio: number | null = null
  private previewContainer: HTMLElement | null = null

  constructor(config: ScreenCaptureConfig) {
    this.config = {
      width: config.width || 1280,
      quality: config.quality || 0.7,
      onStop: config.onStop || (() => {}),
    }
  }

  setPreviewElement(element: HTMLElement | null) {
    this.previewContainer = element
    if (this.videoElement && this.previewContainer) {
      if (!this.previewContainer.contains(this.videoElement)) {
        this.previewContainer.innerHTML = ''
        this.previewContainer.appendChild(this.videoElement)
      }
      this.showPreview()
    } else if (!this.videoElement && this.previewContainer) {
      this.previewContainer.innerHTML = ''
      this.hidePreview()
    }
  }

  showPreview() {
    if (this.previewContainer) {
      this.previewContainer.style.display = 'block'
    }
  }

  hidePreview() {
    if (this.previewContainer) {
      this.previewContainer.style.display = 'none'
    }
  }

  async initialize(): Promise<MediaStream> {
    if (this.isInitialized) {
      logger.warn('ScreenCapture already initialized.')
      return this.stream!
    }
    logger.info('Initializing screen capture using Electron APIs...')

    if (!window.ipcRenderer) {
      logger.error(
        'ipcRenderer not found on window object. Cannot use Electron screen capture.'
      )
      throw new Error('Screen capture requires the Electron environment.')
    }

    let sources: ScreenSource[] = []
    try {
      sources = await window.ipcRenderer.invoke('get-screen-sources')
      if (!sources || sources.length === 0) {
        throw new Error('No screen sources found by desktopCapturer.')
      }
      logger.info(`Found ${sources.length} screen sources.`)

      const selectedSource = sources[0]
      logger.info(
        `Selected source: ${selectedSource.name} (ID: ${selectedSource.id})`
      )

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSource.id,
            minWidth: 640,
            maxWidth: 1920,
            minHeight: 480,
            maxHeight: 1080,
          } as any,
        } as MediaTrackConstraints,
      }

      logger.debug('Requesting getUserMedia with constraints:', constraints)
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      logger.info('getUserMedia stream obtained successfully.')

      this.videoElement = document.createElement('video')
      this.videoElement.srcObject = this.stream
      this.videoElement.muted = true
      this.videoElement.playsInline = true

      if (this.previewContainer) {
        this.setPreviewElement(this.previewContainer)
      }

      await new Promise<void>((resolve, reject) => {
        this.videoElement!.onloadedmetadata = () => {
          logger.debug('Video metadata loaded.')
          this.videoElement!.play()
            .then(() => {
              logger.info('Video element playback started.')
              resolve()
            })
            .catch(err => {
              logger.error('Video element play() failed:', err)
              reject(err)
            })
        }
        this.videoElement!.onerror = e => {
          logger.error('Video element error:', e)
          reject(new Error('Video element encountered an error'))
        }
      })

      const videoWidth = this.videoElement.videoWidth
      const videoHeight = this.videoElement.videoHeight
      logger.info(`Video dimensions: ${videoWidth}x${videoHeight}`)
      if (videoWidth === 0 || videoHeight === 0) {
        throw new Error(
          'Video dimensions are zero after playback started, cannot initialize canvas.'
        )
      }
      this.aspectRatio = videoHeight / videoWidth

      const canvasWidth = this.config.width
      const canvasHeight = Math.round(this.config.width * this.aspectRatio)

      this.canvas = document.createElement('canvas')
      this.canvas.width = canvasWidth
      this.canvas.height = canvasHeight
      this.ctx = this.canvas.getContext('2d')
      if (!this.ctx) {
        throw new Error('Failed to get 2D context from canvas.')
      }
      logger.info(
        `Canvas created with dimensions: ${canvasWidth}x${canvasHeight}`
      )

      this.stream.getVideoTracks()[0].addEventListener('ended', () => {
        logger.info('Screen sharing track ended (stopped by user or browser).')
        this.config.onStop()
        this.dispose(false)
      })

      this.isInitialized = true
      logger.info(
        'Screen capture initialized successfully using Electron APIs.'
      )
      return this.stream
    } catch (error: any) {
      logger.error('Failed to initialize screen capture:', error)
      this.dispose()
      if (error.message.includes('desktopCapturer')) {
        throw new Error(
          `Screen capture failed: Could not get sources. ${error.message}`
        )
      } else if (error.message.includes('getUserMedia')) {
        throw new Error(
          `Screen capture failed: Could not get stream for selected source. ${error.message}`
        )
      } else if (error.message.includes('Video dimensions are zero')) {
        throw new Error(
          `Screen capture failed: Video stream failed to load properly. ${error.message}`
        )
      } else {
        throw new Error(`Screen capture failed: ${error.message}`)
      }
    }
  }

  async capture(): Promise<string | null> {
    if (
      !this.isInitialized ||
      !this.ctx ||
      !this.videoElement ||
      !this.canvas
    ) {
      return null
    }

    try {
      if (
        this.videoElement.paused ||
        this.videoElement.ended ||
        this.videoElement.videoWidth === 0
      ) {
        logger.warn(
          'Video not ready for capture (paused, ended, or zero dimensions).'
        )
        return null
      }

      this.ctx.drawImage(
        this.videoElement,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      )
      return this.canvas
        .toDataURL('image/jpeg', this.config.quality)
        .split(',')[1]
    } catch (error: any) {
      logger.error('Error capturing screen frame:', error)
      return null
    }
  }

  dispose(stopTracks = true) {
    logger.info('Disposing screen capture resources...')
    if (stopTracks && this.stream) {
      this.stream.getTracks().forEach(track => {
        track.onended = null
        track.stop()
      })
      logger.info('MediaStream tracks stopped.')
    }
    this.stream = null

    if (this.videoElement) {
      this.videoElement.onloadedmetadata = null
      this.videoElement.onerror = null
      this.videoElement.pause()
      this.videoElement.srcObject = null
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement)
      }
      this.videoElement = null
      logger.info('Video element disposed.')
    }

    if (this.previewContainer) {
      this.previewContainer.innerHTML = ''
      this.hidePreview()
    }

    this.canvas = null
    this.ctx = null
    this.isInitialized = false
    this.aspectRatio = null
    logger.info('Screen capture disposed.')
  }
}
