import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { existsSync, unlinkSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import axios from 'axios'
import HnswlibNode from 'hnswlib-node'
import Database from 'better-sqlite3'
import { pathToFileURL } from 'node:url'
import { backendManager } from './backendManager'

const { HierarchicalNSW } = HnswlibNode

const LOCAL_VECTOR_DIMENSION = 384
const MAX_ELEMENTS_HNSW = 200000
const RAG_DB_FILE_NAME = 'alice-rag.sqlite'
const RAG_HNSW_INDEX_FILE_NAME = 'alice-rag-hnsw-local.index'
const RAG_HNSW_META_FILE_NAME = 'alice-rag-hnsw-local.meta.json'
const SUPPORTED_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.pdf',
  '.docx',
  '.html',
  '.htm',
])

const CHUNK_MAX_TOKENS = 120
const CHUNK_OVERLAP_TOKENS = 30
const MAX_DOC_CHUNKS = 2000
const MAX_FILE_SIZE_BYTES = 32 * 1024 * 1024
const PDF_WORKER_TIMEOUT_MS = 120000
const PDF_CROSS_PAGE_OVERLAP_CHARS = 300
const RAG_DEBUG_PDF = process.env.ALICE_RAG_DEBUG_PDF === 'true'
const RAG_DEBUG_PDF_SAMPLE_CHARS = 1200

const ragDbPath = path.join(app.getPath('userData'), RAG_DB_FILE_NAME)
const ragIndexPath = path.join(app.getPath('userData'), RAG_HNSW_INDEX_FILE_NAME)
const ragIndexMetaPath = path.join(app.getPath('userData'), RAG_HNSW_META_FILE_NAME)

let db: Database.Database | null = null
let hnswIndex: HierarchicalNSW | null = null
let isStoreInitialized = false
let labelToChunkId: Map<number, string> = new Map()
let hasRecoveredFromCorruption = false

export interface RagSearchResult {
  id: string
  text: string
  path: string
  title: string
  page?: number | null
  section?: string | null
  score: number
}

interface ParsedSection {
  text: string
  page?: number
  heading?: string
}

interface ParsedDocument {
  title: string
  sections: ParsedSection[]
}

