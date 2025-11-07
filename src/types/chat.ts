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

export interface ChatMessage {
  id?: string
  local_id_temp?: string
  api_message_id?: string
  api_response_id?: string
  role: 'user' | 'assistant' | 'system' | 'developer' | 'tool'
  content: string | AppChatMessageContentPart[]
  tool_call_id?: string
  name?: string
  tool_calls?: any[]
  created_at?: number
}
