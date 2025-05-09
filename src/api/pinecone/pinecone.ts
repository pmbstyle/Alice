import { Pinecone } from '@pinecone-database/pinecone'
import { useSettingsStore } from '../../stores/settingsStore'

function getPineconeClient() {
  const settings = useSettingsStore().config
  if (!settings.VITE_PINECONE_API_KEY && useSettingsStore().isProduction) {
    console.error('Pinecone API Key is not configured in production.')
  }
  return new Pinecone({
    apiKey: settings.VITE_PINECONE_API_KEY,
  })
}

function getPineconeIndex() {
  const pinecone = getPineconeClient()
  const settings = useSettingsStore().config
  if (!settings.VITE_PINECONE_INDEX && useSettingsStore().isProduction) {
    console.error('Pinecone Index name is not configured in production.')
    throw new Error('Pinecone Index name not configured.')
  }
  return pinecone.Index(settings.VITE_PINECONE_INDEX)
}

export const setIndex = async (
  conversationId: string,
  role: string,
  content: any,
  embedding: any
) => {
  const index = getPineconeIndex()
  await index.upsert([
    {
      id: `${conversationId}-${role}-${Date.now()}`,
      values: embedding,
      metadata: {
        role: role,
        content: JSON.stringify(content.content[0].text.value),
      },
    },
  ])
}

export const getRelatedMessages = async (topK = 8, embedding: any) => {
  const index = getPineconeIndex()
  const results = await index.query({
    vector: embedding,
    topK,
    includeValues: true,
    includeMetadata: true,
  })
  return results.matches.map(match => match?.metadata?.content)
}
