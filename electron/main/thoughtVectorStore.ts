import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import HnswlibNode from 'hnswlib-node'
const { HierarchicalNSW } = HnswlibNode
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

const VECTOR_DIMENSION = 1536
const MAX_ELEMENTS_HNSW = 10000
const HNSW_INDEX_FILE_NAME = 'alice-thoughts-hnsw.index'
const DB_FILE_NAME = 'alice-thoughts.sqlite'
const OLD_MEMORIES_JSON_FILE = 'alice-memories.json'

const hnswIndexFilePath = path.join(
  app.getPath('userData'),
  HNSW_INDEX_FILE_NAME
)
const dbFilePath = path.join(app.getPath('userData'), DB_FILE_NAME)
const oldJsonMemoriesPath = path.join(
  app.getPath('userData'),
  OLD_MEMORIES_JSON_FILE
)

export interface ThoughtMetadata {
  id: string
  conversationId: string
  role: string
  textContent: string
  createdAt: string
}

export interface RawMessageRecord {
  role: string
  text_content: string
  created_at: string
}

export interface ConversationSummaryRecord {
  id: string
  summary_text: string
  summarized_messages_count: number
  conversation_id?: string
  created_at: string
}

export interface MemoryRecord {
  id: string
  content: string
  memoryType: string
  createdAt: string
  embedding?: number[] | Buffer
}

let hnswIndex: HierarchicalNSW | null = null
let db: Database.Database | null = null
let isStoreInitialized = false

function initDB() {
  if (db) return

  db = new Database(dbFilePath)
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS long_term_memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      embedding BLOB NULLABLE
    );
    CREATE INDEX IF NOT EXISTS idx_ltm_memory_type ON long_term_memories (memory_type);
    CREATE INDEX IF NOT EXISTS idx_ltm_created_at ON long_term_memories (created_at);
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS migration_flags (
      flag_name TEXT PRIMARY KEY,
      completed INTEGER NOT NULL DEFAULT 0
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_summaries (
      id TEXT PRIMARY KEY,
      summary_text TEXT NOT NULL,
      summarized_messages_count INTEGER NOT NULL,
      conversation_id TEXT, -- Optional: to scope summaries to specific conversations
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cs_created_at ON conversation_summaries (created_at);
    CREATE INDEX IF NOT EXISTS idx_cs_conversation_id ON conversation_summaries (conversation_id);
  `)

  console.log(
    '[ThoughtVectorStore DB] SQLite database initialized and tables ensured (including conversation_summaries).'
  )
}

async function migrateMemoriesFromJsonToDb() {
  if (!db) {
    console.error('[Migration] DB not initialized. Cannot migrate.')
    return
  }

  const migrationFlag = db
    .prepare('SELECT completed FROM migration_flags WHERE flag_name = ?')
    .get('json_memories_migrated') as { completed: number } | undefined

  if (migrationFlag && migrationFlag.completed === 1) {
    console.log('[Migration] JSON memories already migrated. Skipping.')
    return
  }

  try {
    await fs.access(oldJsonMemoriesPath)
    const jsonData = await fs.readFile(oldJsonMemoriesPath, 'utf-8')
    const oldMemories = JSON.parse(jsonData) as MemoryRecord[]

    if (oldMemories && oldMemories.length > 0) {
      console.log(
        `[Migration] Found ${oldMemories.length} memories in JSON file. Starting migration...`
      )
      const insertStmt = db.prepare(
        'INSERT OR IGNORE INTO long_term_memories (id, content, memory_type, created_at, embedding) VALUES (?, ?, ?, ?, ?)'
      )

      db.transaction(() => {
        for (const memory of oldMemories) {
          insertStmt.run(
            memory.id || randomUUID(),
            memory.content,
            memory.memoryType,
            memory.createdAt,
            null
          )
        }
      })()
      console.log(
        '[Migration] Successfully migrated memories from JSON to SQLite.'
      )

      db.prepare(
        'INSERT OR REPLACE INTO migration_flags (flag_name, completed) VALUES (?, ?)'
      ).run('json_memories_migrated', 1)

      try {
        await fs.rename(oldJsonMemoriesPath, `${oldJsonMemoriesPath}.migrated`)
        console.log(
          `[Migration] Renamed old JSON memories file to ${OLD_MEMORIES_JSON_FILE}.migrated`
        )
      } catch (renameError) {
        console.error(
          '[Migration] Could not rename old JSON file, please handle manually:',
          renameError
        )
      }
    } else {
      console.log(
        '[Migration] Old JSON memories file is empty or not found. No migration needed from JSON.'
      )
      db.prepare(
        'INSERT OR REPLACE INTO migration_flags (flag_name, completed) VALUES (?, ?)'
      ).run('json_memories_migrated', 1)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(
        '[Migration] Old JSON memories file not found. No migration needed from JSON.'
      )
      db.prepare(
        'INSERT OR REPLACE INTO migration_flags (flag_name, completed) VALUES (?, ?)'
      ).run('json_memories_migrated', 1)
    } else {
      console.error('[Migration] Error during JSON memory migration:', error)
    }
  }
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
  try {
    const stmt = db.prepare(`
      INSERT INTO thoughts (hnsw_label, thought_id, conversation_id, role, text_content, created_at, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer)
    const info = stmt.run(
      label,
      thoughtId,
      conversationId,
      role,
      textContent,
      createdAt,
      embeddingBuffer
    )
    if (info.changes === 0) {
      console.warn(
        '[insertThoughtMetadata] SQLite insert reported 0 changes. ID might exist or other issue.',
        { label, thoughtId }
      )
    }
  } catch (dbError) {
    console.error('[insertThoughtMetadata] SQLite insert FAILED:', dbError)
    throw dbError
  }
}

