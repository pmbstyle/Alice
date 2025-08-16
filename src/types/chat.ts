export interface AppChatMessageContentPart {
  type:
    | 'app_text'
    | 'app_image_uri'
    | 'app_generated_image_path'
    | 'app_file'
    | 'app_error'
  text?: string
  uri?: string
  path?: string
  absolutePathForOpening?: string
  imageGenerationId?: string
  isPartial?: boolean
  partialIndex?: number
  fileId?: string
  fileName?: string
  isScheduledReminder?: boolean
  taskName?: string
  timestamp?: string
  errorType?: string
  errorCode?: string
  errorParam?: string
  originalError?: any
}
