# Alice Memory System - Complete Documentation

This directory contains comprehensive documentation about the Alice AI Assistant memory system.

## Overview

Alice uses a **three-layer memory architecture**:
1. **Short-Term Memory (Thoughts)** - Recent conversation history with semantic embeddings
2. **Long-Term Memory (Memories)** - User-managed persistent knowledge base
3. **Document Memory (RAG)** - Indexed documents for semantic search

## Documentation Files

- [**01-architecture-overview.md**](./01-architecture-overview.md) - High-level architecture and design
- [**02-storage-locations.md**](./02-storage-locations.md) - Where memory data is stored
- [**03-key-files-reference.md**](./03-key-files-reference.md) - Important files and their responsibilities
- [**04-database-schemas.md**](./04-database-schemas.md) - SQLite database schemas
- [**05-memory-flows.md**](./05-memory-flows.md) - How memory is created, retrieved, and deleted
- [**06-embedding-system.md**](./06-embedding-system.md) - Embedding generation and vector search
- [**07-ipc-handlers.md**](./07-ipc-handlers.md) - IPC handler reference
- [**08-cleanup-guide.md**](./08-cleanup-guide.md) - How to clean or modify memory
- [**09-vector-indices.md**](./09-vector-indices.md) - HNSW vector index management
- [**10-performance-optimization.md**](./10-performance-optimization.md) - Performance considerations

## Quick Start

### Where is Memory Stored?

**Windows:** `%APPDATA%\alice-ai-app\`
- `alice-thoughts.sqlite` - Short-term & long-term memory database
- `alice-thoughts-hnsw-openai.index` - OpenAI embeddings index
- `alice-thoughts-hnsw-local.index` - Local embeddings index
- `alice-rag.sqlite` - Document memory database
- `alice-rag-hnsw-local.index` - Document embeddings index

**Linux/macOS:** `~/.alice-ai-app/`

### How to Clean Memory

#### Delete All Conversation History (Short-Term Memory)
```javascript
// Via IPC in renderer process
await window.electron.ipcRenderer.invoke('thoughtVector:delete-all')
```

#### Delete All Long-Term Memories
```javascript
// Via IPC in renderer process
await window.electron.ipcRenderer.invoke('memory:delete-all')
```

#### Delete All Document Indices (RAG)
```javascript
// Via IPC in renderer process
await window.electron.ipcRenderer.invoke('rag:clear')
```

#### Manual Cleanup (Nuclear Option)
1. Close Alice application completely
2. Delete files in `%APPDATA%\alice-ai-app\`:
   - `alice-thoughts.sqlite`
   - `alice-thoughts-hnsw-*.index`
   - `alice-rag.sqlite`
   - `alice-rag-hnsw-*.index`
   - `alice-rag-hnsw-*.meta.json`
3. Restart Alice (databases will be recreated)

### Key Code Entry Points

| Feature | File | Function |
|---------|------|----------|
| Add conversation to memory | [thoughtVectorStore.ts](../../electron/main/thoughtVectorStore.ts) | `addThoughtVector()` |
| Search conversation history | [thoughtVectorStore.ts](../../electron/main/thoughtVectorStore.ts) | `searchSimilarThoughts()` |
| Create long-term memory | [memoryManager.ts](../../electron/main/memoryManager.ts) | `saveMemoryLocal()` |
| Retrieve long-term memories | [memoryManager.ts](../../electron/main/memoryManager.ts) | `getRecentMemoriesLocal()` |
| Index documents | [ragDocumentStore.ts](../../electron/main/ragDocumentStore.ts) | `indexPaths()` |
| Search documents | [ragDocumentStore.ts](../../electron/main/ragDocumentStore.ts) | `searchRag()` |
| Generate embeddings | [apiService.ts](../../src/services/apiService.ts) | `createEmbedding()`, `createDualEmbeddings()` |

## Memory System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Alice Memory System                      │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│  Short-Term  │      │  Long-Term   │     │  Document    │
│   (Thoughts) │      │  (Memories)  │     │    (RAG)     │
└──────────────┘      └──────────────┘     └──────────────┘
        │                     │                     │
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│ alice-       │      │ alice-       │     │ alice-       │
│ thoughts     │      │ thoughts     │     │ rag.sqlite   │
│ .sqlite      │      │ .sqlite      │     │              │
│              │      │              │     │ alice-rag-   │
│ (thoughts    │      │ (long_term_  │     │ hnsw-local   │
│  table)      │      │  memories    │     │ .index       │
│              │      │  table)      │     │              │
└──────────────┘      └──────────────┘     └──────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│ HNSW Indices │      │ Embeddings   │     │ HNSW Index   │
│ - OpenAI     │      │ - OpenAI     │     │ - Local only │
│ - Local      │      │ - Local      │     │              │
└──────────────┘      └──────────────┘     └──────────────┘
```

## Technologies Used

- **better-sqlite3** - Fast synchronous SQLite database
- **hnswlib-node** - Hierarchical Navigable Small-World vector search
- **OpenAI Embeddings** - text-embedding-ada-002 (1536 dimensions)
- **Local Embeddings** - all-MiniLM-L6-v2 (384 dimensions, via Go backend)
- **FTS5** - SQLite full-text search for RAG keyword search

## Additional Resources

- [Main Project README](../../README.md)
- [Setup Instructions](../setupInstructions.md)
- [Security Analysis](../../CLAUDE.md)

---

*Last Updated: 2026-01-11*
