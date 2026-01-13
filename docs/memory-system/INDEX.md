# Memory System Documentation - Complete Index

## Documentation Structure

This directory contains comprehensive documentation about Alice's memory system. Start with the **SUMMARY** for a quick overview, or dive into specific topics below.

## 📚 Core Documentation

### [SUMMARY.md](./SUMMARY.md) ⭐ **START HERE**
**Quick reference guide with essential information**
- Overview of the three-layer architecture
- File locations and key code files
- Quick cleanup commands
- Database schemas
- IPC API reference
- Common tasks and troubleshooting

### [README.md](./README.md)
**Main entry point with navigation**
- Documentation file index
- Quick start guide
- Key component overview
- Technology stack
- Additional resources

---

## 📖 Detailed Documentation

### [01-architecture-overview.md](./01-architecture-overview.md)
**System design and architecture**
- Three-layer memory system explained
- Data flow diagrams
- Embedding strategy
- Vector search technology (HNSW)
- Memory lifecycle
- Performance characteristics
- Error handling and recovery
- Security and privacy considerations

**Topics covered:**
- Short-term memory (Thoughts)
- Long-term memory (Memories)
- Document memory (RAG)
- Dual embedding support
- HNSW vector indices
- Cosine similarity
- Memory initialization
- Shutdown procedures

---

### [02-storage-locations.md](./02-storage-locations.md)
**Where memory data is stored**
- Platform-specific paths
- File inventory (databases, indices, settings)
- Database details and size growth
- Storage quotas and limits
- Backup and migration procedures
- Cleaning and maintenance
- Monitoring storage usage
- Security considerations

**Topics covered:**
- `alice-thoughts.sqlite` location
- `alice-rag.sqlite` location
- HNSW index files
- Legacy migration files
- Disk space requirements
- Backup strategies
- File permissions
- Data leakage risks

---

### [03-key-files-reference.md](./03-key-files-reference.md)
**Code files and their responsibilities**
- Detailed file-by-file breakdown
- Function reference for each file
- Database table definitions
- TypeScript interfaces
- Code section locations
- Import statements
- File dependency graph

**Files documented:**
1. `thoughtVectorStore.ts` (942 lines)
2. `memoryManager.ts` (349 lines)
3. `ragDocumentStore.ts` (1,337 lines)
4. `ipcManager.ts` (memory handlers)
5. `apiService.ts` (embedding functions)
6. `MemoryManager.vue` (UI component)
7. `settingsStore.ts` (configuration)
8. Go backend (embedding service)

---

### [08-cleanup-guide.md](./08-cleanup-guide.md)
**How to clean or modify memory**
- Safe cleanup methods (IPC)
- Advanced cleanup (SQL)
- Nuclear cleanup (complete reset)
- Selective cleanup strategies
- Maintenance operations
- Monitoring and verification
- Automation scripts
- Troubleshooting

**Cleanup operations covered:**
- Clear conversation history
- Clear long-term memories
- Clear RAG documents
- Delete single memory
- Remove specific documents
- Delete old summaries
- Delete by conversation/type
- VACUUM databases
- Rebuild indices

---

## 🔧 Quick Reference

