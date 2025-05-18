import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import HnswlibNode from 'hnswlib-node'
const { HierarchicalNSW } = HnswlibNode

const VECTOR_DIMENSION = 1536
const MAX_ELEMENTS = 10000
const INDEX_FILE_NAME = 'alice-thoughts-hnsw.index'
const METADATA_FILE_NAME = 'alice-thoughts-metadata.json'

const indexFilePath = path.join(app.getPath('userData'), INDEX_FILE_NAME)
const metadataFilePath = path.join(app.getPath('userData'), METADATA_FILE_NAME)

interface ThoughtMetadata {
  id: string
  conversationId: string
  role: string
  textContent: string
  createdAt: string
}

let index: HierarchicalNSW | null = null
let thoughtMetadata: ThoughtMetadata[] = []
let isStoreInitialized = false

async function loadIndexAndMetadata() {
  index = new HierarchicalNSW('cosine', VECTOR_DIMENSION)

  try {
    const metadataBuffer = await fs.readFile(metadataFilePath)
    thoughtMetadata = JSON.parse(metadataBuffer.toString())

    if (thoughtMetadata.length > 0) {
      try {
        await index.readIndex(indexFilePath)
        if (index.getMaxElements() < thoughtMetadata.length) {
          console.warn(
            '[ThoughtVectorStore] Index max elements less than metadata count. Re-initializing index for safety.'
          )
          index.initIndex(Math.max(MAX_ELEMENTS, thoughtMetadata.length + 1000))
        } else if (index.getCurrentCount() !== thoughtMetadata.length) {
          console.warn(
            `[ThoughtVectorStore] Index count (${index.getCurrentCount()}) mismatch with metadata count (${thoughtMetadata.length}). This might indicate an issue. Rebuilding index might be necessary if errors occur.`
          )
        }
      } catch (e) {
        console.warn(
          `[ThoughtVectorStore] Could not load HNSW index from ${indexFilePath}. It might be created fresh if metadata is empty or this is the first run. Error: ${(e as Error).message}`
        )
        index.initIndex(MAX_ELEMENTS)
      }
    } else {
      index.initIndex(MAX_ELEMENTS)
    }

    console.log(
      `[ThoughtVectorStore] Loaded ${thoughtMetadata.length} metadata items. Index current count: ${index.getCurrentCount()}`
    )
  } catch (error) {
    console.warn(
      `[ThoughtVectorStore] Metadata file not found or corrupt at ${metadataFilePath}. Initializing fresh store. Error: ${(error as Error).message}`
    )
    thoughtMetadata = []
    index.initIndex(MAX_ELEMENTS)
  }
  isStoreInitialized = true
}

async function saveIndexAndMetadata() {
  if (!index) return
  try {
    const dir = path.dirname(indexFilePath)
    await fs.mkdir(dir, { recursive: true })

    await index.writeIndex(indexFilePath)
    await fs.writeFile(
      metadataFilePath,
      JSON.stringify(thoughtMetadata, null, 2)
    )
    console.log('[ThoughtVectorStore] Index and metadata saved.')
  } catch (error) {
    console.error('[ThoughtVectorStore] Error saving index or metadata:', error)
  }
}

export async function initializeThoughtVectorStore(): Promise<void> {
  if (isStoreInitialized) return
  await loadIndexAndMetadata()
}