function initDb(): void {
  if (db) return
  try {
    db = new Database(ragDbPath)
    db.pragma('journal_mode = WAL')
  } catch (error) {
    if (isSqliteCorruption(error)) {
      resetRagDatabase('[RAG] Corrupt database detected during init.')
      db = new Database(ragDbPath)
      db.pragma('journal_mode = WAL')
    } else {
      throw error
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_documents (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      file_hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding_local BLOB NOT NULL,
      token_count INTEGER NOT NULL,
      page INTEGER,
      section TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc_id ON rag_chunks (doc_id);
  `)

  try {
    ensureFtsReady(db)
  } catch (error) {
    if (isSqliteCorruption(error)) {
      resetRagDatabase('[RAG] Corrupt FTS detected during init.')
      db = new Database(ragDbPath)
      db.pragma('journal_mode = WAL')
      db.exec(`
        CREATE TABLE IF NOT EXISTS rag_documents (
          id TEXT PRIMARY KEY,
          path TEXT UNIQUE NOT NULL,
          file_hash TEXT NOT NULL,
          mtime INTEGER NOT NULL,
          size INTEGER NOT NULL,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
      db.exec(`
        CREATE TABLE IF NOT EXISTS rag_chunks (
          id TEXT PRIMARY KEY,
          doc_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          embedding_local BLOB NOT NULL,
          token_count INTEGER NOT NULL,
          page INTEGER,
          section TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc_id ON rag_chunks (doc_id);
      `)
      ensureFtsReady(db)
    } else {
      throw error
    }
  }
}

async function initializeIndex(): Promise<void> {
  if (!db) {
    throw new Error('RAG database is not initialized.')
  }

  hnswIndex = new HierarchicalNSW('cosine', LOCAL_VECTOR_DIMENSION)

  const fingerprint = getIndexFingerprintFromDb()
  const count = fingerprint.count

  if (count === 0) {
    hnswIndex.initIndex(MAX_ELEMENTS_HNSW)
    labelToChunkId.clear()
    await saveIndex()
    return
  }

  try {
    const meta = await readIndexMeta()
    await hnswIndex.readIndex(ragIndexPath)
    if (!meta || !isIndexMetaMatch(meta, fingerprint)) {
      await rebuildIndexFromDb()
      return
    }
    if (hnswIndex.getCurrentCount() !== count) {
      await rebuildIndexFromDb()
      return
    }
    if (hnswIndex.getMaxElements() < count) {
      hnswIndex.resizeIndex(Math.max(MAX_ELEMENTS_HNSW, count + 1000))
    }
    loadLabelMappingFromDb()
  } catch (error) {
    await rebuildIndexFromDb()
  }
}

export async function initializeRagStore(): Promise<void> {
  if (isStoreInitialized) return
  initDb()
  await initializeIndex()
  isStoreInitialized = true
  hasRecoveredFromCorruption = false
}

async function saveIndex(): Promise<void> {
  if (!hnswIndex) return
  try {
    const dir = path.dirname(ragIndexPath)
    await fs.mkdir(dir, { recursive: true })
    await hnswIndex.writeIndex(ragIndexPath)
    await writeIndexMeta(getIndexFingerprintFromDb())
  } catch (error) {
    console.error('[RAG] Failed to save HNSW index:', error)
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function normalizePathForCompare(value: string): string {
  const normalized = path.normalize(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

async function normalizeRagTargets(
  paths: string[]
): Promise<Array<{ normalizedPath: string; dirPrefix: string; isDirectory: boolean }>> {
  const unique = Array.from(
    new Set((paths || []).map(item => String(item)).filter(Boolean))
  )
  const results: Array<{
    normalizedPath: string
    dirPrefix: string
    isDirectory: boolean
  }> = []

  for (const target of unique) {
    const resolved = path.resolve(target)
    let isDirectory = false
    try {
      const stat = await fs.stat(resolved)
      isDirectory = stat.isDirectory()
    } catch (error) {
      isDirectory = path.extname(resolved) === ''
    }
    const normalizedPath = normalizePathForCompare(resolved)
    const dirPrefix = normalizePathForCompare(
      isDirectory
        ? resolved.endsWith(path.sep)
          ? resolved
          : `${resolved}${path.sep}`
        : resolved
    )
    results.push({ normalizedPath, dirPrefix, isDirectory })
  }

  return results
}

function shouldRemoveRagDoc(
  docPath: string,
  targets: Array<{ normalizedPath: string; dirPrefix: string; isDirectory: boolean }>
): boolean {
  const normalizedDoc = normalizePathForCompare(docPath)
  return targets.some(target => {
    if (normalizedDoc === target.normalizedPath) return true
    if (target.isDirectory && normalizedDoc.startsWith(target.dirPrefix)) {
      return true
    }
    return false
  })
}

function cleanExtractedText(text: string): string {
  const normalizedBullets = text
    .replace(/ΓùÅ/g, '-')
    .replace(/[•●◦·]/g, '-')
    .replace(/ΓÇÖ/g, "'")
  const deHyphenated = normalizedBullets.replace(/(\w)-\s+(\w)/g, '$1$2')
  const tokens = deHyphenated.split(/\s+/)
  const stopShortTokens = new Set([
    'a',
    'an',
    'in',
    'on',
    'to',
    'of',
    'for',
    'and',
    'or',
    'by',
    'we',
    'he',
    'she',
    'it',
    'is',
    'am',
    'be',
    'ai',
    'qa',
    'ui',
    'ux',
  ])
  const merged: string[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    let token = tokens[i]
    let next = tokens[i + 1]
    if (next) {
      const lower = token.toLowerCase()
      const nextLower = next.toLowerCase()
      const isShort = /^[a-z]{1,2}$/.test(lower)
      const isWord = /^[a-z]{3,}$/.test(nextLower)
      const nextHasDomainPunct = /[.-]/.test(next)
      if (
        isShort &&
        !stopShortTokens.has(lower) &&
        (isWord || nextHasDomainPunct)
      ) {
        token = `${token}${next}`
        i += 1
        next = tokens[i + 1]
      }
    }

    next = tokens[i + 1]
    if (
      next &&
      /^[a-z]{2,3}$/.test(token.toLowerCase()) &&
      /[./@-]/.test(next)
    ) {
      token = `${token}${next}`
      i += 1
      next = tokens[i + 1]
    }

    next = tokens[i + 1]
    if (
      next &&
      /^[A-Z][a-z]{1,2}$/.test(token) &&
      /^[a-z]{3,}$/.test(next)
    ) {
      token = `${token}${next}`
      i += 1
      next = tokens[i + 1]
    }

    next = tokens[i + 1]
    if (
      next &&
      token.includes('-') &&
      next.includes('-') &&
      token.length < 40 &&
      /^[a-z0-9-]+$/i.test(token) &&
      /^[a-z0-9-]+$/i.test(next)
    ) {
      token = `${token}${next}`
      i += 1
    }

    merged.push(token)
  }

  return normalizeWhitespace(merged.join(' '))
}

async function parsePdfInWorker(filePath: string): Promise<ParsedSection[]> {
  const workerUrl = getPdfWorkerUrl()

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      type: 'module',
      workerData: {
        appPath: app.getAppPath(),
      },
    })
    const timeout = setTimeout(() => {
      worker.terminate().catch(() => undefined)
      reject(new Error('[RAG] PDF worker timed out.'))
    }, PDF_WORKER_TIMEOUT_MS)

    const cleanup = () => {
      clearTimeout(timeout)
      worker.removeAllListeners()
    }

    worker.once('message', message => {
      cleanup()
      worker.terminate().catch(() => undefined)
      if (message?.success) {
        if (RAG_DEBUG_PDF && Array.isArray(message.sections)) {
          console.log('[RAG][PDF] Parsed sections for', filePath)
          message.sections.forEach((section: ParsedSection, index: number) => {
            const preview = String(section.text || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, RAG_DEBUG_PDF_SAMPLE_CHARS)
            console.log(
              `[RAG][PDF] #${index + 1} page=${section.page ?? 'n/a'} chars=${
                section.text?.length || 0
              } preview="${preview}"`
            )
          })
        }
        resolve(message.sections || [])
        return
      }
      reject(new Error(message?.error || '[RAG] PDF worker failed.'))
    })

    worker.once('error', error => {
      cleanup()
      worker.terminate().catch(() => undefined)
      reject(error)
    })

    worker.postMessage({ filePath })
  })
}

function getPdfWorkerUrl(): URL {
  const appPath = app.getAppPath()
  const candidates = [
    path.join(appPath, 'dist-electron', 'main', 'workers', 'pdfParserWorker.js'),
    path.join(appPath, 'workers', 'pdfParserWorker.js'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate)
    }
  }

  return new URL('./workers/pdfParserWorker.js', import.meta.url)
}

function splitByMarkdownHeadings(text: string): ParsedSection[] {
  const lines = text.split(/\r?\n/)
  const sections: ParsedSection[] = []
  let currentHeading = ''
  let buffer: string[] = []

  const flush = () => {
    const content = cleanExtractedText(buffer.join('\n'))
    if (content) {
      sections.push({ text: content, heading: currentHeading })
    }
    buffer = []
  }

  for (const line of lines) {
    const headingMatch = line.match(/^\s{0,3}#{1,6}\s+(.*)$/)
    if (headingMatch) {
      flush()
      currentHeading = headingMatch[1].trim()
      continue
    }
    buffer.push(line)
  }

  flush()
  if (sections.length === 0) {
    return [{ text: cleanExtractedText(text), heading: '' }]
  }
  return sections
}

function ensureFtsReady(currentDb: Database.Database) {
  currentDb.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts
    USING fts5(id, text, content='rag_chunks', content_rowid='rowid');
  `)

  currentDb.exec(`
    CREATE TRIGGER IF NOT EXISTS rag_chunks_ai AFTER INSERT ON rag_chunks BEGIN
      INSERT INTO rag_chunks_fts(rowid, id, text) VALUES (new.rowid, new.id, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS rag_chunks_ad AFTER DELETE ON rag_chunks BEGIN
      INSERT INTO rag_chunks_fts(rag_chunks_fts, rowid, id, text)
      VALUES ('delete', old.rowid, old.id, old.text);
    END;
    CREATE TRIGGER IF NOT EXISTS rag_chunks_au AFTER UPDATE ON rag_chunks BEGIN
      INSERT INTO rag_chunks_fts(rag_chunks_fts, rowid, id, text)
      VALUES ('delete', old.rowid, old.id, old.text);
      INSERT INTO rag_chunks_fts(rowid, id, text) VALUES (new.rowid, new.id, new.text);
    END;
  `)

  const ftsCount = currentDb
    .prepare('SELECT COUNT(*) as count FROM rag_chunks_fts')
    .get() as { count: number }
  if (ftsCount.count === 0) {
    currentDb.exec(`
      INSERT INTO rag_chunks_fts(rowid, id, text)
      SELECT rowid, id, text FROM rag_chunks;
    `)
  }
}

function estimateTokens(text: string): number {
  if (!text) return 0
  return text.split(/\s+/).filter(Boolean).length
}

function splitIntoChunks(text: string): { text: string; tokenCount: number }[] {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return []

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean)

  if (sentences.length === 0) return []

  const chunks: { text: string; tokenCount: number }[] = []
  const maxTokens = Math.max(1, CHUNK_MAX_TOKENS)
  const targetOverlap = Math.min(CHUNK_OVERLAP_TOKENS, maxTokens - 1)

  let start = 0
  while (start < sentences.length) {
    let tokenCount = 0
    let end = start
    for (; end < sentences.length; end += 1) {
      const sentenceTokens = estimateTokens(sentences[end])
      if (tokenCount + sentenceTokens > maxTokens && tokenCount > 0) {
        break
      }
      tokenCount += sentenceTokens
    }

    const slice = sentences.slice(start, end)
    if (slice.length === 0) break
    chunks.push({ text: slice.join(' '), tokenCount })

    if (end >= sentences.length) break

    let overlapTokens = 0
    let nextStart = end - 1
    for (; nextStart > start; nextStart -= 1) {
      overlapTokens += estimateTokens(sentences[nextStart])
      if (overlapTokens >= targetOverlap) {
        break
      }
    }

    start = Math.max(start + 1, nextStart)
  }

  return chunks
}

async function hashBuffer(buffer: Buffer): Promise<string> {
  return createHash('sha256').update(buffer).digest('hex')
}

function ensureDb(): Database.Database {
  if (!db) {
    initDb()
  }
  if (!db) {
    throw new Error('Failed to initialize RAG database.')
  }
  return db
}

type RagIndexMeta = {
  version: number
  count: number
  maxCreatedAt: string | null
}

function getIndexFingerprintFromDb(): { count: number; maxCreatedAt: string | null } {
  const currentDb = ensureDb()
  const row = currentDb
    .prepare('SELECT COUNT(*) as count, MAX(created_at) as maxCreatedAt FROM rag_chunks')
    .get() as { count: number; maxCreatedAt: string | null }
  return {
    count: row.count || 0,
    maxCreatedAt: row.maxCreatedAt || null,
  }
}

function isIndexMetaMatch(meta: RagIndexMeta, fingerprint: { count: number; maxCreatedAt: string | null }): boolean {
  return (
    meta.version === 1 &&
    meta.count === fingerprint.count &&
    meta.maxCreatedAt === fingerprint.maxCreatedAt
  )
}

async function readIndexMeta(): Promise<RagIndexMeta | null> {
  try {
    const raw = await fs.readFile(ragIndexMetaPath, 'utf-8')
    const parsed = JSON.parse(raw) as RagIndexMeta
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch (error) {
    return null
  }
}

async function writeIndexMeta(meta: { count: number; maxCreatedAt: string | null }): Promise<void> {
  try {
    const payload: RagIndexMeta = {
      version: 1,
      count: meta.count,
      maxCreatedAt: meta.maxCreatedAt,
    }
    await fs.writeFile(ragIndexMetaPath, JSON.stringify(payload))
  } catch (error) {
    console.warn('[RAG] Failed to write index metadata:', error)
  }
}

function isSqliteCorruption(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  return code === 'SQLITE_CORRUPT' || code === 'SQLITE_CORRUPT_VTAB'
}

function resetRagDatabase(reason: string): void {
  if (hasRecoveredFromCorruption) {
    console.warn('[RAG] Skipping repeated corruption recovery.')
    return
  }

  hasRecoveredFromCorruption = true
  console.warn(reason)

  try {
    db?.close()
  } catch (error) {
    console.warn('[RAG] Failed to close corrupted DB:', error)
  }
  db = null
  isStoreInitialized = false
  labelToChunkId.clear()

  try {
    unlinkSync(ragDbPath)
  } catch (error) {
    // Best-effort cleanup; database might already be gone or locked.
  }

  try {
    unlinkSync(ragIndexPath)
  } catch (error) {
    // Best-effort cleanup; index might already be gone or locked.
  }
  try {
    unlinkSync(ragIndexMetaPath)
  } catch (error) {
    // Best-effort cleanup; meta might already be gone or locked.
  }

  hnswIndex = new HierarchicalNSW('cosine', LOCAL_VECTOR_DIMENSION)
  hnswIndex.initIndex(MAX_ELEMENTS_HNSW)
}

async function parseFile(filePath: string): Promise<ParsedDocument | null> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.pdf') {
    const sectionsRaw = await parsePdfInWorker(filePath)
    const sections = sectionsRaw
      .map(section => ({
        text: cleanExtractedText(section.text),
        page: section.page,
      }))
      .filter(section => section.text)
    const withOverlap = applyCrossPageOverlap(sections)
    return {
      title: path.basename(filePath),
      sections: withOverlap,
    }
  }

  if (ext === '.docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ path: filePath })
    return {
      title: path.basename(filePath),
      sections: [{ text: cleanExtractedText(result.value || '') }],
    }
  }

  if (ext === '.html' || ext === '.htm') {
    const cheerio = await import('cheerio')
    const TurndownService = (await import('turndown')).default
    const html = await fs.readFile(filePath, 'utf-8')
    const $ = cheerio.load(html)
    const title = $('title').text().trim() || path.basename(filePath)
    const bodyText = $('body').html() || $.root().html() || html
    const turndownService = new TurndownService({ codeBlockStyle: 'fenced' })
    const markdown = turndownService.turndown(bodyText)
    return {
      title,
      sections: splitByMarkdownHeadings(markdown).map(section => ({
        ...section,
        text: cleanExtractedText(section.text),
      })),
    }
  }

  if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    const text = await fs.readFile(filePath, 'utf-8')
    return {
      title: path.basename(filePath),
      sections: splitByMarkdownHeadings(text).map(section => ({
        ...section,
        text: cleanExtractedText(section.text),
      })),
    }
  }

  return null
}

function applyCrossPageOverlap(sections: ParsedSection[]): ParsedSection[] {
  if (sections.length <= 1) return sections
  const overlapped: ParsedSection[] = []
  for (let i = 0; i < sections.length; i += 1) {
    const current = sections[i]
    if (i === 0) {
      overlapped.push(current)
      continue
    }
    const previous = sections[i - 1]
    const tail = previous.text.slice(
      Math.max(0, previous.text.length - PDF_CROSS_PAGE_OVERLAP_CHARS)
    )
    const combined = tail ? `${tail} ${current.text}` : current.text
    overlapped.push({ ...current, text: combined })
  }
  return overlapped
}

async function isEmbeddingsReady(): Promise<boolean> {
  try {
    const response = await axios.get(
      `${getBackendUrl()}/api/embeddings/ready`,
      { timeout: 5000 }
    )
    return response.data?.success && response.data?.data?.ready === true
  } catch (error) {
    return false
  }
}

function getBackendUrl(): string {
  return backendManager.getApiUrl()
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await axios.post(
    `${getBackendUrl()}/api/embeddings/generate-batch`,
    { texts },
    { timeout: 60000 }
  )
  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Embedding generation failed')
  }
  return response.data.data?.embeddings || []
}

function toEmbeddingBuffer(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer)
}

function fromEmbeddingBuffer(buffer: Buffer): number[] {
  return Array.from(
    new Float32Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
    )
  )
}

async function upsertDocument(
  filePath: string,
  parsed: ParsedDocument,
  hash: string,
  mtime: number,
  size: number
): Promise<void> {
  const currentDb = ensureDb()
  const existing = currentDb
    .prepare('SELECT id, file_hash, mtime, size FROM rag_documents WHERE path = ?')
    .get(filePath) as { id: string; file_hash: string; mtime: number; size: number } | undefined

  const docId = existing?.id || randomUUID()
  const now = new Date().toISOString()

  const chunkRows: {
    id: string
    doc_id: string
    chunk_index: number
    text: string
    embedding_local: Buffer
    token_count: number
    page: number | null
    section: string | null
    created_at: string
  }[] = []

  const chunks: {
    text: string
    tokenCount: number
    page?: number
    heading?: string
  }[] = []

  for (const section of parsed.sections) {
    const sectionChunks = splitIntoChunks(section.text)
    for (const chunk of sectionChunks) {
      chunks.push({
        ...chunk,
        page: section.page,
        heading: section.heading,
      })
      if (chunks.length >= MAX_DOC_CHUNKS) {
        break
      }
    }
    if (chunks.length >= MAX_DOC_CHUNKS) {
      break
    }
  }

  if (chunks.length === 0) {
    try {
      currentDb.transaction(() => {
        if (existing) {
          currentDb.prepare(
            'UPDATE rag_documents SET file_hash = ?, mtime = ?, size = ?, title = ?, updated_at = ? WHERE id = ?'
          ).run(hash, mtime, size, parsed.title, now, docId)
          currentDb.prepare('DELETE FROM rag_chunks WHERE doc_id = ?').run(docId)
        } else {
          currentDb.prepare(
            'INSERT INTO rag_documents (id, path, file_hash, mtime, size, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(docId, filePath, hash, mtime, size, parsed.title, now, now)
        }
      })()
    } catch (error) {
      if (isSqliteCorruption(error)) {
        resetRagDatabase('[RAG] Corrupt database detected during upsert.')
      }
      throw error
    }
    return
  }

  const embeddings = await generateEmbeddings(chunks.map(c => c.text))
  if (embeddings.length !== chunks.length) {
    throw new Error('[RAG] Embedding batch size mismatch.')
  }
  const createdAt = new Date().toISOString()

  for (let i = 0; i < chunks.length; i += 1) {
    const embedding = embeddings[i]
    if (!embedding || embedding.length !== LOCAL_VECTOR_DIMENSION) {
      throw new Error('[RAG] Invalid embedding payload received.')
    }
    const chunkId = randomUUID()
    chunkRows.push({
      id: chunkId,
      doc_id: docId,
      chunk_index: i,
      text: chunks[i].text,
      embedding_local: toEmbeddingBuffer(embedding),
      token_count: chunks[i].tokenCount,
      page: chunks[i].page ?? null,
      section: chunks[i].heading || null,
      created_at: createdAt,
    })
  }

  const insert = currentDb.prepare(
    'INSERT INTO rag_chunks (id, doc_id, chunk_index, text, embedding_local, token_count, page, section, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )

  try {
    currentDb.transaction(() => {
      if (existing) {
        currentDb.prepare(
          'UPDATE rag_documents SET file_hash = ?, mtime = ?, size = ?, title = ?, updated_at = ? WHERE id = ?'
        ).run(hash, mtime, size, parsed.title, now, docId)
        currentDb.prepare('DELETE FROM rag_chunks WHERE doc_id = ?').run(docId)
      } else {
        currentDb.prepare(
          'INSERT INTO rag_documents (id, path, file_hash, mtime, size, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(docId, filePath, hash, mtime, size, parsed.title, now, now)
      }
      for (const row of chunkRows) {
        insert.run(
          row.id,
          row.doc_id,
          row.chunk_index,
          row.text,
          row.embedding_local,
          row.token_count,
          row.page,
          row.section,
          row.created_at
        )
      }
    })()
  } catch (error) {
    if (isSqliteCorruption(error)) {
      resetRagDatabase('[RAG] Corrupt database detected while writing chunks.')
    }
    throw error
  }
}

export async function removeRagPaths(
  paths: string[]
): Promise<{ removed: number }> {
  await initializeRagStore()
  const currentDb = ensureDb()
  const normalizedTargets = await normalizeRagTargets(paths)
  if (normalizedTargets.length === 0) return { removed: 0 }

  const rows = currentDb
    .prepare('SELECT id, path FROM rag_documents')
    .all() as { id: string; path: string }[]

  const idsToRemove = rows
    .filter(row => shouldRemoveRagDoc(row.path, normalizedTargets))
    .map(row => row.id)

  if (idsToRemove.length === 0) {
    return { removed: 0 }
  }

  try {
    currentDb.transaction(() => {
      for (const id of idsToRemove) {
        currentDb.prepare('DELETE FROM rag_chunks WHERE doc_id = ?').run(id)
        currentDb.prepare('DELETE FROM rag_documents WHERE id = ?').run(id)
      }
    })()
  } catch (error) {
    if (isSqliteCorruption(error)) {
      resetRagDatabase('[RAG] Corrupt database detected while removing paths.')
    }
    throw error
  }

  await rebuildIndexFromDb()
  return { removed: idsToRemove.length }
}

async function pruneMissingDocuments(
  targets: Array<{ normalizedPath: string; dirPrefix: string; isDirectory: boolean }>
): Promise<number> {
  if (targets.length === 0) return 0
  const currentDb = ensureDb()
  const rows = currentDb
    .prepare('SELECT id, path FROM rag_documents')
    .all() as { id: string; path: string }[]

  const idsToRemove: string[] = []

  for (const row of rows) {
    if (!shouldRemoveRagDoc(row.path, targets)) continue
    try {
      const stat = await fs.stat(row.path)
      if (!stat.isFile()) {
        idsToRemove.push(row.id)
      }
    } catch (error) {
      idsToRemove.push(row.id)
    }
  }

  if (idsToRemove.length === 0) return 0

  try {
    currentDb.transaction(() => {
      for (const id of idsToRemove) {
        currentDb.prepare('DELETE FROM rag_chunks WHERE doc_id = ?').run(id)
        currentDb.prepare('DELETE FROM rag_documents WHERE id = ?').run(id)
      }
    })()
  } catch (error) {
    if (isSqliteCorruption(error)) {
      resetRagDatabase('[RAG] Corrupt database detected while pruning paths.')
    }
    throw error
  }

  return idsToRemove.length
}

async function rebuildIndexFromDb(): Promise<void> {
  const currentDb = ensureDb()
  if (!hnswIndex) {
    hnswIndex = new HierarchicalNSW('cosine', LOCAL_VECTOR_DIMENSION)
  }

  const rows = currentDb
    .prepare(
      'SELECT id, embedding_local as embedding FROM rag_chunks ORDER BY id'
    )
    .all() as { id: string; embedding: Buffer }[]

  hnswIndex.initIndex(Math.max(MAX_ELEMENTS_HNSW, rows.length + 1000))
  labelToChunkId.clear()

  rows.forEach((row, idx) => {
    const embedding = fromEmbeddingBuffer(row.embedding)
    hnswIndex!.addPoint(embedding, idx)
    labelToChunkId.set(idx, row.id)
  })

  await saveIndex()
}

function loadLabelMappingFromDb(): void {
  const currentDb = ensureDb()
  const rows = currentDb
    .prepare('SELECT id FROM rag_chunks ORDER BY id')
    .all() as { id: string }[]
  labelToChunkId.clear()
  rows.forEach((row, idx) => {
    labelToChunkId.set(idx, row.id)
  })
}

function getChunkMetadataByIds(ids: string[]): RagSearchResult[] {
  if (!db || ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `
      SELECT rag_chunks.id, rag_chunks.text, rag_chunks.page, rag_chunks.section,
             rag_documents.path, rag_documents.title
      FROM rag_chunks
      JOIN rag_documents ON rag_chunks.doc_id = rag_documents.id
      WHERE rag_chunks.id IN (${placeholders})
    `
    )
    .all(...ids) as Array<{
    id: string
    text: string
    page: number | null
    section: string | null
    path: string
    title: string
  }>

  const byId = new Map(rows.map(row => [row.id, row]))
  return ids
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(row => ({
      id: row!.id,
      text: row!.text,
      path: row!.path,
      title: row!.title,
      page: row!.page,
      section: row!.section,
      score: 0,
    }))
}

async function collectIndexablePaths(
  paths: string[],
  recursive: boolean
): Promise<string[]> {
  const results: string[] = []
  const queue = [...paths]

  while (queue.length > 0) {
    const current = queue.pop()
    if (!current) continue
    try {
      const stat = await fs.stat(current)
      if (stat.isDirectory()) {
        if (!recursive) continue
        const entries = await fs.readdir(current)
        for (const entry of entries) {
          queue.push(path.join(current, entry))
        }
      } else if (stat.isFile()) {
        const ext = path.extname(current).toLowerCase()
        if (SUPPORTED_EXTENSIONS.has(ext) && stat.size <= MAX_FILE_SIZE_BYTES) {
          results.push(current)
        }
      }
    } catch (error) {
      console.warn('[RAG] Failed to access path:', current, error)
    }
  }

  return results
}

export async function indexPaths(
  paths: string[],
  options?: { recursive?: boolean }
): Promise<{ indexed: number; skipped: number }> {
  await initializeRagStore()

  const normalizedTargets = await normalizeRagTargets(paths)
  try {
    await pruneMissingDocuments(normalizedTargets)
  } catch (error) {
    console.warn('[RAG] Failed to prune missing documents:', error)
  }

  const files = await collectIndexablePaths(paths, options?.recursive ?? true)
  const filesToIndex: Array<{
    filePath: string
    mtimeMs: number
    size: number
    hash: string
  }> = []
  let indexed = 0
  let skipped = 0

  for (const filePath of files) {
    try {
      const stat = await fs.stat(filePath)
      const buffer = await fs.readFile(filePath)
      const fileHash = await hashBuffer(buffer)
      const existing = ensureDb()
        .prepare('SELECT file_hash, mtime, size FROM rag_documents WHERE path = ?')
        .get(filePath) as { file_hash: string; mtime: number; size: number } | undefined

      if (
        existing &&
        existing.file_hash === fileHash &&
        existing.mtime === stat.mtimeMs &&
        existing.size === stat.size
      ) {
        skipped += 1
        continue
      }
      filesToIndex.push({
        filePath,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        hash: fileHash,
      })
    } catch (error) {
      console.warn('[RAG] Failed to index file:', filePath, error)
      skipped += 1
    }
  }

  if (filesToIndex.length > 0) {
    const ready = await isEmbeddingsReady()
    if (!ready) {
      throw new Error('Embeddings service is not ready.')
    }
  }

  for (const file of filesToIndex) {
    try {
      const parsed = await parseFile(file.filePath)
      if (!parsed) {
        skipped += 1
        continue
      }

      await upsertDocument(
        file.filePath,
        parsed,
        file.hash,
        file.mtimeMs,
        file.size
      )
      indexed += 1
    } catch (error) {
      if (isSqliteCorruption(error)) {
        resetRagDatabase('[RAG] Corrupt database detected during indexing.')
      }
      console.warn('[RAG] Failed to index file:', file.filePath, error)
      skipped += 1
    }
  }

  try {
    await rebuildIndexFromDb()
  } catch (error) {
    console.warn('[RAG] Failed to rebuild index from DB:', error)
  }
  return { indexed, skipped }
}

function keywordSearch(
  queryText: string,
  topK: number
): { id: string; rank: number }[] {
  if (!db) return []
  const stopwords = new Set([
    'what',
    'where',
    'when',
    'which',
    'that',
    'this',
    'with',
    'from',
    'about',
    'your',
    'work',
    'experience',
    'role',
    'position',
    'did',
    'does',
    'done',
    'for',
    'and',
    'the',
    'was',
    'were',
  ])
  const tokens = queryText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 3 && !stopwords.has(token))

  if (tokens.length === 0) return []

  const uniqueTokens = Array.from(new Set(tokens))
  const limitedTokens = uniqueTokens
    .sort((a, b) => b.length - a.length)
    .slice(0, 6)
  const ftsQuery = limitedTokens.map(token => `${token}*`).join(' OR ')
  const rows = db
    .prepare(
      `SELECT id, bm25(rag_chunks_fts) as score
       FROM rag_chunks_fts
       WHERE rag_chunks_fts MATCH ?
       ORDER BY score ASC
       LIMIT ?`
    )
    .all(ftsQuery, topK) as { id: string; score: number }[]

  return rows.map((row, idx) => ({
    id: row.id,
    rank: idx + 1,
  }))
}

function combineRankedLists(
  primary: string[],
  secondary: { id: string; rank: number }[],
  limit: number
): string[] {
  const k = 60
  const scores = new Map<string, number>()

  primary.forEach((id, idx) => {
    const score = 1 / (k + idx + 1)
    scores.set(id, (scores.get(id) || 0) + score)
  })

  secondary.forEach(item => {
    const score = 1 / (k + item.rank)
    scores.set(item.id, (scores.get(item.id) || 0) + score)
  })

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
}

export async function searchRag(
  queryEmbedding: number[],
  queryText: string,
  topK: number
): Promise<RagSearchResult[]> {
  await initializeRagStore()
  const hasEmbedding =
    queryEmbedding && queryEmbedding.length === LOCAL_VECTOR_DIMENSION
  const hasText = queryText && queryText.trim().length > 0

  if ((!hnswIndex || hnswIndex.getCurrentCount() === 0) && !hasText) {
    return []
  }

  const candidateK = Math.min(Math.max(topK * 4, topK), 40)

  let vectorIds: string[] = []
  if (hasEmbedding && hnswIndex && hnswIndex.getCurrentCount() > 0) {
    const result = hnswIndex.searchKnn(
      queryEmbedding,
      Math.min(candidateK, hnswIndex.getCurrentCount())
    )
    vectorIds = (result.neighbors || [])
      .map(label => labelToChunkId.get(label))
      .filter(Boolean) as string[]
  }

  const keywordIds = hasText ? keywordSearch(queryText, candidateK) : []
  const combinedIds = combineRankedLists(vectorIds, keywordIds, topK)

  const metadata = getChunkMetadataByIds(combinedIds)
  return metadata.map((item, idx) => ({
    ...item,
    score: 1 - Math.min(1, idx / Math.max(1, topK)),
  }))
}

export async function clearRag(): Promise<void> {
  try {
    const currentDb = ensureDb()
    currentDb.prepare('DELETE FROM rag_chunks').run()
    currentDb.prepare('DELETE FROM rag_documents').run()
    hnswIndex = new HierarchicalNSW('cosine', LOCAL_VECTOR_DIMENSION)
    hnswIndex.initIndex(MAX_ELEMENTS_HNSW)
    labelToChunkId.clear()
    await saveIndex()
  } catch (error) {
    if (isSqliteCorruption(error)) {
      resetRagDatabase('[RAG] Corrupt database detected during clear.')
      return
    }
    throw error
  }
}

export async function getRagStats(): Promise<{
  documents: number
  chunks: number
}> {
  const currentDb = ensureDb()
  const docCount = currentDb
    .prepare('SELECT COUNT(*) as count FROM rag_documents')
    .get() as { count: number }
  const chunkCount = currentDb
    .prepare('SELECT COUNT(*) as count FROM rag_chunks')
    .get() as { count: number }
  return { documents: docCount.count, chunks: chunkCount.count }
}
