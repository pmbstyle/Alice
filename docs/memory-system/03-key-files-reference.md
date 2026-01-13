# Key Files Reference

This document provides a comprehensive reference of all files responsible for the memory system in Alice.

## Core Memory Files

### 1. thoughtVectorStore.ts

**Location:** [electron/main/thoughtVectorStore.ts](../../electron/main/thoughtVectorStore.ts)

**Size:** 942 lines

**Purpose:** Manages short-term conversation memory with vector embeddings

**Key Responsibilities:**
- Initialize and manage `alice-thoughts.sqlite` database
- Manage HNSW indices for OpenAI (1536-dim) and Local (384-dim) embeddings
- Add conversation messages to vector store
- Search for semantically similar thoughts
- Store and retrieve conversation summaries
- Handle database migrations
- Persist indices on app shutdown

**Main Functions:**

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `initializeThoughtVectorStore()` | Initialize DB, indices, migrations | None | `Promise<void>` |
| `addThoughtVector()` | Add conversation message | `conversationId, role, textContent, embedding` | `Promise<void>` |
| `searchSimilarThoughts()` | Semantic search | `queryEmbedding, topK, provider?` | `Promise<ThoughtSearchResult[]>` |
| `deleteAllThoughtVectors()` | Clear all thoughts | None | `Promise<void>` |
| `getRecentMessagesForSummarization()` | Get messages to summarize | `conversationId, messageCount` | `Promise<Message[]>` |
| `saveConversationSummary()` | Store summary | `summaryText, count, conversationId` | `Promise<void>` |
| `ensureSaveOnQuit()` | Persist indices | None | `void` |

**Database Tables:**
```sql
thoughts (
  hnsw_label INTEGER PRIMARY KEY,
  thought_id TEXT UNIQUE,
  conversation_id TEXT,
  role TEXT,
  text_content TEXT,
  created_at TEXT,
  embedding BLOB,
  embedding_openai BLOB,
  embedding_local BLOB
)

conversation_summaries (
  id TEXT PRIMARY KEY,
  summary_text TEXT,
  summarized_messages_count INTEGER,
  conversation_id TEXT,
  created_at TEXT
)

migration_flags (
  flag_name TEXT PRIMARY KEY,
  completed INTEGER
)
```

**Key Code Sections:**
- Lines 1-50: Imports and initialization
- Lines 51-120: Database schema and migrations
- Lines 121-194: Dual embedding migration
- Lines 195-274: JSON to SQLite migration
- Lines 275-522: Thought vector management (add, search)
- Lines 523-678: HNSW index management
- Lines 679-765: Similarity search implementation
- Lines 766-825: Conversation summaries
- Lines 826-852: Deletion operations
- Lines 853-942: Shutdown and persistence

---

### 2. memoryManager.ts

**Location:** [electron/main/memoryManager.ts](../../electron/main/memoryManager.ts)

**Size:** 349 lines

**Purpose:** Manages user-created long-term memories

**Key Responsibilities:**
- CRUD operations for long-term memories
- Dual embedding support (OpenAI + Local)
- Semantic similarity search for memory retrieval
- Memory type filtering
- Database initialization and migrations

**Main Functions:**

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `initializeMemoryDB()` | Initialize DB table | None | `void` |
| `saveMemoryLocal()` | Create memory | `content, memoryType, embedding*` | `MemoryRecord` |
| `getRecentMemoriesLocal()` | Retrieve memories | `limit, memoryType?, queryEmbedding?` | `MemoryRecord[]` |
| `updateMemoryLocal()` | Update memory | `id, content, memoryType, embedding*` | `MemoryRecord` |
| `deleteMemoryLocal()` | Delete memory | `id` | `void` |
| `deleteAllMemoriesLocal()` | Delete all | None | `void` |

**Database Table:**
```sql
long_term_memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  memory_type TEXT,
  created_at TEXT,
  embedding BLOB,
  embedding_openai BLOB,
  embedding_local BLOB
)

-- Indices
idx_ltm_memory_type ON memory_type
idx_ltm_created_at ON created_at
```

**TypeScript Interfaces:**
```typescript
interface MemoryRecord {
  id: string
  content: string
  memory_type?: string
  created_at: string
  embedding?: Float32Array
  embedding_openai?: Float32Array
  embedding_local?: Float32Array
}
```

