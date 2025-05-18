import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import HnswlibNode from 'hnswlib-node'
const { HierarchicalNSW } = HnswlibNode
import Database from 'better-sqlite3'

const VECTOR_DIMENSION = 1536
const MAX_ELEMENTS_HNSW = 10000
const HNSW_INDEX_FILE_NAME = 'alice-thoughts-hnsw.index'
const DB_FILE_NAME = 'alice-thoughts.sqlite'

const hnswIndexFilePath = path.join(
  app.getPath('userData'),
  HNSW_INDEX_FILE_NAME
)
const dbFilePath = path.join(app.getPath('userData'), DB_FILE_NAME)

interface ThoughtMetadata {
  id: string
  conversationId: string
  role: string
  textContent: string
  createdAt: string
}

let hnswIndex: HierarchicalNSW | null = null
let db: Database.Database | null = null
let isStoreInitialized = false

function initDB() {
  db = new Database(dbFilePath, { verbose: console.log })
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS thoughts (
      hnsw_label INTEGER PRIMARY KEY,
      thought_id TEXT UNIQUE NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text_content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      embedding BLOB
    );
  `)
  console.log(
    '[ThoughtVectorStore DB] SQLite database initialized and table ensured.'
  )
}

function insertThoughtMetadata(
  label: number,
  thoughtId: string,
  conversationId: string,
  role: string,
  textContent: string,
  createdAt: string,
  embedding: number[]
) {
  if (!db) throw new Error('Database not initialized for inserting metadata.')
  const stmt = db.prepare(`
    INSERT INTO thoughts (hnsw_label, thought_id, conversation_id, role, text_content, created_at, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer)
  stmt.run(
    label,
    thoughtId,
    conversationId,
    role,
    textContent,
    createdAt,
    embeddingBuffer
  )
}

function getThoughtMetadataByLabels(labels: number[]): ThoughtMetadata[] {
  if (!db) throw new Error('Database not initialized for fetching metadata.')
  if (labels.length === 0) return []

  const placeholders = labels.map(() => '?').join(',')
  const stmt = db.prepare(`
        SELECT thought_id, conversation_id, role, text_content, created_at
        FROM thoughts
        WHERE hnsw_label IN (${placeholders})
        ORDER BY hnsw_label
    `)
  const rows = stmt.all(...labels) as any[]
  return rows.map(row => ({
    id: row.thought_id,
    conversationId: row.conversation_id,
    role: row.role,
    textContent: row.text_content,
    createdAt: row.created_at,
  }))
}

function getAllEmbeddingsWithLabelsFromDB(): {
  label: number
  embedding: number[]
}[] {
  if (!db) throw new Error('Database not initialized for fetching embeddings.')
  const stmt = db.prepare(
    'SELECT hnsw_label, embedding FROM thoughts ORDER BY hnsw_label'
  )
  const rows = stmt.all() as { hnsw_label: number; embedding: Buffer }[]
  return rows.map(row => ({
    label: row.hnsw_label,
    embedding: Array.from(
      new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT
      )
    ),
  }))
}

