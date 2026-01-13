# Alice Memory System - Executive Summary

## Quick Overview

Alice uses a **three-layer memory architecture**:

1. **Short-Term Memory (Thoughts)** - Automatic conversation history with semantic search
2. **Long-Term Memory (Memories)** - User-created persistent knowledge base
3. **Document Memory (RAG)** - Indexed documents for semantic search

All memory is stored **locally** on your machine in `%APPDATA%\alice-ai-app\` (Windows) or `~/.config/alice-ai-app/` (Linux/macOS).

## File Locations

| Data Type | Database File | Index Files |
|-----------|--------------|-------------|
| Conversations | `alice-thoughts.sqlite` | `alice-thoughts-hnsw-openai.index`<br>`alice-thoughts-hnsw-local.index` |
| Long-term memories | `alice-thoughts.sqlite` | (embeddings in DB) |
| Documents (RAG) | `alice-rag.sqlite` | `alice-rag-hnsw-local.index` |

## Key Files in Codebase

| Component | File | Purpose |
|-----------|------|---------|
| Short-term memory | [thoughtVectorStore.ts](../../electron/main/thoughtVectorStore.ts) | Conversation indexing & search |
| Long-term memory | [memoryManager.ts](../../electron/main/memoryManager.ts) | User memories CRUD |
| Document memory | [ragDocumentStore.ts](../../electron/main/ragDocumentStore.ts) | Document indexing & search |
| IPC handlers | [ipcManager.ts](../../electron/main/ipcManager.ts) | Frontend ↔ Backend bridge |
| Embeddings | [apiService.ts](../../src/services/apiService.ts) | Generate vectors |
| Memory UI | [MemoryManager.vue](../../src/components/MemoryManager.vue) | User interface |

## How to Clean Memory

### Delete All Conversation History
```javascript
await window.electron.ipcRenderer.invoke('thoughtVector:delete-all')
```

### Delete All Long-Term Memories
```javascript
await window.electron.ipcRenderer.invoke('memory:delete-all')
```

### Delete All Document Indices
```javascript
await window.electron.ipcRenderer.invoke('rag:clear')
```

### Nuclear Reset (All Memory)
1. Close Alice completely
2. Delete files in `%APPDATA%\alice-ai-app\`:
   - `alice-thoughts.sqlite*`
   - `alice-rag.sqlite*`
   - `alice-*-hnsw-*.index`
3. Restart Alice

## Memory Flow Diagrams

### Short-Term Memory (Automatic)
```
User message → LLM
    ↓
Generate embedding (OpenAI or Local)
    ↓
Store in alice-thoughts.sqlite
    ↓
Add to HNSW index
    ↓
Available for semantic search
```

### Long-Term Memory (Manual)
```
User creates memory in UI
    ↓
Generate dual embeddings
    ↓
Store in alice-thoughts.sqlite
    ↓
Available for retrieval
```

### Document Memory (RAG)
```
User selects files
    ↓
Extract text → Chunk → Generate embeddings
    ↓
Store in alice-rag.sqlite + HNSW index
    ↓
