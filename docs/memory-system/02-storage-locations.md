# Memory Storage Locations

## Overview

All Alice memory data is stored **locally** on your machine. No data is transmitted to external servers (except when using cloud-based embedding providers like OpenAI, which only receive the text to embed).

## Primary Storage Directory

### Platform-Specific Paths

| Platform | Path |
|----------|------|
| **Windows** | `%APPDATA%\alice-ai-app\` |
| | Example: `C:\Users\YourName\AppData\Roaming\alice-ai-app\` |
| **Linux** | `~/.config/alice-ai-app/` |
| | Example: `/home/yourname/.config/alice-ai-app/` |
| **macOS** | `~/Library/Application Support/alice-ai-app/` |
| | Example: `/Users/yourname/Library/Application Support/alice-ai-app/` |

### How to Find Your Storage Directory

**Windows:**
1. Press `Win + R`
2. Type `%APPDATA%\alice-ai-app`
3. Press Enter

**Linux/macOS:**
```bash
cd ~/.config/alice-ai-app  # Linux
cd ~/Library/Application\ Support/alice-ai-app  # macOS
ls -lah
```

**From Node.js/Electron:**
```javascript
const { app } = require('electron')
const storagePath = app.getPath('userData')
console.log(storagePath)
```

## File Inventory

### Memory Database Files

| File Name | Purpose | Size (Typical) | Can Delete? |
|-----------|---------|----------------|-------------|
| `alice-thoughts.sqlite` | Short-term thoughts + Long-term memories | 10-100 MB | Yes, but loses all history |
| `alice-thoughts.sqlite-wal` | Write-Ahead Log (temporary) | 0-10 MB | No, managed by SQLite |
| `alice-thoughts.sqlite-shm` | Shared memory (temporary) | ~32 KB | No, managed by SQLite |
| `alice-rag.sqlite` | Document index database | 50-500 MB | Yes, but loses document index |
| `alice-rag.sqlite-wal` | Write-Ahead Log (temporary) | 0-50 MB | No, managed by SQLite |
| `alice-rag.sqlite-shm` | Shared memory (temporary) | ~32 KB | No, managed by SQLite |

### Vector Index Files

| File Name | Purpose | Size (Typical) | Can Delete? |
|-----------|---------|----------------|-------------|
| `alice-thoughts-hnsw-openai.index` | OpenAI embeddings index (1536-dim) | 10-100 MB | Yes, will rebuild on restart |
| `alice-thoughts-hnsw-local.index` | Local embeddings index (384-dim) | 2-20 MB | Yes, will rebuild on restart |
| `alice-rag-hnsw-local.index` | RAG document embeddings (384-dim) | 20-200 MB | Yes, will rebuild on restart |
| `alice-rag-hnsw-local.meta.json` | RAG index metadata | <1 KB | Yes, will recreate on rebuild |

### Legacy/Migration Files

| File Name | Purpose | Size (Typical) | Can Delete? |
|-----------|---------|----------------|-------------|
| `alice-memories.json` | Legacy memory storage (pre-v1.3.0) | 1-10 MB | No, but may be auto-migrated |
| `alice-memories.json.migrated` | Backup of migrated file | 1-10 MB | Yes, safe to delete |

### Settings & Configuration

| File Name | Purpose | Size (Typical) | Can Delete? |
|-----------|---------|----------------|-------------|
| `alice-settings.json` | App settings, API keys, permissions | 10-100 KB | No, contains important config |
| `google-calendar-tokens.json` | Google OAuth tokens | <1 KB | Yes, will re-authenticate |
| `network-state.json` | Network status cache | <1 KB | Yes, will recreate |

### Other Data

| Directory/File | Purpose | Size (Typical) | Can Delete? |
|----------------|---------|----------------|-------------|
| `generated_images/` | AI-generated images | 10-100 MB | Yes, but loses image history |
| `logs/` | Application logs | 1-50 MB | Yes, for debugging only |

## Database Details

### alice-thoughts.sqlite

**Tables:**
- `thoughts` - Conversation messages with embeddings
- `long_term_memories` - User-created persistent memories
- `conversation_summaries` - Compressed conversation history
- `migration_flags` - Tracks completed migrations

**Size Growth:**
- ~2 KB per conversation message
- ~2 KB per long-term memory
- Grows linearly with usage
- Automatic summarization helps manage size

**Location in Code:**
```typescript
// electron/main/thoughtVectorStore.ts:27-28
const userDataPath = app.getPath('userData')
const dbPath = path.join(userDataPath, 'alice-thoughts.sqlite')
```

### alice-rag.sqlite

**Tables:**
- `rag_documents` - Indexed document metadata
- `rag_chunks` - Text chunks from documents
- `rag_chunks_fts` - Full-text search index (virtual table)
- `migration_flags` - Tracks completed migrations

**Size Growth:**
- ~1 KB per document chunk
- Typical document: 50-200 chunks
- 1000 documents ≈ 50-200 MB

**Location in Code:**
```typescript
// electron/main/ragDocumentStore.ts:38-39
const userDataPath = app.getPath('userData')
const ragDbPath = path.join(userDataPath, 'alice-rag.sqlite')
```

## Storage Quotas & Limits

### Practical Limits

| Memory Type | Soft Limit | Hard Limit | Limit Reason |
|-------------|------------|------------|--------------|
| Thoughts | 10,000 msgs | ~100,000 msgs | HNSW index capacity |
| Long-term memories | 1,000 | ~100,000 | Database size |
| RAG chunks | 50,000 | 200,000 | HNSW index capacity |
| Generated images | 1,000 | Unlimited | Disk space |

### Disk Space Requirements

**Minimal Usage:**
- Databases: ~20 MB
- Indices: ~5 MB
- Total: **~25 MB**

**Typical Usage (1 year):**
- Databases: ~200 MB
- Indices: ~50 MB
- Images: ~50 MB
- Total: **~300 MB**

**Heavy Usage:**
- Databases: ~1 GB
- Indices: ~200 MB
- Images: ~200 MB
- Total: **~1.4 GB**

## Backup & Migration

### Manual Backup

**Backup All Memory Data:**
```bash
# Windows (PowerShell)
Copy-Item -Recurse "%APPDATA%\alice-ai-app" "C:\Backup\alice-backup-$(Get-Date -Format 'yyyy-MM-dd')"

