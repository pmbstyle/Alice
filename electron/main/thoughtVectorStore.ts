import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import HnswlibNode from 'hnswlib-node'
const { HierarchicalNSW } = HnswlibNode
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

const OPENAI_VECTOR_DIMENSION = 1536  // OpenAI embedding dimension
const LOCAL_VECTOR_DIMENSION = 1024   // Qwen3 embedding dimension
const MAX_ELEMENTS_HNSW = 10000
const HNSW_OPENAI_INDEX_FILE_NAME = 'alice-thoughts-hnsw-openai.index'
const HNSW_LOCAL_INDEX_FILE_NAME = 'alice-thoughts-hnsw-local.index'
const DB_FILE_NAME = 'alice-thoughts.sqlite'
const OLD_MEMORIES_JSON_FILE = 'alice-memories.json'

const hnswOpenAIIndexFilePath = path.join(
  app.getPath('userData'),
  HNSW_OPENAI_INDEX_FILE_NAME
)
const hnswLocalIndexFilePath = path.join(
  app.getPath('userData'),
  HNSW_LOCAL_INDEX_FILE_NAME
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

let hnswOpenAIIndex: HierarchicalNSW | null = null
let hnswLocalIndex: HierarchicalNSW | null = null

let openAILabelToThoughtId: Map<number, string> = new Map()
let localLabelToThoughtId: Map<number, string> = new Map()
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

  runDualEmbeddingMigration()

}

