import { randomUUID } from 'node:crypto'
import { getDBInstance } from './thoughtVectorStore'
import type { MemoryRecord } from './thoughtVectorStore'

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0
  }
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  if (normA === 0 || normB === 0) {
    return 0
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

function convertEmbeddingToBuffer(embedding?: number[]): Buffer | null {
  if (!embedding || embedding.length === 0) return null
  return Buffer.from(new Float32Array(embedding).buffer)
}

function convertBufferToEmbedding(
  buffer?: Buffer | null
): number[] | undefined {
  if (!buffer) return undefined
  return Array.from(
    new Float32Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
    )
  )
}

export async function saveMemoryLocal(
  content: string,
  memoryType: string = 'general',
  embedding?: number[]
): Promise<MemoryRecord> {
  const db = getDBInstance()
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const embeddingBuffer = convertEmbeddingToBuffer(embedding)

  try {
    const stmt = db.prepare(
      'INSERT INTO long_term_memories (id, content, memory_type, created_at, embedding) VALUES (?, ?, ?, ?, ?)'
    )
    stmt.run(id, content, memoryType, createdAt, embeddingBuffer)
    console.log('Memory saved to SQLite:', id)
    return { id, content, memoryType, createdAt, embedding }
  } catch (error) {
    console.error('Failed to save memory to SQLite:', error)
    throw error
  }
}

export async function getRecentMemoriesLocal(
  limit: number = 20,
  memoryType?: string,
  queryEmbedding?: number[]
): Promise<Partial<MemoryRecord>[]> {
  const db = getDBInstance()
  let memoriesToReturn: Partial<MemoryRecord>[] = []

  try {
    if (queryEmbedding && queryEmbedding.length > 0) {
      let sql =
        'SELECT id, content, memory_type, created_at, embedding FROM long_term_memories WHERE embedding IS NOT NULL'
      const params: any[] = []
      if (memoryType) {
        sql += ' AND memory_type = ?'
        params.push(memoryType)
      }

      const rows = db.prepare(sql).all(...params) as {
        id: string
        content: string
        memory_type: string
        created_at: string
        embedding: Buffer | null
      }[]

      const memoriesWithEmbeddings: MemoryRecord[] = rows
        .map(row => ({
          id: row.id,
          content: row.content,
          memoryType: row.memory_type,
          createdAt: row.created_at,
          embedding: convertBufferToEmbedding(row.embedding),
        }))
        .filter(
          mem => mem.embedding && mem.embedding.length > 0
        ) as MemoryRecord[]

      if (memoriesWithEmbeddings.length === 0) {
        console.warn(
          '[MemoryManager] Semantic query provided, but no memories with embeddings found. Falling back to recent general memories.'
        )
        let fallbackSql =
          'SELECT id, content, memory_type, created_at FROM long_term_memories'
        const fallbackParams: any[] = []
        if (memoryType) {
          fallbackSql += ' WHERE memory_type = ?'
          fallbackParams.push(memoryType)
        }
        fallbackSql += ' ORDER BY created_at DESC LIMIT ?'
        fallbackParams.push(limit)

        const fallbackRows = db.prepare(fallbackSql).all(...fallbackParams) as {
          id: string
          content: string
          memory_type: string
          created_at: string
        }[]
        memoriesToReturn = fallbackRows.map(row => ({
          id: row.id,
          content: row.content,
          memoryType: row.memory_type,
          createdAt: row.created_at,
        }))
        return memoriesToReturn
      }

      const scoredMemories = memoriesWithEmbeddings.map(mem => ({
        memory: {
          id: mem.id,
          content: mem.content,
          memoryType: mem.memoryType,
          createdAt: mem.createdAt,
        },
        score: cosineSimilarity(queryEmbedding, mem.embedding as number[]),
      }))

      scoredMemories.sort((a, b) => b.score - a.score)
      memoriesToReturn = scoredMemories.slice(0, limit).map(sm => sm.memory)
    } else {
      let sql =
        'SELECT id, content, memory_type, created_at FROM long_term_memories'
      const params: any[] = []
      if (memoryType) {
        sql += ' WHERE memory_type = ?'
        params.push(memoryType)
      }
      sql += ' ORDER BY created_at DESC LIMIT ?'
      params.push(limit)

      const rows = db.prepare(sql).all(...params) as {
        id: string
        content: string
        memory_type: string
        created_at: string
      }[]
      memoriesToReturn = rows.map(row => ({
        id: row.id,
        content: row.content,
        memoryType: row.memory_type,
        createdAt: row.created_at,
      }))
    }
    return memoriesToReturn
  } catch (error) {
    console.error('Failed to get memories from SQLite:', error)
    throw error
  }
}

export async function updateMemoryLocal(
  id: string,
  updatedContent: string,
  updatedMemoryType: string,
  updatedEmbedding?: number[]
): Promise<MemoryRecord | null> {
  const db = getDBInstance()
  const embeddingBuffer = convertEmbeddingToBuffer(updatedEmbedding)
  try {
    const stmt = db.prepare(
      'UPDATE long_term_memories SET content = ?, memory_type = ?, embedding = ? WHERE id = ?'
    )
    const result = stmt.run(
      updatedContent,
      updatedMemoryType,
      embeddingBuffer,
      id
    )

    if (result.changes > 0) {
      console.log('Memory updated in SQLite:', id)
      const updatedMemory = db
        .prepare(
          'SELECT id, content, memory_type, created_at, embedding FROM long_term_memories WHERE id = ?'
        )
        .get(id) as {
        id: string
        content: string
        memory_type: string
        created_at: string
        embedding: Buffer | null
      }
      return {
        id: updatedMemory.id,
        content: updatedMemory.content,
        memoryType: updatedMemory.memory_type,
        createdAt: updatedMemory.created_at,
        embedding: convertBufferToEmbedding(updatedMemory.embedding),
      }
    } else {
      console.log('Memory not found for update in SQLite:', id)
      return null
    }
  } catch (error) {
    console.error('Failed to update memory in SQLite:', error)
    throw error
  }
}

export async function deleteMemoryLocal(id: string): Promise<boolean> {
  const db = getDBInstance()
  try {
    const stmt = db.prepare('DELETE FROM long_term_memories WHERE id = ?')
    const result = stmt.run(id)
    if (result.changes > 0) {
      console.log('Memory deleted from SQLite:', id)
      return true
    }
    console.log('Memory not found for deletion in SQLite:', id)
    return false
  } catch (error) {
    console.error('Failed to delete memory from SQLite:', error)
    throw error
  }
}

export async function deleteAllMemoriesLocal(): Promise<void> {
  const db = getDBInstance()
  try {
    db.prepare('DELETE FROM long_term_memories').run()
    console.log('All local memories deleted from SQLite.')
  } catch (error) {
    console.error('Failed to delete all memories from SQLite:', error)
    throw error
  }
}