function getThoughtMetadataByLabels(labels: number[]): ThoughtMetadata[] {
  if (!db) throw new Error('Database not initialized for fetching metadata.')
  if (labels.length === 0) return []

  const placeholders = labels.map(() => '?').join(',')
  const stmt = db.prepare(`
        SELECT thought_id, conversation_id, role, text_content, created_at
        FROM thoughts
        WHERE hnsw_label IN (${placeholders})
        ORDER BY hnsw_label /* Order by label to match HNSW results if needed, though created_at might be more useful for context */
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
  if (!db)
    throw new Error('Failed to initialize database for loading HNSW index.')

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
  if (!hnswIndex || !isStoreInitialized) {
    console.warn(
      '[ThoughtVectorStore Save] Attempted to save HNSW index but store or index not ready.'
    )
    return
  }
  try {
    const dir = path.dirname(hnswIndexFilePath)
    await fs.mkdir(dir, { recursive: true })
    await hnswIndex.writeIndex(hnswIndexFilePath)
  } catch (error) {
    console.error('[ThoughtVectorStore] Error saving HNSW index:', error)
  }
}

export async function initializeThoughtVectorStore(): Promise<void> {
  if (isStoreInitialized) return
  initDB()
  await migrateMemoriesFromJsonToDb()
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

  const thoughtId = `${conversationId}-${role}-${Date.now()}-${randomUUID().substring(0, 8)}`
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
}

export async function searchSimilarThoughts(
  queryEmbedding: number[],
  topK: number
): Promise<ThoughtMetadata[]> {
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
  if (numPointsInIndex === 0) return []

  const results = hnswIndex.searchKnn(
    queryEmbedding,
    Math.min(topK, numPointsInIndex)
  )

  if (!results || !results.neighbors || results.neighbors.length === 0) {
    console.log('[ThoughtVectorStore SEARCH] HNSW returned no neighbors.')
    return []
  }

  const retrievedMetadata = getThoughtMetadataByLabels(results.neighbors)

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

  hnswIndex.initIndex(MAX_ELEMENTS_HNSW)
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
    db.close((err: Error | null) => {
      if (err) {
        console.error(
          '[ThoughtVectorStore QUIT_SAVE] Error closing DB:',
          err.message
        )
      } else {
        console.log('[ThoughtVectorStore QUIT_SAVE] DB connection closed.')
      }
    })
    db = null
  }
}

export function getDBInstance(): Database.Database {
  if (!db) {
    initDB()
  }
  if (!db) {
    throw new Error('Failed to initialize database instance.')
  }
  return db
}

/**
 * Retrieves the most recent raw messages from the thoughts table for summarization.
 * @param limit The maximum number of messages to retrieve.
 * @param conversationId Optional. If provided, messages will be scoped to this conversation.
 * @returns A promise that resolves to an array of RawMessageRecord.
 */
export async function getRecentMessagesForSummarization(
  limit: number,
  conversationId?: string
): Promise<RawMessageRecord[]> {
  const currentDb = getDBInstance()
  try {
    let sql = 'SELECT role, text_content, created_at FROM thoughts'
    const params: any[] = []

    if (conversationId) {
      sql += ' WHERE conversation_id = ?'
      params.push(conversationId)
    }

    sql += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    const rows = currentDb.prepare(sql).all(...params) as RawMessageRecord[]
    return rows.reverse()
  } catch (error) {
    console.error(
      'Failed to get recent messages for summarization from SQLite:',
      error
    )
    throw error
  }
}

/**
 * Saves a new conversation summary to the database.
 * @param summaryText The text of the summary.
 * @param summarizedMessagesCount The number of messages that were summarized.
 * @param conversationId Optional. The ID of the conversation this summary belongs to.
 * @returns A promise that resolves to the saved ConversationSummaryRecord.
 */
export async function saveConversationSummary(
  summaryText: string,
  summarizedMessagesCount: number,
  conversationId?: string
): Promise<ConversationSummaryRecord> {
  const currentDb = getDBInstance()
  const id = randomUUID()
  const createdAt = new Date().toISOString()

  try {
    const stmt = currentDb.prepare(
      'INSERT INTO conversation_summaries (id, summary_text, summarized_messages_count, conversation_id, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run(
      id,
      summaryText,
      summarizedMessagesCount,
      conversationId,
      createdAt
    )
    console.log(
      '[ThoughtVectorStore] Conversation summary saved to SQLite:',
      id
    )
    return {
      id,
      summary_text: summaryText,
      summarized_messages_count: summarizedMessagesCount,
      conversation_id: conversationId,
      created_at: createdAt,
    }
  } catch (error) {
    console.error('Failed to save conversation summary to SQLite:', error)
    throw error
  }
}

/**
 * Retrieves the latest conversation summary.
 * @param conversationId Optional. If provided, retrieves the latest summary for that specific conversation.
 * @returns A promise that resolves to the latest ConversationSummaryRecord or null if none found.
 */
export async function getLatestConversationSummary(
  conversationId?: string
): Promise<ConversationSummaryRecord | null> {
  const currentDb = getDBInstance()
  try {
    let sql =
      'SELECT id, summary_text, summarized_messages_count, conversation_id, created_at FROM conversation_summaries'
    const params: any[] = []

    if (conversationId) {
      sql += ' WHERE conversation_id = ?'
      params.push(conversationId)
    }

    sql += ' ORDER BY created_at DESC LIMIT 1'

    const row = currentDb.prepare(sql).get(...params) as
      | ConversationSummaryRecord
      | undefined
    return row || null
  } catch (error) {
    console.error(
      'Failed to get latest conversation summary from SQLite:',
      error
    )
    throw error
  }
}