function runDualEmbeddingMigration() {
  if (!db) return

  // Check if migration already completed
  const migrationFlag = db.prepare('SELECT completed FROM migration_flags WHERE flag_name = ?').get('dual_embedding_support')
  if (migrationFlag?.completed) {
    return
  }

  try {
    // Backup existing embedding column to openai-specific column for thoughts table
    db.exec(`
      ALTER TABLE thoughts ADD COLUMN embedding_openai BLOB;
      ALTER TABLE thoughts ADD COLUMN embedding_local BLOB;
    `)
    
    // Migrate existing embeddings to openai column
    const existingThoughtsStmt = db.prepare('SELECT hnsw_label, embedding FROM thoughts WHERE embedding IS NOT NULL')
    const updateThoughtStmt = db.prepare('UPDATE thoughts SET embedding_openai = ? WHERE hnsw_label = ?')
    
    const existingThoughts = existingThoughtsStmt.all() as { hnsw_label: number; embedding: Buffer }[]
    for (const thought of existingThoughts) {
      updateThoughtStmt.run(thought.embedding, thought.hnsw_label)
    }

    // Backup existing embedding column to openai-specific column for long_term_memories table  
    db.exec(`
      ALTER TABLE long_term_memories ADD COLUMN embedding_openai BLOB;
      ALTER TABLE long_term_memories ADD COLUMN embedding_local BLOB;
    `)
    
    // Migrate existing embeddings to openai column
    const existingMemoriesStmt = db.prepare('SELECT id, embedding FROM long_term_memories WHERE embedding IS NOT NULL')
    const updateMemoryStmt = db.prepare('UPDATE long_term_memories SET embedding_openai = ? WHERE id = ?')
    
    const existingMemories = existingMemoriesStmt.all() as { id: string; embedding: Buffer }[]
    for (const memory of existingMemories) {
      updateMemoryStmt.run(memory.embedding, memory.id)
    }

    // Mark migration as completed
    db.prepare('INSERT OR REPLACE INTO migration_flags (flag_name, completed) VALUES (?, 1)').run('dual_embedding_support')
    
    if (existingThoughts.length > 0 || existingMemories.length > 0) {
      console.log(`[ThoughtVectorStore Migration] Migrated ${existingThoughts.length} thoughts and ${existingMemories.length} memories to dual embedding support.`)
    }
  } catch (error) {
    console.error('[ThoughtVectorStore Migration] Error during dual embedding migration:', error)
    // Migration failure is non-fatal - system will continue with legacy single embedding column
  }
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
  thoughtId: string,
  conversationId: string,
  role: string,
  textContent: string,
  createdAt: string,
  embedding: number[],
  provider: 'openai' | 'local' = 'openai'
) {
  if (!db) throw new Error('Database not initialized for inserting metadata.')
  try {
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer)
    
    // Check if this thought already exists
    const existingStmt = db.prepare('SELECT thought_id FROM thoughts WHERE thought_id = ?')
    const existing = existingStmt.get(thoughtId)
    
    if (existing) {
      // Update existing thought with new embedding
      const embeddingColumn = provider === 'local' ? 'embedding_local' : 'embedding_openai'
      const updateStmt = db.prepare(`
        UPDATE thoughts SET ${embeddingColumn} = ?, 
        role = ?, text_content = ?, created_at = ?
        WHERE thought_id = ?
      `)
      updateStmt.run(embeddingBuffer, role, textContent, createdAt, thoughtId)
      
      // Also update legacy embedding column for backward compatibility
      if (provider === 'openai') {
        const legacyStmt = db.prepare('UPDATE thoughts SET embedding = ? WHERE thought_id = ?')
        legacyStmt.run(embeddingBuffer, thoughtId)
      }
    } else {
      // Insert new thought - generate unique hnsw_label to avoid constraint issues
      const embeddingOpenAI = provider === 'openai' ? embeddingBuffer : null
      const embeddingLocal = provider === 'local' ? embeddingBuffer : null
      const legacyEmbedding = provider === 'openai' ? embeddingBuffer : null
      
      // Get next available hnsw_label from database
      const maxLabelResult = db.prepare('SELECT COALESCE(MAX(hnsw_label), -1) + 1 as next_label FROM thoughts').get() as { next_label: number }
      const nextLabel = maxLabelResult.next_label
      
      const insertStmt = db.prepare(`
        INSERT INTO thoughts (hnsw_label, thought_id, conversation_id, role, text_content, created_at, embedding, embedding_openai, embedding_local)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      
      const info = insertStmt.run(
        nextLabel,
        thoughtId,
        conversationId,
        role,
        textContent,
        createdAt,
        legacyEmbedding,
        embeddingOpenAI,
        embeddingLocal
      )
      
      if (info.changes === 0) {
        console.warn(
          '[insertThoughtMetadata] SQLite insert reported 0 changes. ID might exist or other issue.',
          { thoughtId }
        )
      }
    }
  } catch (dbError) {
    console.error('[insertThoughtMetadata] SQLite insert FAILED:', dbError)
    throw dbError
  }
}

function getThoughtMetadataByLabels(labels: number[], provider: 'openai' | 'local'): ThoughtMetadata[] {
  if (!db) throw new Error('Database not initialized for fetching metadata.')
  if (labels.length === 0) return []

  const labelMapping = provider === 'local' ? localLabelToThoughtId : openAILabelToThoughtId
  
  // Convert HNSW labels to thought_ids using our mapping
  const thoughtIds = labels.map(label => labelMapping.get(label)).filter(Boolean) as string[]
  
  if (thoughtIds.length === 0) return []

  const placeholders = thoughtIds.map(() => '?').join(',')
  const stmt = db.prepare(`
        SELECT thought_id, conversation_id, role, text_content, created_at
        FROM thoughts
        WHERE thought_id IN (${placeholders})
        ORDER BY created_at
    `)
  const rows = stmt.all(...thoughtIds) as any[]
  return rows.map(row => ({
    id: row.thought_id,
    conversationId: row.conversation_id,
    role: row.role,
    textContent: row.text_content,
    createdAt: row.created_at,
  }))
}

function getAllEmbeddingsWithLabelsFromDB(provider: 'openai' | 'local'): {
  label: number
  embedding: number[]
  thoughtId: string
}[] {
  if (!db) throw new Error('Database not initialized for fetching embeddings.')
  
  let query: string
  if (provider === 'local') {
    query = 'SELECT thought_id, embedding_local as embedding FROM thoughts WHERE embedding_local IS NOT NULL ORDER BY thought_id'
  } else {
    // For OpenAI, prefer new column but fallback to legacy
    query = 'SELECT thought_id, COALESCE(embedding_openai, embedding) as embedding FROM thoughts WHERE embedding_openai IS NOT NULL OR (embedding_openai IS NULL AND embedding IS NOT NULL) ORDER BY thought_id'
  }
  
  const stmt = db.prepare(query)
  const rows = stmt.all() as { thought_id: string; embedding: Buffer }[]
  
  // Create sequential labels for this provider
  return rows.map((row, index) => ({
    label: index, // Sequential labeling per provider
    thoughtId: row.thought_id,
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

  // Initialize both OpenAI and Local indices
  hnswOpenAIIndex = new HierarchicalNSW('cosine', OPENAI_VECTOR_DIMENSION)
  hnswLocalIndex = new HierarchicalNSW('cosine', LOCAL_VECTOR_DIMENSION)

  let numPointsInDB = 0
  let numOpenAIEmbeddings = 0
  let numLocalEmbeddings = 0
  
  try {
    const countResult = db
      .prepare('SELECT COUNT(*) as count FROM thoughts')
      .get() as { count: number }
    numPointsInDB = countResult.count
    
    // Count OpenAI and Local embeddings separately
    const openaiCountResult = db
      .prepare('SELECT COUNT(*) as count FROM thoughts WHERE embedding_openai IS NOT NULL OR (embedding_openai IS NULL AND embedding IS NOT NULL)')
      .get() as { count: number }
    numOpenAIEmbeddings = openaiCountResult.count
    
    const localCountResult = db
      .prepare('SELECT COUNT(*) as count FROM thoughts WHERE embedding_local IS NOT NULL')
      .get() as { count: number }
    numLocalEmbeddings = localCountResult.count
  } catch (e) {
    console.error('[ThoughtVectorStore DB] Error counting thoughts in DB:', e)
  }

  if (numPointsInDB > 0) {
    console.log(`[ThoughtVectorStore LOAD] Loading ${numPointsInDB} points (OpenAI: ${numOpenAIEmbeddings}, Local: ${numLocalEmbeddings})`)
  }

  // Load OpenAI index
  await loadProviderIndex('openai', hnswOpenAIIndex, hnswOpenAIIndexFilePath, numOpenAIEmbeddings)
  
  // Load Local index
  await loadProviderIndex('local', hnswLocalIndex, hnswLocalIndexFilePath, numLocalEmbeddings)
  
  isStoreInitialized = true
}

async function loadProviderIndex(
  provider: 'openai' | 'local',
  index: HierarchicalNSW,
  indexFilePath: string,
  numEmbeddings: number
) {
  try {
    if (numEmbeddings > 0) {
      
      try {
        await index.readIndex(indexFilePath)

        if (index.getCurrentCount() !== numEmbeddings) {
          console.warn(
            `[ThoughtVectorStore LOAD] ${provider} HNSW index count (${index.getCurrentCount()}) mismatch with DB count (${numEmbeddings}). Rebuilding HNSW index from DB embeddings.`
          )
          await rebuildHnswIndexFromDB(provider)
        }
        if (index.getMaxElements() < numEmbeddings) {
          console.warn(
            `[ThoughtVectorStore LOAD] ${provider} HNSW index capacity is less than DB points. Resizing index.`
          )
          index.resizeIndex(Math.max(MAX_ELEMENTS_HNSW, numEmbeddings + 1000))
        }
      } catch (loadError) {
        await rebuildHnswIndexFromDB(provider)
      }
    } else {
      index.initIndex(MAX_ELEMENTS_HNSW)
    }
  } catch (error) {
    console.warn(
      `[ThoughtVectorStore LOAD] Error initializing ${provider} index: ${(error as Error).message}. Initializing fresh index.`
    )
    index.initIndex(MAX_ELEMENTS_HNSW)
  }
}

async function rebuildHnswIndexFromDB(provider: 'openai' | 'local') {
  const index = provider === 'local' ? hnswLocalIndex : hnswOpenAIIndex
  const labelMapping = provider === 'local' ? localLabelToThoughtId : openAILabelToThoughtId
  
  if (!db || !index) {
    console.error(
      `[ThoughtVectorStore REBUILD] DB or ${provider} HNSW Index not initialized. Cannot rebuild.`
    )
    return
  }
  
  
  // Count embeddings for this provider
  const countQuery = provider === 'local' 
    ? 'SELECT COUNT(*) as count FROM thoughts WHERE embedding_local IS NOT NULL'
    : 'SELECT COUNT(*) as count FROM thoughts WHERE embedding_openai IS NOT NULL OR (embedding_openai IS NULL AND embedding IS NOT NULL)'
  
  const embeddingCount = (db.prepare(countQuery).get() as { count: number }).count
  
  index.initIndex(
    Math.max(MAX_ELEMENTS_HNSW, embeddingCount + 1000)
  )

  // Clear and rebuild label mapping
  labelMapping.clear()
  
  const allEmbeddings = getAllEmbeddingsWithLabelsFromDB(provider)
  if (allEmbeddings.length === 0) {
    console.log(
      `[ThoughtVectorStore REBUILD] No ${provider} embeddings in DB to rebuild index from.`
    )
    return
  }

  for (const item of allEmbeddings) {
    if (item.label >= index.getMaxElements()) {
      index.resizeIndex(item.label + 1000)
    }
    index.addPoint(item.embedding, item.label)
    labelMapping.set(item.label, item.thoughtId)
  }
  await saveHnswIndex(provider)
}

async function saveHnswIndex(provider?: 'openai' | 'local') {
  if (!isStoreInitialized) {
    console.warn(
      '[ThoughtVectorStore Save] Attempted to save HNSW index but store not ready.'
    )
    return
  }
  
  // If no provider specified, save both
  if (!provider) {
    await saveHnswIndex('openai')
    await saveHnswIndex('local')
    return
  }
  
  const index = provider === 'local' ? hnswLocalIndex : hnswOpenAIIndex
  const indexFilePath = provider === 'local' ? hnswLocalIndexFilePath : hnswOpenAIIndexFilePath
  
  if (!index) {
    console.warn(
      `[ThoughtVectorStore Save] ${provider} HNSW index not initialized.`
    )
    return
  }
  
  try {
    const dir = path.dirname(indexFilePath)
    await fs.mkdir(dir, { recursive: true })
    await index.writeIndex(indexFilePath)
  } catch (error) {
    console.error(`[ThoughtVectorStore] Error saving ${provider} HNSW index:`, error)
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
  embedding: number[],
  provider: 'openai' | 'local' = 'openai'
): Promise<void> {
  const expectedDimension = provider === 'local' ? LOCAL_VECTOR_DIMENSION : OPENAI_VECTOR_DIMENSION
  const hnswIndex = provider === 'local' ? hnswLocalIndex : hnswOpenAIIndex
  
  if (!isStoreInitialized || !hnswIndex || !db) {
    console.error('[ThoughtVectorStore ADD] Store not initialized properly.')
    await initializeThoughtVectorStore()
    const currentIndex = provider === 'local' ? hnswLocalIndex : hnswOpenAIIndex
    if (!isStoreInitialized || !currentIndex || !db) {
      throw new Error(
        'Failed to initialize thought vector store for adding vector.'
      )
    }
  }

  if (embedding.length !== expectedDimension) {
    throw new Error(
      `[ThoughtVectorStore ADD] Embedding dimension mismatch for ${provider}. Expected ${expectedDimension}, got ${embedding.length}`
    )
  }

  // Generate a unique thought ID
  const thoughtId = `${conversationId}-${role}-${Date.now()}-${randomUUID().substring(0, 8)}`
  const currentIndex = provider === 'local' ? hnswLocalIndex : hnswOpenAIIndex
  const labelMapping = provider === 'local' ? localLabelToThoughtId : openAILabelToThoughtId
  
  // Get next available label for this provider's index
  const label = currentIndex!.getCurrentCount()

  if (label >= currentIndex!.getMaxElements()) {
    console.warn(
      `[ThoughtVectorStore ADD] ${provider} index is full (max ${currentIndex!.getMaxElements()}). Resizing.`
    )
    const newMaxElements =
      currentIndex!.getMaxElements() +
      Math.max(1000, Math.floor(currentIndex!.getMaxElements() * 0.2))
    currentIndex!.resizeIndex(newMaxElements)
    console.log(`[ThoughtVectorStore ADD] ${provider} index resized to ${newMaxElements}`)
  }

  db.transaction(() => {
    insertThoughtMetadata(
      thoughtId,
      conversationId,
      role,
      textContent,
      new Date().toISOString(),
      embedding,
      provider
    )
    currentIndex!.addPoint(embedding, label)
    labelMapping.set(label, thoughtId)
  })()

  await saveHnswIndex(provider)
}

export async function searchSimilarThoughts(
  queryEmbedding: number[],
  topK: number,
  provider?: 'openai' | 'local' | 'both'
): Promise<ThoughtMetadata[]> {
  if (!isStoreInitialized || !db) {
    console.log('[ThoughtVectorStore SEARCH] Store not ready.')
    return []
  }

  // Auto-detect provider based on embedding dimension if not specified
  if (!provider) {
    if (queryEmbedding.length === OPENAI_VECTOR_DIMENSION) {
      provider = 'openai'
    } else if (queryEmbedding.length === LOCAL_VECTOR_DIMENSION) {
      provider = 'local'
    } else {
      console.error(
        `[ThoughtVectorStore SEARCH] Unknown embedding dimension: ${queryEmbedding.length}`
      )
      return []
    }
  }

  // Handle dual search from both providers
  if (provider === 'both') {
    const openaiResults = await searchWithProvider(queryEmbedding, topK, 'openai')
    const localResults = await searchWithProvider(queryEmbedding, topK, 'local')
    
    // Combine and deduplicate results, preserving order
    const combined = [...openaiResults, ...localResults]
    const seen = new Set<string>()
    const unique = combined.filter(item => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    
    return unique.slice(0, topK)
  }

  return await searchWithProvider(queryEmbedding, topK, provider)
}

async function searchWithProvider(
  queryEmbedding: number[],
  topK: number,
  provider: 'openai' | 'local'
): Promise<ThoughtMetadata[]> {
  const expectedDimension = provider === 'local' ? LOCAL_VECTOR_DIMENSION : OPENAI_VECTOR_DIMENSION
  const hnswIndex = provider === 'local' ? hnswLocalIndex : hnswOpenAIIndex
  
  if (!hnswIndex || hnswIndex.getCurrentCount() === 0) {
    return []
  }

  if (queryEmbedding.length !== expectedDimension) {
    console.error(
      `[ThoughtVectorStore SEARCH] Query embedding dimension mismatch for ${provider}. Expected ${expectedDimension}, got ${queryEmbedding.length}`
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
    return []
  }

  const retrievedMetadata = getThoughtMetadataByLabels(results.neighbors, provider)

  return retrievedMetadata
}

export async function deleteAllThoughtVectors(): Promise<void> {
  if (!isStoreInitialized || !db) {
    console.warn(
      '[ThoughtVectorStore DELETE ALL] Store not initialized. Attempting init.'
    )
    await initializeThoughtVectorStore()
    if (!isStoreInitialized || !db) {
      console.error(
        '[ThoughtVectorStore DELETE ALL] Initialization failed. Cannot delete.'
      )
      return
    }
  }
  db.prepare('DELETE FROM thoughts').run()
  
  // Clear both indices and mappings
  if (hnswOpenAIIndex) {
    hnswOpenAIIndex.clearPoints()
    hnswOpenAIIndex.initIndex(MAX_ELEMENTS_HNSW)
    openAILabelToThoughtId.clear()
  }
  if (hnswLocalIndex) {
    hnswLocalIndex.clearPoints()
    hnswLocalIndex.initIndex(MAX_ELEMENTS_HNSW)
    localLabelToThoughtId.clear()
  }

  await saveHnswIndex()
}

export async function ensureSaveOnQuit(): Promise<void> {
  if (isStoreInitialized) {
    if ((hnswOpenAIIndex && hnswOpenAIIndex.getCurrentCount() > 0) || 
        (hnswLocalIndex && hnswLocalIndex.getCurrentCount() > 0)) {
      await saveHnswIndex()
    }
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
