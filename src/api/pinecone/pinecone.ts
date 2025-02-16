import { Pinecone } from '@pinecone-database/pinecone'

const pinecone = new Pinecone({
  apiKey: import.meta.env.VITE_PINECONE_API_KEY,
})

const index = pinecone.Index(import.meta.env.VITE_PINECONE_INDEX)

export const setIndex = async (
  conversationId: string,
  role: string,
  content: any,
  embedding: any
) => {
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

export const getRelatedMessages = async (topK = 5, embedding: any) => {
  const results = await index.query({
    vector: embedding,
    topK,
    includeValues: true,
    includeMetadata: true,
  })
  return results.matches.map(match => match?.metadata?.content)
}
