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
    const errorMessage = 'Pinecone Index name is not configured in production.'
    console.error(errorMessage)
    throw new Error(errorMessage)
  }
  return pinecone.Index(settings.VITE_PINECONE_INDEX)
}

export const setIndex = async (
  conversationId: string,
  role: string,
  textContent: string,
  embedding: number[]
) => {
  const index = getPineconeIndex()
  await index.upsert([
    {
      id: `${conversationId}-${role}-${Date.now()}`,
      values: embedding,
      metadata: {
        role: role,
        content: textContent,
      },
    },
  ])
  console.log(
    `[Pinecone] Indexed message for conversation ${conversationId}, role ${role}.`
  )
}

export const getRelatedMessages = async (
  topK = 8,
  embedding: number[]
): Promise<(string | undefined)[]> => {
  const index = getPineconeIndex()
  const results = await index.query({
    vector: embedding,
    topK,
    includeValues: false,
    includeMetadata: true,
  })

  return results.matches.map(
    match => match.metadata?.content as string | undefined
  )
}