**Key Code Sections:**
- Lines 1-60: Imports and database initialization
- Lines 61-128: Database schema and table creation
- Lines 129-253: Memory retrieval with semantic search
- Lines 254-287: Memory creation (saveMemoryLocal)
- Lines 288-303: Single memory deletion
- Lines 304-313: Memory update
- Lines 314-329: Bulk deletion
- Lines 330-349: Helper functions

---

### 3. ragDocumentStore.ts

**Location:** [electron/main/ragDocumentStore.ts](../../electron/main/ragDocumentStore.ts)

**Size:** 1,337 lines

**Purpose:** RAG (Retrieval-Augmented Generation) document indexing and search

**Key Responsibilities:**
- Index documents (PDF, DOCX, Markdown, HTML, TXT)
- Extract and chunk text content
- Generate embeddings for chunks
- Hybrid search (vector + keyword)
- Change detection (avoid re-indexing unchanged files)
- Corrupt database recovery

**Main Functions:**

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `initializeRagStore()` | Initialize RAG DB & indices | None | `Promise<void>` |
| `indexPaths()` | Index documents | `paths, recursive?` | `{indexed, skipped}` |
| `searchRag()` | Hybrid search | `queryEmbedding, queryText, topK` | `RagSearchResult[]` |
| `removeRagPaths()` | Remove documents | `paths` | `{removed}` |
| `clearRag()` | Clear all | None | `void` |
| `getRagStats()` | Get stats | None | `{documents, chunks}` |

**Database Tables:**
```sql
rag_documents (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE,
  file_hash TEXT,
  mtime INTEGER,
  size INTEGER,
  title TEXT,
  created_at TEXT,
  updated_at TEXT
)

rag_chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT,
  chunk_index INTEGER,
  text TEXT,
  embedding_local BLOB,
  token_count INTEGER,
  page INTEGER,
  section TEXT,
  created_at TEXT
)

rag_chunks_fts (
  -- Virtual FTS5 table for full-text search
)

-- Indices
idx_rag_chunks_doc_id ON doc_id
```

**TypeScript Interfaces:**
```typescript
interface RagDocument {
  id: string
  path: string
  file_hash: string
  mtime: number
  size: number
  title?: string
  created_at: string
  updated_at: string
}

interface RagChunk {
  id: string
  doc_id: string
  chunk_index: number
  text: string
  embedding_local?: Float32Array
  token_count: number
  page?: number
  section?: string
  created_at: string
}

interface RagSearchResult {
  chunk_id: string
  doc_id: string
  path: string
  text: string
  score: number
  page?: number
  section?: string
  title?: string
}
```

**Key Code Sections:**
- Lines 1-100: Imports, initialization, constants
- Lines 101-280: Database schema and migrations
- Lines 281-450: HNSW index management
- Lines 451-614: PDF/DOCX parsing
- Lines 615-652: Corrupt database recovery
- Lines 653-850: Text chunking and embedding
- Lines 851-1094: Change detection and file hashing
- Lines 1095-1174: Document indexing (indexPaths)
- Lines 1175-1199: Document removal
- Lines 1200-1232: Clear all RAG data
- Lines 1233-1268: RAG statistics
- Lines 1269-1337: Hybrid search implementation

---

### 4. ipcManager.ts

**Location:** [electron/main/ipcManager.ts](../../electron/main/ipcManager.ts)

**Size:** ~1,500 lines (memory handlers: lines 130-418)

**Purpose:** Register IPC handlers for memory operations

**Key Responsibilities:**
- Bridge between renderer and main process
- Handle memory-related IPC calls
- Error handling and response formatting
- Type-safe IPC communication

**Memory-Related Handlers:**

**Thought Vector Handlers (lines 130-210):**
- `thoughtVector:add` - Add conversation message
- `thoughtVector:search` - Search similar thoughts
- `thoughtVector:delete-all` - Clear all thoughts

**RAG Handlers (lines 213-295):**
- `rag:select-paths` - File picker dialog
- `rag:index-paths` - Index documents
- `rag:search` - Search documents
- `rag:remove-paths` - Remove documents
- `rag:clear` - Clear all RAG data
- `rag:stats` - Get document/chunk counts

**Memory Handlers (lines 302-418):**
- `memory:save` - Create memory
- `memory:get` - Retrieve memories
- `memory:update` - Update memory
- `memory:delete` - Delete memory
- `memory:delete-all` - Delete all memories

