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

import OpenAI from 'openai'
import { useSettingsStore } from '../../stores/settingsStore'

const getOpenAIClientForEmbeddings = (): OpenAI => {
  const settings = useSettingsStore().config
  if (!settings.VITE_OPENAI_API_KEY) {
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
  } else if (textInput && Array.isArray(textInput.content)) {
    const textParts = textInput.content
      .filter(
        (item: any): item is LocalOpenAIMessageContentText =>
          item.type === 'text' || item.type === 'output_text'
      )
      .map(
        (item: LocalOpenAIMessageContentText) =>
          item.text?.value || JSON.stringify(item.text)
      )
    textToEmbed = textParts.join(' ')
    if (
      textInput.content.some(
        (item: any) => item.type === 'image_file' || item.type === 'input_image'
      )
    ) {
      textToEmbed += ' [This message includes an image]'
    }
  } else if (textInput?.content && typeof textInput.content === 'string') {
    textToEmbed = textInput.content
  } else {
    textToEmbed = JSON.stringify(textInput)
  }

  if (!textToEmbed.trim()) {
    console.warn('Embed text: Input text is empty, returning empty embedding.')
    return []
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: textToEmbed,
      encoding_format: 'float',
    })
    return response.data[0]?.embedding || []
  } catch (error) {
    console.error('Error creating embedding:', error)
    throw error
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
      'indexMessageForThoughts: Invalid message content for embedding.',
      message
    )
    return
  }
  const embedding = await embedTextForThoughts(message)
  if (embedding.length === 0) {
    console.warn(
      'indexMessageForThoughts: Skipping indexing due to empty embedding.'
    )
    return
  }

  let textContentForMetadata = 'No textual content'
  if (message.content && Array.isArray(message.content)) {
    const firstTextPart = message.content.find(
      (item: any): item is LocalOpenAIMessageContentText =>
        item.type === 'text' || item.type === 'output_text'
    )
    if (firstTextPart?.text) {
      textContentForMetadata = firstTextPart.text.value
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
          '[Thought Index] Failed to save thought to local vector store:',
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