# Linux/macOS
cp -r ~/.config/alice-ai-app ~/backups/alice-backup-$(date +%Y-%m-%d)
```

**Backup Only Essential Files:**
```bash
# Files to backup for complete memory preservation:
alice-thoughts.sqlite
alice-rag.sqlite
alice-settings.json
alice-thoughts-hnsw-openai.index
alice-thoughts-hnsw-local.index
alice-rag-hnsw-local.index
alice-rag-hnsw-local.meta.json
```

### Restore from Backup

1. Close Alice application completely
2. Navigate to storage directory
3. Copy backed-up files to storage directory
4. Restart Alice

**Important:** Ensure Alice is **completely closed** before restoring files, or database corruption may occur.

### Migrate to New Machine

**Export (Old Machine):**
1. Close Alice
2. Copy entire `alice-ai-app` directory
3. Transfer via USB, cloud, or network

**Import (New Machine):**
1. Install Alice on new machine
2. Close Alice (if it auto-started)
3. Replace `alice-ai-app` directory with copied one
4. Start Alice

## Cleaning & Maintenance

### Safe Cleanup Operations

**Clear Conversation History (Keep Long-Term Memories):**
```javascript
// Via IPC in renderer process
await window.electron.ipcRenderer.invoke('thoughtVector:delete-all')
```

**Clear Long-Term Memories (Keep Conversation History):**
```javascript
// Via IPC in renderer process
await window.electron.ipcRenderer.invoke('memory:delete-all')
```

**Clear RAG Documents:**
```javascript
// Via IPC in renderer process
await window.electron.ipcRenderer.invoke('rag:clear')
```

**Remove Old Generated Images:**
```bash
# Navigate to storage directory, then:
cd generated_images
# Delete images older than 30 days (Windows PowerShell)
Get-ChildItem | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-30)} | Remove-Item

# Linux/macOS
find generated_images -type f -mtime +30 -delete
```

### Nuclear Cleanup (Reset All Memory)

**WARNING:** This deletes ALL memory data permanently. There is no undo.

1. **Close Alice completely**
2. **Navigate to storage directory**
3. **Delete files:**
   ```bash
   # Windows (PowerShell)
   Remove-Item alice-thoughts.sqlite*
   Remove-Item alice-rag.sqlite*
   Remove-Item alice-*-hnsw-*.index
   Remove-Item alice-*-hnsw-*.meta.json

   # Linux/macOS
   rm alice-thoughts.sqlite*
   rm alice-rag.sqlite*
   rm alice-*-hnsw-*.index
   rm alice-*-hnsw-*.meta.json
   ```
4. **Restart Alice** (databases will be recreated empty)

### Partial Cleanup Strategies

**Keep Long-Term Memories, Clear Conversations:**
- Delete: `alice-thoughts-hnsw-*.index`
- Run: `thoughtVector:delete-all` via IPC
- Keeps: `long_term_memories` table intact

**Keep Conversations, Clear Documents:**
- Delete: `alice-rag.sqlite*`, `alice-rag-hnsw-*.index`
- Restart Alice (will recreate empty RAG database)

**Clear Old Conversation Summaries:**
```sql
-- Connect to alice-thoughts.sqlite via sqlite3 CLI
DELETE FROM conversation_summaries WHERE created_at < date('now', '-30 days');
VACUUM;  -- Reclaim disk space
```

## Monitoring Storage Usage

### Check Database Sizes

**Windows (PowerShell):**
```powershell
cd $env:APPDATA\alice-ai-app
Get-ChildItem | Select-Object Name, @{Name="Size (MB)";Expression={[math]::Round($_.Length / 1MB, 2)}}
```

**Linux/macOS:**
```bash
cd ~/.config/alice-ai-app
du -h alice-*.sqlite alice-*.index
```

### Query Record Counts

**Using SQLite CLI:**
```bash
# Install sqlite3 if needed
sqlite3 alice-thoughts.sqlite