**Handler Pattern:**
```typescript
ipcMain.handle('memory:save', async (event, params) => {
  try {
    const result = await saveMemoryLocal(
      params.content,
      params.memoryType,
      params.embedding,
      params.embeddingOpenAI,
      params.embeddingLocal
    )
    return { success: true, data: result }
  } catch (error) {
    console.error('IPC memory:save error:', error)
    return { success: false, error: error.message }
  }
})
```

---

### 5. apiService.ts

**Location:** [src/services/apiService.ts](../../src/services/apiService.ts)

**Size:** ~2,000 lines (embedding functions: lines 518-625)

**Purpose:** Frontend service for API calls, including embedding generation

**Key Responsibilities:**
- Generate embeddings (OpenAI + Local)
- Index messages for thoughts
- Handle embedding provider selection
- Fallback logic between providers

**Main Functions:**

| Function | Purpose | Parameters | Returns |
|----------|---------|------------|---------|
| `createEmbedding()` | Generate single embedding | `text, provider` | `Float32Array` |
| `createDualEmbeddings()` | Generate both embeddings | `text` | `{openai, local}` |
| `fallbackToOpenAIEmbedding()` | Fallback to OpenAI | `text` | `Float32Array` |
| `indexMessageForThoughts()` | Index conversation message | `role, content, convId` | `Promise<void>` |

**Embedding Creation Flow:**
```typescript
// 1. Create dual embeddings
const { embeddingOpenAI, embeddingLocal } = await createDualEmbeddings(text)

// 2. Call IPC to store
await window.electron.ipcRenderer.invoke('thoughtVector:add', {
  conversationId,
  role,
  textContent: text,
  embedding: embeddingLocal || embeddingOpenAI  // Prefer local
})

// 3. Provider auto-detected by dimension
```

**Provider Selection Logic:**
```typescript
function createEmbedding(text: string, provider: 'openai' | 'local') {
  if (provider === 'openai') {
    // Call OpenAI API
    return await openai.embeddings.create({ input: text, model: 'text-embedding-ada-002' })
  } else {
    // Call Go backend
    return await fetch('http://localhost:PORT/api/embeddings/generate', {
      method: 'POST',
      body: JSON.stringify({ text })
    })
  }
}
```

**Key Code Sections:**
- Lines 518-551: createEmbedding (single provider)
- Lines 552-584: createDualEmbeddings (both providers)
- Lines 585-596: fallbackToOpenAIEmbedding
- Lines 598-625: indexMessageForThoughts

---

### 6. MemoryManager.vue

**Location:** [src/components/MemoryManager.vue](../../src/components/MemoryManager.vue)

**Size:** ~600 lines

**Purpose:** UI component for managing long-term memories

**Key Responsibilities:**
- Display memories list
- Create new memories
- Edit existing memories
- Delete memories (single or bulk)
- Generate embeddings before saving

**Main Methods:**

| Method | Purpose | Triggers |
|--------|---------|----------|
| `fetchMemories()` | Load memories | On mount, after save/delete |
| `handleSaveMemory()` | Create/update memory | Save button click |
| `handleEditMemory()` | Enter edit mode | Edit button click |
| `handleDeleteMemory()` | Delete one memory | Delete button click |
| `handleDeleteAllMemories()` | Delete all | Delete All button (with confirm) |

**Component Structure:**
```vue
<template>
  <div class="memory-manager">
    <div class="memory-list">
      <MemoryCard
        v-for="memory in memories"
        :key="memory.id"
        :memory="memory"
        @edit="handleEditMemory"
        @delete="handleDeleteMemory"
      />
    </div>
    <MemoryEditor
      v-if="showEditor"
      :memory="editingMemory"
      @save="handleSaveMemory"
      @cancel="closeEditor"
    />
  </div>
</template>
```

**Save Memory Flow:**
```typescript
async handleSaveMemory() {
  // 1. Generate embeddings
  const { embeddingOpenAI, embeddingLocal } = await createDualEmbeddings(content)

  // 2. Call IPC
  const result = await window.electron.ipcRenderer.invoke('memory:save', {
    content,
    memoryType,
    embeddingOpenAI,
    embeddingLocal
  })

  // 3. Update UI
  if (result.success) {
    await fetchMemories()
    closeEditor()
  }
}
```

**Key Code Sections:**
- Lines 1-100: Template and styling
- Lines 101-156: Setup and state management
- Lines 157-230: Save/create memory logic
- Lines 231-280: Edit memory logic
- Lines 281-330: Delete logic (single and bulk)
- Lines 331-400: Memory card component
- Lines 401-600: Memory editor component