### Memory Storage Paths

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\alice-ai-app\` |
| Linux | `~/.config/alice-ai-app/` |
| macOS | `~/Library/Application Support/alice-ai-app/` |

### Key Database Files

- `alice-thoughts.sqlite` - Conversations + Long-term memories
- `alice-rag.sqlite` - Document indices
- `alice-thoughts-hnsw-openai.index` - OpenAI vectors (1536-dim)
- `alice-thoughts-hnsw-local.index` - Local vectors (384-dim)
- `alice-rag-hnsw-local.index` - RAG vectors (384-dim)

### Essential Code Files

| Component | File Path |
|-----------|-----------|
| Short-term memory | [electron/main/thoughtVectorStore.ts](../../electron/main/thoughtVectorStore.ts) |
| Long-term memory | [electron/main/memoryManager.ts](../../electron/main/memoryManager.ts) |
| Document memory | [electron/main/ragDocumentStore.ts](../../electron/main/ragDocumentStore.ts) |
| IPC handlers | [electron/main/ipcManager.ts](../../electron/main/ipcManager.ts) |
| Embedding service | [src/services/apiService.ts](../../src/services/apiService.ts) |
| Memory UI | [src/components/MemoryManager.vue](../../src/components/MemoryManager.vue) |

---

## 🎯 Quick Tasks

### Delete All Conversation History
```javascript
await window.electron.ipcRenderer.invoke('thoughtVector:delete-all')
```

### Delete All Long-Term Memories
```javascript
await window.electron.ipcRenderer.invoke('memory:delete-all')
```

### Delete All RAG Documents
```javascript
await window.electron.ipcRenderer.invoke('rag:clear')
```

### Check Memory Counts
```bash
sqlite3 alice-thoughts.sqlite "SELECT COUNT(*) FROM thoughts;"
sqlite3 alice-thoughts.sqlite "SELECT COUNT(*) FROM long_term_memories;"
sqlite3 alice-rag.sqlite "SELECT COUNT(*) FROM rag_documents;"
```

### Backup All Memory
```bash
# Windows (PowerShell)
Copy-Item -Recurse "%APPDATA%\alice-ai-app" "C:\Backup\alice-$(Get-Date -Format 'yyyy-MM-dd')"