Available for hybrid search (vector + keyword)
```

## Database Schemas

### alice-thoughts.sqlite

**thoughts table:**
```sql
CREATE TABLE thoughts (
  hnsw_label INTEGER PRIMARY KEY,
  thought_id TEXT UNIQUE,
  conversation_id TEXT,
  role TEXT,
  text_content TEXT,
  created_at TEXT,
  embedding_openai BLOB,  -- 1536 dimensions
  embedding_local BLOB     -- 384 dimensions
)
```

**long_term_memories table:**
```sql
CREATE TABLE long_term_memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  memory_type TEXT,
  created_at TEXT,
  embedding_openai BLOB,
  embedding_local BLOB
)
```

### alice-rag.sqlite

**rag_documents table:**
```sql
CREATE TABLE rag_documents (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE,
  file_hash TEXT,
  mtime INTEGER,
  size INTEGER,
  title TEXT,
  created_at TEXT,
  updated_at TEXT
)
```

**rag_chunks table:**
```sql
CREATE TABLE rag_chunks (
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
```

## Vector Embeddings

Alice supports **two embedding providers**:

| Provider | Model | Dimensions | Cost | Quality |
|----------|-------|------------|------|---------|
| **OpenAI** | text-embedding-ada-002 | 1536 | $0.0001/1K tokens | High |
| **Local** | all-MiniLM-L6-v2 | 384 | Free | Good |

**Why dual embeddings?**
- Privacy (local embeddings don't leave your machine)
- Cost savings (no API fees)
- Offline capability
- Fallback redundancy

## Vector Search (HNSW)

Alice uses **Hierarchical Navigable Small-World (HNSW)** for fast approximate nearest neighbor search.

**Benefits:**
- O(log n) search complexity
- High recall (finds correct neighbors)
- Handles millions of vectors
- Memory efficient

**Indices:**
- `alice-thoughts-hnsw-openai.index` (1536-dim, 10K max)
- `alice-thoughts-hnsw-local.index` (384-dim, 10K max)
- `alice-rag-hnsw-local.index` (384-dim, 200K max)

## IPC API Reference

### Thought Vector Operations

| Handler | Purpose | Parameters |
|---------|---------|------------|
| `thoughtVector:add` | Add message | `{conversationId, role, textContent, embedding}` |
| `thoughtVector:search` | Search history | `{queryEmbedding, topK}` |
| `thoughtVector:delete-all` | Clear all | None |

### Memory Operations

| Handler | Purpose | Parameters |
|---------|---------|------------|
| `memory:save` | Create memory | `{content, memoryType, embedding*}` |
| `memory:get` | Retrieve memories | `{limit, memoryType?, queryEmbedding?}` |
| `memory:update` | Update memory | `{id, content, memoryType, embedding*}` |
| `memory:delete` | Delete memory | `{id}` |
| `memory:delete-all` | Delete all | None |

### RAG Operations

| Handler | Purpose | Parameters |
|---------|---------|------------|
| `rag:index-paths` | Index docs | `{paths, recursive?}` |
| `rag:search` | Search docs | `{queryEmbedding, queryText, topK}` |
| `rag:remove-paths` | Remove docs | `{paths}` |
| `rag:clear` | Clear all | None |
| `rag:stats` | Get stats | None |

## Performance Characteristics

### Time Complexity
- **Add memory**: O(log n) - HNSW insertion
- **Search memory**: O(log n) - HNSW nearest neighbor
- **Delete memory**: O(1) - Indexed deletion

### Space Usage
- **Thought**: ~2 KB (text + 2 embeddings)
- **Memory**: ~2 KB (content + 2 embeddings)
- **RAG chunk**: ~1 KB (text + 1 embedding)
- **HNSW index**: ~10 MB per 10K vectors (1536-dim), ~2.5 MB (384-dim)

### Scaling Limits
- **Thoughts**: 10,000 messages (auto-summarization)
- **Memories**: ~100,000 (practical limit)
- **RAG chunks**: 200,000 (~2,000 documents)

## Security & Privacy

### Data Storage
- ✅ All data stored **locally**
- ✅ No cloud backup (by default)
- ✅ Plaintext SQLite databases
- ✅ Embeddings not reversible to original text

### API Communication
- ⚠️ Text sent to OpenAI for embeddings (if using OpenAI provider)
- ✅ Local embeddings generated on-device (via Go backend)
- ✅ No memory data sent to third parties
- ✅ Can use 100% local mode for complete privacy

### Recommendations
- Use local embeddings for maximum privacy
- Protect `alice-settings.json` (contains API keys)
- Enable full-disk encryption for sensitive data
- Exclude storage directory from cloud backups if concerned

## Common Tasks

### Backup Memory
```bash
# Windows (PowerShell)
Copy-Item -Recurse "%APPDATA%\alice-ai-app" "C:\Backup\alice-$(Get-Date -Format 'yyyy-MM-dd')"

# Linux/macOS
cp -r ~/.config/alice-ai-app ~/backups/alice-$(date +%Y-%m-%d)
```

### Restore Memory
1. Close Alice
2. Copy backed-up files to storage directory
3. Restart Alice

### Check Memory Usage
```sql
-- Conversation count
sqlite3 alice-thoughts.sqlite "SELECT COUNT(*) FROM thoughts;"

-- Memory count
sqlite3 alice-thoughts.sqlite "SELECT COUNT(*) FROM long_term_memories;"

-- RAG document count
sqlite3 alice-rag.sqlite "SELECT COUNT(*) FROM rag_documents;"

-- Database size
sqlite3 alice-thoughts.sqlite "SELECT page_count * page_size / 1024 / 1024 AS size_mb FROM pragma_page_count(), pragma_page_size();"
```

### Reclaim Disk Space (After Deletions)
```sql
sqlite3 alice-thoughts.sqlite "VACUUM;"
sqlite3 alice-rag.sqlite "VACUUM;"
```

## Troubleshooting

### "Database is locked"
**Solution:** Close Alice completely, wait 10 seconds, restart

### Cleanup doesn't free space
**Solution:** Run `VACUUM;` on databases (see above)

### Memory appears after deletion
**Solution:** Close Alice, delete index files, restart (indices rebuild)

### Index size mismatch warnings
**Solution:** Automatic - Alice rebuilds index on next startup

## Further Reading

For detailed information, see the complete documentation:

1. [Architecture Overview](./01-architecture-overview.md) - System design and data flow
2. [Storage Locations](./02-storage-locations.md) - Where files are stored
3. [Key Files Reference](./03-key-files-reference.md) - Code files and their roles
4. [Database Schemas](./04-database-schemas.md) - Database structure (if created)
5. [Memory Flows](./05-memory-flows.md) - Creation and retrieval flows (if created)
6. [Embedding System](./06-embedding-system.md) - Vector embeddings (if created)
7. [IPC Handlers](./07-ipc-handlers.md) - API reference (if created)
8. [Cleanup Guide](./08-cleanup-guide.md) - Detailed cleanup instructions
9. [Vector Indices](./09-vector-indices.md) - HNSW index management (if created)

---

**Questions?** Check the main [README](./README.md) or explore the individual documentation files above.

*Last Updated: 2026-01-11*
