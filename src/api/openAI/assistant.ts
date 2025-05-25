import OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'
import type { AppChatMessageContentPart } from '../../stores/openAIStore'

export interface LocalOpenAIMessageContentText {
  type: 'text' | 'output_text'
  text: {
    value: string
    annotations: any[]
  }
}

export interface LocalOpenAIMessageContentImageFile {
  type: 'image_file' | 'input_image'
  image_file?: {
    file_id: string
  }
  image_url?: string
}

const getOpenAIClientForEmbeddings = (): OpenAI => {
  const settings = useSettingsStore().config
  if (!settings.VITE_OPENAI_API_KEY) {
    console.error('OpenAI API Key is not configured for embeddings.')
    throw new Error('OpenAI API Key is not configured for embeddings.')
  }
  return new OpenAI({
    apiKey: settings.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  })
}

export const embedTextForThoughts = async (
  textInput: any
): Promise<number[]> => {
  let textToEmbed = ''
  const openai = getOpenAIClientForEmbeddings()

  if (typeof textInput === 'string') {
    textToEmbed = textInput
  } else if (textInput && typeof textInput.content === 'string') {
    textToEmbed = textInput.content
  } else if (textInput && Array.isArray(textInput.content)) {
    const contentArray = textInput.content as Array<
      | LocalOpenAIMessageContentText
      | AppChatMessageContentPart
      | LocalOpenAIMessageContentImageFile
    >

    const textParts = contentArray
      .filter(
        (
          item
        ): item is LocalOpenAIMessageContentText | AppChatMessageContentPart =>
          item.type === 'text' ||
          item.type === 'output_text' ||
          item.type === 'app_text'
      )
      .map(item => {
        if (item.type === 'app_text') {
          return (item as AppChatMessageContentPart).text || ''
        } else {
          return (item as LocalOpenAIMessageContentText).text?.value || ''
        }
      })
    textToEmbed = textParts.join(' ')

    if (
      contentArray.some(
        (item: any) =>
          item.type === 'image_file' ||
          item.type === 'input_image' ||
          item.type === 'app_image_uri'
      )
    ) {
      textToEmbed += ' [This message includes an image]'
    }
  } else {
    console.warn(
      '[embedTextForThoughts] Unknown input structure, attempting JSON.stringify:',
      textInput
    )
    try {
      textToEmbed = JSON.stringify(textInput)
    } catch (e) {
      console.error(
        '[embedTextForThoughts] Could not stringify unknown input structure:',
        e
      )
      textToEmbed = ''
    }
  }

  if (!textToEmbed.trim()) {
    console.warn(
      '[embedTextForThoughts] Input text is empty after processing, returning empty embedding.'
    )
    return []
  }

  console.log(
    '[embedTextForThoughts] Text to embed:',
    textToEmbed.substring(0, 200) + (textToEmbed.length > 200 ? '...' : '')
  )

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: textToEmbed,
      encoding_format: 'float',
    })
    return response.data[0]?.embedding || []
  } catch (error) {
    console.error(
      '[embedTextForThoughts] Error creating embedding with OpenAI:',
      error
    )
    return []
  }
}

export const indexMessageForThoughts = async (
  conversationId: string,
  role: string,
  message: any
): Promise<void> => {
  if (
    !message ||
    (typeof message.content !== 'string' && !Array.isArray(message.content))
  ) {
    console.warn(
      '[indexMessageForThoughts] Invalid message content for embedding. Skipping.',
      message
    )
    return
  }

  const embedding = await embedTextForThoughts(message)

  if (embedding.length === 0) {
    console.warn(
      '[indexMessageForThoughts] Skipping indexing due to empty embedding.'
    )
    return
  }

  let textContentForMetadata = 'No textual content'
  if (message.content && Array.isArray(message.content)) {
    const firstTextPart = message.content.find(
      (
        item: any
      ): item is LocalOpenAIMessageContentText | AppChatMessageContentPart =>
        item.type === 'text' ||
        item.type === 'output_text' ||
        item.type === 'app_text'
    )
    if (firstTextPart) {
      if (firstTextPart.type === 'app_text') {
        textContentForMetadata =
          (firstTextPart as AppChatMessageContentPart).text || 'Content error'
      } else {
        textContentForMetadata =
          (firstTextPart as LocalOpenAIMessageContentText).text?.value ||
          'Content error'
      }
    }
  } else if (typeof message.content === 'string') {
    textContentForMetadata = message.content
  }

  try {
    if (window.ipcRenderer) {
      const result = await window.ipcRenderer.invoke('thoughtVector:add', {
        conversationId,
        role,
        textContent: textContentForMetadata,
        embedding,
      })
      if (!result.success) {
        console.error(
          '[Thought Index] Failed to save thought to local vector store (IPC):',
          result.error
        )
      }
    } else {
      console.warn('IPC renderer not available, cannot index thought.')
    }
  } catch (error) {
    console.error(
      '[Thought Index] Error invoking thoughtVector:add IPC:',
      error
    )
  }
}

export const retrieveRelevantThoughtsForPrompt = async (
  content: string,
  topK = 3
): Promise<string[]> => {
  if (!content.trim()) return []

  const queryEmbedding = await embedTextForThoughts(content)

  if (queryEmbedding.length === 0) return []

  try {
    if (window.ipcRenderer) {
      const ipcResult = await window.ipcRenderer.invoke(
        'thoughtVector:search',
        {
          queryEmbedding,
          topK,
        }
      )

      if (ipcResult.success && Array.isArray(ipcResult.data)) {
        return ipcResult.data as string[]
      } else {
        console.error(
          '[Thought Retrieve] Failed to retrieve thoughts from local vector store or data format incorrect:',
          ipcResult.error
        )
        return []
      }
    } else {
      console.warn('IPC renderer not available, cannot retrieve thoughts.')
      return []
    }
  } catch (error) {
    console.error(
      '[Thought Retrieve] Error during IPC call for vector search:',
      error
    )
    return []
  }
}
