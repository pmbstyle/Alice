import 'openai/resources/responses/responses'
import 'openai/resources/responses/responses.js'

declare module 'openai/resources/responses/responses' {
  namespace Responses {
    namespace Request {
      type InputItemLike = any
      type ContentPartLike = any
      type InputFilePart = any
      type InputImagePart = any
      type UserContentBlock = any
    }

    type FunctionCall = any
    type StreamEvent = any
  }
}

declare module 'openai/resources/responses/responses.js' {
  namespace Responses {
    namespace Request {
      type InputItemLike = any
      type ContentPartLike = any
      type InputFilePart = any
      type InputImagePart = any
      type UserContentBlock = any
    }

    type FunctionCall = any
    type StreamEvent = any
  }
}