async function loadIndexAndSyncWithDB() {
  if (!db) initDB()
  if (!db) throw new Error('Failed to initialize database for loading index.')

  hnswIndex = new HierarchicalNSW('cosine', VECTOR_DIMENSION)

  let numPointsInDB = 0
  try {
    const countResult = db
      .prepare('SELECT COUNT(*) as count FROM thoughts')
      .get() as { count: number }
    numPointsInDB = countResult.count
  } catch (e) {
    console.error('[ThoughtVectorStore DB] Error counting thoughts in DB:', e)
  }

  console.log(`[ThoughtVectorStore LOAD] Points found in DB: ${numPointsInDB}`)

  try {
    if (numPointsInDB > 0) {
      console.log(
        `[ThoughtVectorStore LOAD] Attempting to load HNSW index from ${hnswIndexFilePath}`
      )
      await hnswIndex.readIndex(hnswIndexFilePath)
      console.log(
        `[ThoughtVectorStore LOAD] HNSW index loaded. Current count: ${hnswIndex.getCurrentCount()}, Max elements: ${hnswIndex.getMaxElements()}`
      )

      if (hnswIndex.getCurrentCount() !== numPointsInDB) {
        console.warn(
          `[ThoughtVectorStore LOAD] HNSW index count (${hnswIndex.getCurrentCount()}) mismatch with DB count (${numPointsInDB}). Rebuilding HNSW index from DB embeddings.`
        )
        await rebuildHnswIndexFromDB()
      }
      if (hnswIndex.getMaxElements() < numPointsInDB) {
        console.warn(
          `[ThoughtVectorStore LOAD] HNSW index capacity is less than DB points. Resizing index.`
        )
        hnswIndex.resizeIndex(Math.max(MAX_ELEMENTS_HNSW, numPointsInDB + 1000))
      }
    } else {
      console.log(
        '[ThoughtVectorStore LOAD] No points in DB, initializing fresh HNSW index.'
      )
      hnswIndex.initIndex(MAX_ELEMENTS_HNSW)
    }
  } catch (error) {
    console.warn(
      `[ThoughtVectorStore LOAD] Could not load HNSW index from file or issue during sync. Error: ${(error as Error).message}. Rebuilding index from DB if possible, or initializing fresh.`
    )
    if (numPointsInDB > 0) {
      await rebuildHnswIndexFromDB()
    } else {
      hnswIndex.initIndex(MAX_ELEMENTS_HNSW)
    }
  }
  isStoreInitialized = true
}

async function rebuildHnswIndexFromDB() {
  if (!db || !hnswIndex) {
    console.error(
      '[ThoughtVectorStore REBUILD] DB or HNSW Index not initialized. Cannot rebuild.'
    )
    return
  }
  console.log(
    '[ThoughtVectorStore REBUILD] Starting HNSW index rebuild from database embeddings...'
  )
  hnswIndex.initIndex(
    Math.max(
      MAX_ELEMENTS_HNSW,
      (
        db.prepare('SELECT COUNT(*) as count FROM thoughts').get() as {
          count: number
        }
      ).count + 1000
    )
  )

  const allEmbeddings = getAllEmbeddingsWithLabelsFromDB()
  if (allEmbeddings.length === 0) {
    console.log(
      '[ThoughtVectorStore REBUILD] No embeddings in DB to rebuild index from.'
    )
    return
  }

  for (const item of allEmbeddings) {
    if (item.label >= hnswIndex.getMaxElements()) {
      hnswIndex.resizeIndex(item.label + 1000)
    }
    hnswIndex.addPoint(item.embedding, item.label)
  }
  console.log(
    `[ThoughtVectorStore REBUILD] HNSW index rebuilt with ${hnswIndex.getCurrentCount()} points.`
  )
  await saveHnswIndex()
}

async function saveHnswIndex() {
  if (!hnswIndex) return
  try {
    const dir = path.dirname(hnswIndexFilePath)
    await fs.mkdir(dir, { recursive: true })
    await hnswIndex.writeIndex(hnswIndexFilePath)
    console.log('[ThoughtVectorStore] HNSW Index saved.')
  } catch (error) {
    console.error('[ThoughtVectorStore] Error saving HNSW index:', error)
  }
}

export async function initializeThoughtVectorStore(): Promise<void> {
  if (isStoreInitialized) return
  initDB()
  await loadIndexAndSyncWithDB()
}

