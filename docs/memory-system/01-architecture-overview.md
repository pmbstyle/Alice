# Memory System Architecture Overview

## Three-Layer Memory Architecture

Alice implements a sophisticated three-layer memory system that provides both short-term context awareness and long-term knowledge retention.

### 1. Short-Term Memory: Thought Vectors

**Purpose:** Store recent conversation messages with semantic embeddings for context-aware responses

**Characteristics:**
- Automatically captures all conversation messages
- Indexed with vector embeddings for semantic similarity search
- Enables the AI to retrieve relevant context from past conversations
- Supports conversation summarization to compress history
- Dual embedding support (OpenAI + Local)

**Key Components:**
- SQLite database: `alice-thoughts.sqlite` (thoughts table)
- HNSW indices: `alice-thoughts-hnsw-openai.index`, `alice-thoughts-hnsw-local.index`
- Manager: [thoughtVectorStore.ts](../../electron/main/thoughtVectorStore.ts)

**Use Cases:**
- "What did we discuss about the project yesterday?"
- "Remember when I mentioned my preference for dark mode?"
- Providing contextual responses based on conversation history

### 2. Long-Term Memory: User Memories

**Purpose:** User-managed persistent knowledge base for important facts, preferences, and notes

**Characteristics:**
- Manually created by users via MemoryManager UI
- Can be edited and deleted at any time
- Supports categorization by memory type (personal, work, hobby, general)
- Optional semantic search via embeddings
- Dual embedding support (OpenAI + Local)

**Key Components:**
- SQLite database: `alice-thoughts.sqlite` (long_term_memories table)
- Manager: [memoryManager.ts](../../electron/main/memoryManager.ts)
- UI Component: [MemoryManager.vue](../../src/components/MemoryManager.vue)

**Use Cases:**
- "My birthday is June 15th" → Save as personal memory
- "I prefer using TypeScript for all projects" → Save as work preference
- "My favorite color is blue" → Save as general fact

### 3. Document Memory: RAG (Retrieval-Augmented Generation)

**Purpose:** Index user documents for semantic search and chat-with-documents functionality

**Characteristics:**
- Supports PDF, DOCX, Markdown, HTML, TXT files
- Automatic chunking and embedding generation
- Hybrid search (vector similarity + keyword matching)
- Change detection to avoid re-indexing unchanged files
- Metadata preservation (file paths, page numbers, sections)

**Key Components:**
- SQLite database: `alice-rag.sqlite`
- HNSW index: `alice-rag-hnsw-local.index`
- Metadata: `alice-rag-hnsw-local.meta.json`
- Manager: [ragDocumentStore.ts](../../electron/main/ragDocumentStore.ts)

**Use Cases:**
- "What does my contract say about vacation days?" → Searches indexed documents
- "Summarize the key points from my meeting notes" → Retrieves relevant chunks
- "Find references to the authentication system" → Hybrid vector + keyword search

## Memory System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         Vue.js Frontend                          │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ Chat Interface │  │MemoryManager UI│  │  RAG UI Dialog   │  │
│  └────────────────┘  └────────────────┘  └──────────────────┘  │
│           │                   │                    │             │
│           │                   │                    │             │
│           └───────────────────┼────────────────────┘             │
│                               │                                  │
└───────────────────────────────┼──────────────────────────────────┘
                                │ IPC (Inter-Process Communication)
                                │
┌───────────────────────────────┼──────────────────────────────────┐
│                    Electron Main Process                         │
│                               │                                  │
│                    ┌──────────▼──────────┐                       │
│                    │   IPC Manager       │                       │
│                    │  (ipcManager.ts)    │                       │
│                    └──────────┬──────────┘                       │
│                               │                                  │
│          ┌────────────────────┼────────────────────┐             │
│          │                    │                    │             │
│  ┌───────▼──────────┐ ┌──────▼──────────┐ ┌──────▼──────────┐  │
│  │ Thought Vector   │ │  Memory         │ │  RAG Document   │  │
│  │ Store Manager    │ │  Manager        │ │  Store Manager  │  │
│  │ (thoughtVector   │ │ (memoryManager  │ │ (ragDocument    │  │
│  │  Store.ts)       │ │  .ts)           │ │  Store.ts)      │  │
│  └─────────┬────────┘ └────────┬────────┘ └────────┬────────┘  │
│            │                   │                    │            │
└────────────┼───────────────────┼────────────────────┼────────────┘
             │                   │                    │
             │                   │                    │
    ┌────────▼────────┐ ┌────────▼────────┐ ┌────────▼─────────┐
    │ alice-thoughts  │ │ alice-thoughts  │ │ alice-rag.sqlite │
    │ .sqlite         │ │ .sqlite         │ │                  │
    │                 │ │                 │ │ - rag_documents  │
    │ - thoughts      │ │ - long_term_    │ │ - rag_chunks     │
    │ - conversation_ │ │   memories      │ │ - rag_chunks_fts │
    │   summaries     │ │                 │ │                  │
    └────────┬────────┘ └────────┬────────┘ └────────┬─────────┘
             │                   │                    │
             │                   │                    │
    ┌────────▼─────────┐         │           ┌────────▼─────────┐
    │ HNSW Indices     │         │           │ HNSW Index       │
    │ - openai.index   │         │           │ - local.index    │
    │ - local.index    │         │           │ - local.meta.json│
    └──────────────────┘         │           └──────────────────┘
                                 │
                        ┌────────▼────────┐
                        │ Embeddings only │
                        │ (stored in DB)  │
                        └─────────────────┘