export async function addThoughtVector(
  conversationId: string,
  role: string,
  textContent: string,
  embedding: number[]
): Promise<void> {
  if (!isStoreInitialized || !index) {
    console.error(
      '[ThoughtVectorStore] Store not initialized. Cannot add vector.'
    )
    await initializeThoughtVectorStore()
    if (!isStoreInitialized || !index) {
      n
      throw new Error('Failed to initialize thought vector store.')
    }
  }

  if (embedding.length !== VECTOR_DIMENSION) {
    throw new Error(
      `[ThoughtVectorStore] Embedding dimension mismatch. Expected ${VECTOR_DIMENSION}, got ${embedding.length}`
    )
  }

  const newThoughtId = `${conversationId}-${role}-${Date.now()}`
  const label = thoughtMetadata.length

  if (label >= index.getMaxElements()) {
    console.warn(
      `[ThoughtVectorStore] Index is full (max ${index.getMaxElements()}). Resizing.`
    )
    const newMaxElements =
      index.getMaxElements() +
      Math.max(1000, Math.floor(index.getMaxElements() * 0.2))
    index.resizeIndex(newMaxElements)
    console.log(`[ThoughtVectorStore] Index resized to ${newMaxElements}`)
  }

  thoughtMetadata.push({
    id: newThoughtId,
    conversationId,
    role,
    textContent,
    createdAt: new Date().toISOString(),
  })
  index.addPoint(embedding, label)

  await saveIndexAndMetadata()
  console.log(
    `[ThoughtVectorStore] Added thought with label ${label}, ID ${newThoughtId}. Current count: ${index.getCurrentCount()}`
  )
}

export async function searchSimilarThoughts(
  queryEmbedding: number[],
  topK: number
): Promise<ThoughtMetadata[]> {
  console.log(
    '[ThoughtVectorStore searchSimilarThoughts] Received query for search.'
  )

  if (!isStoreInitialized || !index || index.getCurrentCount() === 0) {
    console.log(
      '[ThoughtVectorStore searchSimilarThoughts] Store not initialized, empty, or index missing. Returning empty.'
    )
    return []
  }
  if (queryEmbedding.length !== VECTOR_DIMENSION) {
    const errMsg = `[ThoughtVectorStore searchSimilarThoughts] Query embedding dimension mismatch. Expected ${VECTOR_DIMENSION}, got ${queryEmbedding.length}`
    console.error(errMsg)
    return []
  }

  const numPointsInIndex = index.getCurrentCount()
  console.log(
    `[ThoughtVectorStore searchSimilarThoughts] Searching in index with ${numPointsInIndex} points.`
  )
  if (numPointsInIndex === 0) return []

  const results = index.searchKnn(
    queryEmbedding,
    Math.min(topK, numPointsInIndex)
  )
  console.log(
    '[ThoughtVectorStore searchSimilarThoughts] HNSW searchKnn results:',
    JSON.stringify(results, null, 2)
  )

  const similarThoughts: ThoughtMetadata[] = []
  if (results && results.neighbors) {
    for (const label of results.neighbors) {
      const metadata = thoughtMetadata[label]
      if (metadata) {
        console.log(
          `[ThoughtVectorStore searchSimilarThoughts] Found metadata for label ${label}: ${metadata.textContent.substring(0, 50)}...`
        )
        similarThoughts.push(metadata)
      } else {
        console.warn(
          `[ThoughtVectorStore searchSimilarThoughts] No metadata found for search result label: ${label}. Total metadata items: ${thoughtMetadata.length}`
        )
      }
    }
  } else {
    console.warn(
      '[ThoughtVectorStore searchSimilarThoughts] HNSW searchKnn returned no results or no neighbors.'
    )
  }
  console.log(
    `[ThoughtVectorStore searchSimilarThoughts] Returning ${similarThoughts.length} similar thoughts.`
  )
  return similarThoughts
}

export async function deleteAllThoughtVectors(): Promise<void> {
  if (!index) {
    await initializeThoughtVectorStore()
    if (!index) return
  }
  thoughtMetadata = []
  index.clearPoints()
  if (!index.isIndexInitialized()) {
    index.initIndex(MAX_ELEMENTS)
  }
  await saveIndexAndMetadata()
  console.log('[ThoughtVectorStore] All thought vectors and metadata deleted.')
}

export async function ensureSaveOnQuit(): Promise<void> {
  if (
    isStoreInitialized &&
    index &&
    (index.getCurrentCount() > 0 || thoughtMetadata.length > 0)
  ) {
    console.log(
      '[ThoughtVectorStore] ensureSaveOnQuit: Saving index and metadata...'
    )
    await saveIndexAndMetadata()
    console.log('[ThoughtVectorStore] ensureSaveOnQuit: Save complete.')
  } else {
    console.log(
      '[ThoughtVectorStore] ensureSaveOnQuit: No data to save or store not initialized.'
    )
  }
}