# Check counts
SELECT COUNT(*) FROM thoughts;
SELECT COUNT(*) FROM long_term_memories;
SELECT COUNT(*) FROM conversation_summaries;

# Check size
SELECT page_count * page_size / 1024 / 1024 AS size_mb FROM pragma_page_count(), pragma_page_size();
```

**Via Node.js/Electron:**
```javascript
const Database = require('better-sqlite3')
const db = new Database('alice-thoughts.sqlite')

console.log('Thoughts:', db.prepare('SELECT COUNT(*) FROM thoughts').pluck().get())
console.log('Memories:', db.prepare('SELECT COUNT(*) FROM long_term_memories').pluck().get())
```

## Security Considerations

### File Permissions

**Default Permissions (Windows):**
- Owner: Full control
- System: Full control
- Administrators: Full control

**Default Permissions (Linux/macOS):**
- Owner: `rwx------` (700 for directories)
- Owner: `rw-------` (600 for files)

### Sensitive Data

**Files containing sensitive data:**
1. `alice-settings.json` - Contains API keys, OAuth tokens
2. `google-calendar-tokens.json` - OAuth refresh tokens
3. `alice-thoughts.sqlite` - Conversation history (may contain personal info)
4. `alice-rag.sqlite` - Indexed document content

**Recommendations:**
- Never commit storage directory to version control
- Exclude from cloud backup if concerned about privacy
- Encrypt storage directory if storing highly sensitive data
- Use local embeddings instead of OpenAI for complete privacy

### Data Leakage Risks

**Low Risk:**
- Vector embeddings (not reversible to original text)
- HNSW indices (numerical data only)

**High Risk:**
- SQLite databases (contain plaintext data)
- Settings files (contain API keys)

**Mitigation:**
- Use full-disk encryption (BitLocker, FileVault, LUKS)
- Secure delete when removing files (`shred` on Linux, `sdelete` on Windows)

## Troubleshooting Storage Issues

### Issue: "Database is locked"

**Cause:** Another process is accessing the database

**Solution:**
1. Close all Alice windows
2. Check Task Manager/Activity Monitor for stray processes
3. Wait 10 seconds, restart Alice

### Issue: "Database disk image is malformed"

**Cause:** Database corruption (crash, power loss)

**Solution:**
```bash
# Attempt recovery
sqlite3 alice-thoughts.sqlite ".recover" | sqlite3 alice-thoughts-recovered.sqlite

# If recovery fails, delete and let Alice recreate:
rm alice-thoughts.sqlite*
```

### Issue: HNSW index size mismatch

**Symptom:** Warning logs about index rebuild

**Solution:** Automatic - Alice will rebuild index on next startup

### Issue: Running out of disk space

**Solution:**
1. Clear old conversation history
2. Remove unused RAG documents
3. Delete old generated images
4. Run `VACUUM` on SQLite databases to reclaim space

## Code References

### Storage Path Initialization

**Electron Main Process:**
```typescript
// electron/main/index.ts
import { app } from 'electron'
const userDataPath = app.getPath('userData')
// Result: C:\Users\YourName\AppData\Roaming\alice-ai-app (Windows)
```

**Thought Vector Store:**
```typescript
// electron/main/thoughtVectorStore.ts:27-30
const userDataPath = app.getPath('userData')
const dbPath = path.join(userDataPath, 'alice-thoughts.sqlite')
const hnswIndexOpenAI = path.join(userDataPath, 'alice-thoughts-hnsw-openai.index')
const hnswIndexLocal = path.join(userDataPath, 'alice-thoughts-hnsw-local.index')
```

**RAG Document Store:**
```typescript
// electron/main/ragDocumentStore.ts:38-41
const userDataPath = app.getPath('userData')
const ragDbPath = path.join(userDataPath, 'alice-rag.sqlite')
const ragHnswIndexPath = path.join(userDataPath, 'alice-rag-hnsw-local.index')
const ragHnswMetaPath = path.join(userDataPath, 'alice-rag-hnsw-local.meta.json')
```

---

[← Back: Architecture Overview](./01-architecture-overview.md) | [Back to Index](./README.md) | [Next: Key Files Reference →](./03-key-files-reference.md)