```

## Data Flow

### 1. Short-Term Memory Flow
```
User sends message
    ↓
Message sent to LLM (OpenAI/Ollama/etc.)
    ↓
apiService.ts → indexMessageForThoughts()
    ↓
Generate embedding (OpenAI or Local via Go backend)
    ↓
IPC: 'thoughtVector:add' → thoughtVectorStore.ts
    ↓
Store in SQLite + Add to HNSW index
    ↓
Persist index to disk
```

### 2. Long-Term Memory Flow
```
User creates memory in MemoryManager UI
    ↓
MemoryManager.vue → handleSaveMemory()
    ↓
apiService.ts → createDualEmbeddings() (OpenAI + Local)
    ↓
IPC: 'memory:save' → memoryManager.ts
    ↓
Store in SQLite with both embeddings
    ↓
Success confirmation to UI
```

### 3. Document Memory Flow
```
User selects files/folders
    ↓
IPC: 'rag:index-paths' → ragDocumentStore.ts
    ↓
For each file:
    - Extract text (PDF/DOCX/Markdown/HTML/TXT)
    - Chunk into ~120 token segments
    - Generate embeddings via Go backend
    - Calculate file hash for change detection
    ↓
Store chunks in SQLite + Add vectors to HNSW index
    ↓
Update metadata file + Persist index
```

## Embedding Strategy

### Dual Embedding Support

Alice supports **two embedding providers** simultaneously:

#### 1. OpenAI Embeddings
- Model: `text-embedding-ada-002`
- Dimensions: 1536
- Requires: OpenAI API key
- Cost: ~$0.0001 per 1K tokens
- Quality: High-quality embeddings, excellent for semantic search

#### 2. Local Embeddings
- Model: `all-MiniLM-L6-v2` (via Go backend)
- Dimensions: 384
- Requires: Nothing (runs locally)
- Cost: Free
- Quality: Good quality, faster inference

### Why Dual Embeddings?

1. **Privacy**: Users can choose local embeddings for complete privacy
2. **Cost**: Avoid API costs for embedding generation
3. **Offline**: Work without internet connection
4. **Fallback**: If OpenAI API fails, use local embeddings
5. **Comparison**: Allows comparing results from both providers

### Automatic Provider Detection

When searching, the system automatically detects which provider to use based on the **query embedding dimensions**:
- 384 dimensions → Use Local HNSW index
- 1536 dimensions → Use OpenAI HNSW index
- Unknown → Try both, combine results

## Vector Search Technology

### HNSW (Hierarchical Navigable Small-World)

Alice uses **hnswlib-node** for approximate nearest neighbor search:

**Advantages:**
- Fast O(log n) search complexity
- Memory efficient
- High recall (finds correct neighbors)
- Supports millions of vectors

**Configuration:**
- Max elements: 10,000 (thoughts), 200,000 (RAG)
- Distance metric: Cosine similarity
- M parameter: 16 (controls graph connectivity)
- ef_construction: 200 (build-time accuracy)

**Index Files:**
- `alice-thoughts-hnsw-openai.index` (1536-dim OpenAI vectors)
- `alice-thoughts-hnsw-local.index` (384-dim Local vectors)
- `alice-rag-hnsw-local.index` (384-dim Local vectors only)

### Cosine Similarity

All vector searches use **cosine similarity** as the distance metric:

```
similarity = 1 - (A · B) / (||A|| * ||B||)
```

**Range:** 0 (identical) to 2 (opposite)
**Interpretation:** Lower distance = more similar

## Memory Lifecycle

### Initialization (App Startup)
1. `initializeThoughtVectorStore()` - Load thoughts database and indices
2. `initializeRagStore()` - Load RAG database and indices
3. Load settings (embedding provider, RAG paths, etc.)
4. Run migrations (if needed)
5. Verify index integrity (rebuild if corrupted)

### During Conversation
1. Each message → `indexMessageForThoughts()` (automatic)
2. Context retrieval → `searchSimilarThoughts()` + `searchRag()`
3. Summarization triggers → `getRecentMessagesForSummarization()`
4. Summary stored → `saveConversationSummary()`

### User Actions
1. Create/edit/delete memories → MemoryManager UI
2. Index/remove documents → RAG UI dialog
3. Clear memory → Various delete functions

### Shutdown (App Quit)
1. `ensureSaveOnQuit()` - Persist all HNSW indices
2. Close SQLite connections gracefully
3. Clear in-memory caches

## Performance Characteristics

### Time Complexity
- **Add memory**: O(log n) - HNSW insertion
- **Search memory**: O(log n) - HNSW nearest neighbor search
- **Delete memory**: O(1) - SQLite indexed deletion
- **Rebuild index**: O(n log n) - Reconstruct HNSW from scratch

### Space Complexity
- **Thoughts**: ~2 KB per message (text + 2 embeddings + metadata)
- **Long-term memories**: ~2 KB per memory (content + 2 embeddings + metadata)
- **RAG chunks**: ~1 KB per chunk (text + 1 embedding + metadata)
- **HNSW indices**: ~10 MB per 10,000 vectors (1536-dim), ~2.5 MB (384-dim)

### Scaling Limits
- **Thoughts**: 10,000 messages (auto-summarization helps manage)
- **Long-term memories**: Unlimited (practical limit ~100,000)
- **RAG documents**: 200,000 chunks (~2,000 typical documents)

## Error Handling & Recovery

### Database Corruption
- Automatic detection on initialization
- Reset corrupted database (delete + recreate)
- Rebuild indices from scratch
- Track recovery attempts (prevent loops)

### Index Corruption
- Verify index matches database on load
- Compare counts and timestamps
- Rebuild index if mismatch detected
- Log recovery operations

### Embedding Generation Failures
- Retry logic for temporary failures
- Fallback from OpenAI to Local provider
- Graceful degradation (store without embeddings if both fail)
- User notification on persistent failures

### Migration Failures
- Non-fatal migration errors (log and continue)
- Mark migrations as complete even on partial success
- Idempotent migrations (safe to re-run)

## Security & Privacy Considerations

### Data Storage
- All memory stored **locally** in user's home directory
- No cloud backup by default
- Files stored in plaintext (SQLite databases)
- Embeddings are numerical vectors (not reversible to original text)

### API Communication
- Embeddings sent to OpenAI API (if using OpenAI provider)
- Local embeddings generated entirely on-device (via Go backend)
- No memory data sent to third parties
- User can choose local-only mode for complete privacy

### Access Control
- Only the Alice application can access memory files
- OS file permissions apply (user-level access)
- No network exposure (localhost-only interfaces)

## Configuration Options

### Settings (settingsStore.ts)
```typescript
{
  embeddingProvider: 'openai' | 'local',  // Global embedding choice
  ragEnabled: boolean,                     // Enable/disable RAG
  ragPaths: string[],                      // Indexed document paths
  ragTopK: number,                         // Documents per search (default: 5)
  ragMaxContextChars: number,              // Max context size (default: 10000)
  MAX_HISTORY_MESSAGES_FOR_API: number,    // Conversation limit (default: 20)
  SUMMARIZATION_MESSAGE_COUNT: number,     // Messages per summary (default: 10)
  SUMMARIZATION_MODEL: string              // Model for summarization
}
```

### Environment Variables
```
VITE_OPENAI_API_KEY - OpenAI API key (for OpenAI embeddings)
```

## Future Enhancements

Potential improvements to the memory system:

1. **Encryption at Rest** - Encrypt SQLite databases with user password
2. **Cloud Sync** - Optional cloud backup for memories
3. **Memory Expiration** - Auto-delete old thoughts after X days
4. **Importance Scoring** - Weight memories by importance
5. **Memory Compression** - Compress old embeddings
6. **Multi-Modal Embeddings** - Support images, audio
7. **Federated Search** - Search across multiple memory stores
8. **Memory Sharing** - Export/import memories between users

---

[← Back to Index](./README.md) | [Next: Storage Locations →](./02-storage-locations.md)