---

## Supporting Files

### 7. settingsStore.ts

**Location:** [src/stores/settingsStore.ts](../../src/stores/settingsStore.ts)

**Purpose:** Pinia store for app settings including memory configuration

**Memory-Related Settings:**
```typescript
interface Settings {
  embeddingProvider: 'openai' | 'local'
  ragEnabled: boolean
  ragPaths: string[]
  ragTopK: number  // Default: 5
  ragMaxContextChars: number  // Default: 10000
  MAX_HISTORY_MESSAGES_FOR_API: number  // Default: 20
  SUMMARIZATION_MESSAGE_COUNT: number  // Default: 10
  SUMMARIZATION_MODEL: string
}
```

---

### 8. Go Backend (Embeddings)

**Location:** [backend/internal/embeddings/](../../backend/internal/embeddings/)

**Purpose:** Generate local embeddings using all-MiniLM-L6-v2 model

**Key Files:**
- `embeddings.go` - Embedding generation logic
- `server.go` - HTTP API endpoints

**API Endpoints:**
```
POST /api/embeddings/generate
Body: { text: string }
Response: { embedding: number[] }

POST /api/embeddings/generate-batch
Body: { texts: string[] }
Response: { embeddings: number[][] }
```

---

## File Dependency Graph

```
User Interaction
    ↓
MemoryManager.vue (UI)
    ↓
apiService.ts (Embeddings)
    ↓
window.electron.ipcRenderer (IPC)
    ↓
ipcManager.ts (Handler Registration)
    ↓
┌─────────────┬─────────────────┬─────────────────┐
│             │                 │                 │
▼             ▼                 ▼                 ▼
thoughtVector  memoryManager   ragDocument      Go Backend
Store.ts      .ts              Store.ts         (embeddings)
    ↓             ↓                 ↓                 ↓
alice-thoughts  alice-thoughts  alice-rag        HTTP API
.sqlite         .sqlite         .sqlite
    ↓             ↓                 ↓
alice-thoughts  (embeddings     alice-rag-
-hnsw-*.index   in DB only)     hnsw-local.index
```

---

## Quick Reference: Where to Find Things

| Task | File | Function/Section |
|------|------|------------------|
| Add thought to memory | thoughtVectorStore.ts:398 | `addThoughtVector()` |
| Search thoughts | thoughtVectorStore.ts:679 | `searchSimilarThoughts()` |
| Create long-term memory | memoryManager.ts:254 | `saveMemoryLocal()` |
| Retrieve memories | memoryManager.ts:129 | `getRecentMemoriesLocal()` |
| Index documents | ragDocumentStore.ts:1095 | `indexPaths()` |
| Search documents | ragDocumentStore.ts:1269 | `searchRag()` |
| Generate embedding | apiService.ts:518 | `createEmbedding()` |
| Dual embeddings | apiService.ts:552 | `createDualEmbeddings()` |
| Memory UI | MemoryManager.vue:157 | `handleSaveMemory()` |
| IPC handlers | ipcManager.ts:130-418 | Various handlers |
| Database schema | thoughtVectorStore.ts:51 | Table definitions |
| HNSW index mgmt | thoughtVectorStore.ts:523 | Index functions |
| RAG chunking | ragDocumentStore.ts:653 | Chunking logic |
| Hybrid search | ragDocumentStore.ts:1269 | Rank fusion |

---

## Import Statements Reference

**From Renderer Process (Vue components):**
```typescript
import { createEmbedding, createDualEmbeddings } from '@/services/apiService'
import { useSettingsStore } from '@/stores/settingsStore'
```

**From Main Process (Electron):**
```typescript
import {
  initializeThoughtVectorStore,
  addThoughtVector,
  searchSimilarThoughts,
  deleteAllThoughtVectors
} from './thoughtVectorStore'

import {
  saveMemoryLocal,
  getRecentMemoriesLocal,
  deleteMemoryLocal,
  deleteAllMemoriesLocal
} from './memoryManager'

import {
  initializeRagStore,
  indexPaths,
  searchRag,
  clearRag
} from './ragDocumentStore'
```

---

[← Back: Storage Locations](./02-storage-locations.md) | [Back to Index](./README.md) | [Next: Database Schemas →](./04-database-schemas.md)
