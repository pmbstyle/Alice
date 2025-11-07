import type { AudioState } from '../../stores/generalStore'

export interface TurnManagerDependencies {
  getTtsAbortController(): AbortController | null
  setTtsAbortController(controller: AbortController | null): void
  getLlmAbortController(): AbortController | null
  setLlmAbortController(controller: AbortController | null): void
  getCurrentResponseId(): string | null
  getAudioPlayer(): HTMLAudioElement | null
  getAudioQueueLength(): number
  getAudioState(): AudioState
  setAudioState(state: AudioState): void
  isRecordingRequested(): boolean
  triggerSummarization(): void
  onCancelTts(handler: () => void): void
  offCancelTts(handler: () => void): void
  onCancelLlm(handler: () => void): void
  offCancelLlm(handler: () => void): void
  logInfo(...args: any[]): void
  logError(...args: any[]): void
}

export interface TurnManager {
  finalizeAfterStream(options: {
    streamEndedNormally: boolean
    isContinuationAfterTool: boolean
  }): void
  dispose(): void
}

export function createTurnManager(
  dependencies: TurnManagerDependencies
): TurnManager {
  const handleCancelTTS = () => {
    const controller = dependencies.getTtsAbortController()
    if (!controller) return
    dependencies.logInfo('[TTS Abort] Cancelling in-flight TTS request.')
    controller.abort()
    dependencies.setTtsAbortController(null)
  }

  const handleCancelLLMStream = () => {
    const controller = dependencies.getLlmAbortController()
    if (!controller) return
    dependencies.logInfo('[LLM Abort] Cancelling in-flight LLM stream request.')
    controller.abort()
    dependencies.setLlmAbortController(null)
    dependencies.logInfo(
      '[LLM Abort] Stream cancelled. Keeping currentResponseId for conversation continuity:',
      dependencies.getCurrentResponseId()
    )
  }

  dependencies.onCancelTts(handleCancelTTS)
  dependencies.onCancelLlm(handleCancelLLMStream)

  const finalizeAfterStream = ({
    streamEndedNormally,
    isContinuationAfterTool,
  }: {
    streamEndedNormally: boolean
    isContinuationAfterTool: boolean
  }) => {
    if (!streamEndedNormally) return

    const finalizeInterval = setInterval(() => {
      const audioPlayer = dependencies.getAudioPlayer()
      if (audioPlayer && !audioPlayer.paused) {
        return
      }

      if (dependencies.getAudioQueueLength() > 0) {
        return
      }

      const audioState = dependencies.getAudioState()
      if (audioState === 'SPEAKING' || audioState === 'WAITING_FOR_RESPONSE') {
        dependencies.setAudioState(
          dependencies.isRecordingRequested() ? 'LISTENING' : 'IDLE'
        )
      }

      clearInterval(finalizeInterval)

      if (!isContinuationAfterTool) {
        dependencies.triggerSummarization()
      }
    }, 250)
  }

  const dispose = () => {
    dependencies.offCancelTts(handleCancelTTS)
    dependencies.offCancelLlm(handleCancelLLMStream)
  }

  return {
    finalizeAfterStream,
    dispose,
  }
}