export async function addThoughtVector(
  conversationId: string,
  role: string,
  textContent: string,
  embedding: number[]
): Promise<void> {
  if (!isStoreInitialized || !hnswIndex || !db) {
    console.error('[ThoughtVectorStore ADD] Store not initialized properly.')
    await initializeThoughtVectorStore()
    if (!isStoreInitialized || !hnswIndex || !db) {
      throw new Error(
        'Failed to initialize thought vector store for adding vector.'
      )
    }
  }

  if (embedding.length !== VECTOR_DIMENSION) {
    throw new Error(
      `[ThoughtVectorStore ADD] Embedding dimension mismatch. Expected ${VECTOR_DIMENSION}, got ${embedding.length}`
    )
  }

  const thoughtId = `${conversationId}-${role}-${Date.now()}`

  const label = hnswIndex.getCurrentCount()

  if (label >= hnswIndex.getMaxElements()) {
    console.warn(
      `[ThoughtVectorStore ADD] Index is full (max ${hnswIndex.getMaxElements()}). Resizing.`
    )
    const newMaxElements =
      hnswIndex.getMaxElements() +
      Math.max(1000, Math.floor(hnswIndex.getMaxElements() * 0.2))
    hnswIndex.resizeIndex(newMaxElements)
    console.log(`[ThoughtVectorStore ADD] Index resized to ${newMaxElements}`)
  }

  db.transaction(() => {
    insertThoughtMetadata(
      label,
      thoughtId,
      conversationId,
      role,
      textContent,
      new Date().toISOString(),
      embedding
    )
    hnswIndex.addPoint(embedding, label)
  })()

  await saveHnswIndex()
  console.log(
    `[ThoughtVectorStore ADD] Added thought with HNSW label ${label}, ID ${thoughtId}. HNSW count: ${hnswIndex.getCurrentCount()}`
  )
}

export async function searchSimilarThoughts(
  queryEmbedding: number[],
  topK: number
): Promise<ThoughtMetadata[]> {
  console.log('[ThoughtVectorStore SEARCH] Received query.')
  if (
    !isStoreInitialized ||
    !hnswIndex ||
    !db ||
    hnswIndex.getCurrentCount() === 0
  ) {
    console.log('[ThoughtVectorStore SEARCH] Store not ready or empty.')
    return []
  }
  if (queryEmbedding.length !== VECTOR_DIMENSION) {
    console.error(
      `[ThoughtVectorStore SEARCH] Query embedding dimension mismatch.`
    )
    return []
  }

  const numPointsInIndex = hnswIndex.getCurrentCount()
  console.log(
    `[ThoughtVectorStore SEARCH] Searching in HNSW index with ${numPointsInIndex} points.`
  )
  if (numPointsInIndex === 0) return []

  const results = hnswIndex.searchKnn(
    queryEmbedding,
    Math.min(topK, numPointsInIndex)
  )
  console.log(
    '[ThoughtVectorStore SEARCH] HNSW searchKnn results (labels):',
    results.neighbors
  )

  if (!results || !results.neighbors || results.neighbors.length === 0) {
    console.log('[ThoughtVectorStore SEARCH] HNSW returned no neighbors.')
    return []
  }

  const retrievedMetadata = getThoughtMetadataByLabels(results.neighbors)
  console.log(
    `[ThoughtVectorStore SEARCH] Retrieved ${retrievedMetadata.length} metadata items from DB.`
  )

  return retrievedMetadata
}

export async function deleteAllThoughtVectors(): Promise<void> {
  if (!isStoreInitialized || !hnswIndex || !db) {
    console.warn(
      '[ThoughtVectorStore DELETE ALL] Store not initialized. Attempting init.'
    )
    await initializeThoughtVectorStore()
    if (!isStoreInitialized || !hnswIndex || !db) {
      console.error(
        '[ThoughtVectorStore DELETE ALL] Initialization failed. Cannot delete.'
      )
      return
    }
  }
  console.log(
    '[ThoughtVectorStore DELETE ALL] Deleting all thoughts from DB and HNSW index.'
  )
  db.prepare('DELETE FROM thoughts').run()
  hnswIndex.clearPoints()
  if (!hnswIndex.isIndexInitialized() || hnswIndex.getCurrentCount() > 0) {
    hnswIndex.initIndex(MAX_ELEMENTS_HNSW)
  }
  await saveHnswIndex()
  console.log(
    '[ThoughtVectorStore DELETE ALL] All thought vectors and DB entries deleted.'
  )
}

export async function ensureSaveOnQuit(): Promise<void> {
  if (isStoreInitialized && hnswIndex && hnswIndex.getCurrentCount() > 0) {
    await saveHnswIndex()
    console.log('[ThoughtVectorStore QUIT_SAVE] HNSW Index save complete.')
  } else {
    console.log(
      '[ThoughtVectorStore QUIT_SAVE] No HNSW index data to save or store not initialized.'
    )
  }
  if (db) {
    db.close()
    console.log('[ThoughtVectorStore QUIT_SAVE] DB connection closed.')
  }
}