# Linux/macOS
cp -r ~/.config/alice-ai-app ~/backups/alice-$(date +%Y-%m-%d)
```

### Nuclear Reset (Delete Everything)
1. Close Alice
2. Delete: `alice-thoughts.sqlite*`, `alice-rag.sqlite*`, `alice-*.index`
3. Restart Alice

---

## 🔍 Find Information By Topic

### Architecture & Design
- [Architecture Overview](./01-architecture-overview.md)
- [Three-layer system](./01-architecture-overview.md#three-layer-memory-architecture)
- [Data flow diagrams](./01-architecture-overview.md#data-flow)
- [Memory lifecycle](./01-architecture-overview.md#memory-lifecycle)

### Storage & Files
- [Storage locations](./02-storage-locations.md)
- [File inventory](./02-storage-locations.md#file-inventory)
- [Disk space requirements](./02-storage-locations.md#disk-space-requirements)
- [Backup procedures](./02-storage-locations.md#backup--migration)

### Code Reference
- [Key files overview](./03-key-files-reference.md)
- [thoughtVectorStore.ts](./03-key-files-reference.md#1-thoughtvectorstorets)
- [memoryManager.ts](./03-key-files-reference.md#2-memorymanagerts)
- [ragDocumentStore.ts](./03-key-files-reference.md#3-ragdocumentstorerts)
- [Function reference](./03-key-files-reference.md#quick-reference-where-to-find-things)

### Database Structure
- [Database schemas](./SUMMARY.md#database-schemas)
- [thoughts table](./03-key-files-reference.md#1-thoughtvectorstorets)
- [long_term_memories table](./03-key-files-reference.md#2-memorymanagerts)
- [rag_documents table](./03-key-files-reference.md#3-ragdocumentstorerts)
- [rag_chunks table](./03-key-files-reference.md#3-ragdocumentstorerts)

### Embeddings & Vectors
- [Embedding strategy](./01-architecture-overview.md#embedding-strategy)
- [Dual embedding support](./01-architecture-overview.md#dual-embedding-support)
- [OpenAI embeddings](./SUMMARY.md#vector-embeddings)
- [Local embeddings](./SUMMARY.md#vector-embeddings)
- [Vector search (HNSW)](./01-architecture-overview.md#vector-search-technology)

### IPC API
- [IPC handlers reference](./03-key-files-reference.md#4-ipcmanagerts)
- [Thought vector API](./SUMMARY.md#thought-vector-operations)
- [Memory API](./SUMMARY.md#memory-operations)
- [RAG API](./SUMMARY.md#rag-operations)

### Cleanup & Maintenance
- [Cleanup guide](./08-cleanup-guide.md)
- [Safe cleanup methods](./08-cleanup-guide.md#safe-cleanup-methods-via-ipc)
- [Advanced SQL cleanup](./08-cleanup-guide.md#advanced-cleanup-methods-sql)
- [Nuclear reset](./08-cleanup-guide.md#nuclear-cleanup-complete-reset)
- [VACUUM databases](./08-cleanup-guide.md#vacuum-database-reclaim-disk-space)
- [Rebuild indices](./08-cleanup-guide.md#rebuild-hnsw-indices)

### Troubleshooting
- [Common issues](./SUMMARY.md#troubleshooting)
- [Database locked](./08-cleanup-guide.md#issue-database-is-locked)
- [Cleanup doesn't free space](./08-cleanup-guide.md#issue-cleanup-doesnt-free-disk-space)
- [Index corruption](./02-storage-locations.md#troubleshooting-storage-issues)

---

## 📋 Documentation Roadmap

### ✅ Completed Documentation

1. ✅ README.md - Main entry point
2. ✅ SUMMARY.md - Executive summary
3. ✅ 01-architecture-overview.md - System design
4. ✅ 02-storage-locations.md - File locations
5. ✅ 03-key-files-reference.md - Code files
6. ✅ 08-cleanup-guide.md - Cleanup procedures
7. ✅ INDEX.md - This file

### 📝 Future Documentation (Can be added as needed)

- **04-database-schemas.md** - Detailed SQL schemas
- **05-memory-flows.md** - Step-by-step data flows
- **06-embedding-system.md** - Embedding generation deep dive
- **07-ipc-handlers.md** - Complete IPC reference
- **09-vector-indices.md** - HNSW index internals
- **10-performance-optimization.md** - Performance tuning
- **11-migration-guide.md** - Version upgrades
- **12-developer-guide.md** - Contributing to memory system

---

## 🚀 Getting Started

### New to Alice Memory System?

1. **Start with:** [SUMMARY.md](./SUMMARY.md) - Get a quick overview
2. **Understand architecture:** [01-architecture-overview.md](./01-architecture-overview.md)
3. **Find files:** [02-storage-locations.md](./02-storage-locations.md)
4. **Learn cleanup:** [08-cleanup-guide.md](./08-cleanup-guide.md)

### Looking for Specific Information?

- **Where is my data?** → [Storage Locations](./02-storage-locations.md)
- **How do I clean memory?** → [Cleanup Guide](./08-cleanup-guide.md)
- **What does this file do?** → [Key Files Reference](./03-key-files-reference.md)
- **How does it work?** → [Architecture Overview](./01-architecture-overview.md)
- **Quick reference?** → [SUMMARY.md](./SUMMARY.md)

### Contributing or Developing?

- **Code files:** [Key Files Reference](./03-key-files-reference.md)
- **Architecture:** [Architecture Overview](./01-architecture-overview.md)
- **IPC API:** [SUMMARY.md - IPC API Reference](./SUMMARY.md#ipc-api-reference)
- **Database schemas:** [Key Files Reference](./03-key-files-reference.md)

---

## 📞 Additional Resources

- [Main Project README](../../README.md)
- [Setup Instructions](../setupInstructions.md)
- [Security Analysis](../../CLAUDE.md)
- [Custom Tools Guide](../custom-tools.md)
- [Custom Avatars Guide](../custom-avatars.md)

---

## 🔄 Document Version

**Documentation Version:** 1.0
**Last Updated:** 2026-01-11
**Alice Version:** 1.3.0+
**Maintained By:** Project contributors

---

**Need help?** Open an issue on [GitHub](https://github.com/pmbstyle/alice/issues) or check the documentation files above.
