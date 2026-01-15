# Memory Cleanup & Modification Guide

## Overview

This guide provides practical instructions for cleaning, modifying, and managing Alice's memory system. All operations can be performed safely while preserving data integrity.

## Quick Cleanup Reference

| What to Clean | Method | Data Loss | Reversible? |
|---------------|--------|-----------|-------------|
| Conversation history | IPC call | All conversations | No |
| Long-term memories | IPC call or UI | All memories | No |
| RAG documents | IPC call or UI | All indexed docs | No |
| Single memory | UI or IPC | One memory | No |
| Single RAG document | UI or IPC | One document | No |
| Generated images | File deletion | Images only | No |
| Old summaries | SQL query | Old summaries | No |
| Everything | File deletion | All memory | No |

## Safe Cleanup Methods (Via IPC)

### 1. Clear All Conversation History

**What it does:**
- Deletes all conversation messages from `thoughts` table
- Clears both OpenAI and Local HNSW indices
- Reinitializes indices with fresh capacity
- **Preserves:** Long-term memories, RAG documents, settings

**How to do it:**

**Via Developer Console (Renderer Process):**
```javascript
await window.electron.ipcRenderer.invoke('thoughtVector:delete-all')
```

**Via Main Process:**
```javascript
const { ipcMain } = require('electron')
const { deleteAllThoughtVectors } = require('./electron/main/thoughtVectorStore')

// Trigger manually
await deleteAllThoughtVectors()
```

**Success Response:**
```javascript
{ success: true }
```

**Code Location:** [thoughtVectorStore.ts:826-852](../../electron/main/thoughtVectorStore.ts)

---

### 2. Clear All Long-Term Memories

**What it does:**
- Deletes all records from `long_term_memories` table
- Removes embeddings for all memories
- **Preserves:** Conversation history, RAG documents, settings

**How to do it:**

**Via Developer Console:**
```javascript
await window.electron.ipcRenderer.invoke('memory:delete-all')
```

**Via Main Process:**
```javascript
const { deleteAllMemoriesLocal } = require('./electron/main/memoryManager')

await deleteAllMemoriesLocal()
```

**Success Response:**
```javascript
{ success: true }
```

**Code Location:** [memoryManager.ts:314-329](../../electron/main/memoryManager.ts)

---

### 3. Clear All RAG Documents

**What it does:**
- Deletes all documents from `rag_documents` table
- Deletes all chunks from `rag_chunks` table
- Clears full-text search index
- Reinitializes empty HNSW index
- **Preserves:** Conversation history, long-term memories, settings

**How to do it:**

**Via Developer Console:**
```javascript
await window.electron.ipcRenderer.invoke('rag:clear')
```

**Via Main Process:**
```javascript
const { clearRag } = require('./electron/main/ragDocumentStore')

await clearRag()
```

**Success Response:**
```javascript
{ success: true }
```

**Code Location:** [ragDocumentStore.ts:1211-1232](../../electron/main/ragDocumentStore.ts)

---

### 4. Delete Single Memory

**What it does:**
- Deletes one specific memory by ID
- Removes associated embeddings
- **Preserves:** All other data

**How to do it:**

**Via Developer Console:**
```javascript
const memoryId = 'memory-id-here'
await window.electron.ipcRenderer.invoke('memory:delete', { id: memoryId })
```

**Via Memory Manager UI:**
1. Open Settings → Memory Manager
2. Find the memory to delete
3. Click "Delete" button
4. Confirm deletion

**Success Response:**
```javascript
{ success: true }
```

**Code Location:** [memoryManager.ts:288-303](../../electron/main/memoryManager.ts)

---

### 5. Remove Specific RAG Documents

**What it does:**
- Removes documents matching specified paths
- Deletes associated chunks and embeddings
- Rebuilds HNSW index (if needed)
- **Preserves:** Other indexed documents

**How to do it:**

**Via Developer Console:**
```javascript
const pathsToRemove = ['/path/to/document.pdf', '/path/to/folder/']
await window.electron.ipcRenderer.invoke('rag:remove-paths', { paths: pathsToRemove })
```

**Via RAG Dialog UI:**
1. Open RAG settings/dialog
2. Select documents to remove
3. Click "Remove" button
4. Confirm removal

**Success Response:**
```javascript
{
  success: true,
  data: {
    removed: 5  // Number of documents removed
  }
}
```

**Code Location:** [ragDocumentStore.ts:1175-1199](../../electron/main/ragDocumentStore.ts)

---

## Advanced Cleanup Methods (SQL)

### Prerequisites

**Install SQLite CLI:**
```bash
# Windows (via Chocolatey)
choco install sqlite

# Linux
sudo apt install sqlite3  # Debian/Ubuntu
sudo dnf install sqlite   # Fedora/RHEL

# macOS
brew install sqlite3
```

**Navigate to storage directory:**
```bash
# Windows
cd %APPDATA%\alice-ai-app

# Linux
cd ~/.config/alice-ai-app

# macOS
cd ~/Library/Application\ Support/alice-ai-app
```

**IMPORTANT:** Close Alice application before running SQL commands directly.

---

### 6. Delete Old Conversation Summaries

**What it does:**
- Removes conversation summaries older than specified date
- Frees up database space
- **Preserves:** All other data

**How to do it:**

```sql
-- Open database
sqlite3 alice-thoughts.sqlite

-- Delete summaries older than 30 days
DELETE FROM conversation_summaries
WHERE created_at < date('now', '-30 days');

-- Check how many were deleted
SELECT changes();

-- Reclaim disk space
VACUUM;

-- Exit
.quit
```

**Custom date ranges:**
```sql
-- Delete summaries older than 7 days
DELETE FROM conversation_summaries WHERE created_at < date('now', '-7 days');

-- Delete summaries older than specific date
DELETE FROM conversation_summaries WHERE created_at < '2026-01-01';

-- Delete all summaries (careful!)
DELETE FROM conversation_summaries;
```

---

### 7. Delete Thoughts from Specific Conversation

**What it does:**
- Removes all messages from one conversation
- **Preserves:** Other conversations, memories, RAG

**How to do it:**

```sql
-- Open database
sqlite3 alice-thoughts.sqlite

-- List conversations with counts
SELECT conversation_id, COUNT(*) as message_count
FROM thoughts
GROUP BY conversation_id
ORDER BY message_count DESC;

-- Delete specific conversation
DELETE FROM thoughts WHERE conversation_id = 'conversation-id-here';

-- Reclaim space
VACUUM;
```

**Note:** HNSW index will have stale entries until next rebuild. This is harmless but may return deleted results in searches until Alice is restarted.

---

### 8. Delete Memories by Type

**What it does:**
- Removes memories of specific type (personal, work, etc.)
- **Preserves:** Memories of other types

**How to do it:**

```sql
-- Open database
sqlite3 alice-thoughts.sqlite

-- List memory types with counts
SELECT memory_type, COUNT(*) as count
FROM long_term_memories
GROUP BY memory_type;

-- Delete memories of specific type
DELETE FROM long_term_memories WHERE memory_type = 'work';

-- Delete memories without type
DELETE FROM long_term_memories WHERE memory_type IS NULL;

-- Reclaim space
VACUUM;
```

---

### 9. Delete RAG Chunks from Specific Document

**What it does:**
- Removes chunks from one document
- Keeps document entry (for tracking)
- **Preserves:** Other documents

**How to do it:**

```sql
-- Open database
sqlite3 alice-rag.sqlite

-- List documents with chunk counts
SELECT d.path, COUNT(c.id) as chunk_count
FROM rag_documents d
LEFT JOIN rag_chunks c ON d.id = c.doc_id
GROUP BY d.id
ORDER BY chunk_count DESC;

-- Get document ID
SELECT id FROM rag_documents WHERE path LIKE '%filename%';

-- Delete chunks for specific document
DELETE FROM rag_chunks WHERE doc_id = 'document-id-here';

-- Also delete document entry
DELETE FROM rag_documents WHERE id = 'document-id-here';

-- Reclaim space
VACUUM;
```

---

## Nuclear Cleanup (Complete Reset)

### 10. Delete ALL Memory Data

**⚠️ WARNING:** This permanently deletes ALL memory data. Cannot be undone.

**What it does:**
- Deletes all databases
- Deletes all HNSW indices
- Deletes all metadata
- **Preserves:** Settings, API keys, OAuth tokens

**How to do it:**

**Step 1: Close Alice completely**
- Quit application
- Check Task Manager/Activity Monitor for stray processes
- Kill any remaining `alice` or `electron` processes

**Step 2: Delete memory files**

```bash
# Windows (PowerShell)
cd $env:APPDATA\alice-ai-app
Remove-Item alice-thoughts.sqlite*
Remove-Item alice-rag.sqlite*
Remove-Item alice-*-hnsw-*.index
Remove-Item alice-*-hnsw-*.meta.json

# Linux/macOS
cd ~/.config/alice-ai-app  # or ~/Library/Application Support/alice-ai-app on macOS
rm alice-thoughts.sqlite*
rm alice-rag.sqlite*
rm alice-*-hnsw-*.index
rm alice-*-hnsw-*.meta.json
```

**Step 3: Restart Alice**
- Databases will be recreated empty
- Indices will be initialized fresh
- All memory is now blank

---

### 11. Complete Factory Reset

**⚠️ WARNING:** This resets Alice to factory defaults. All data and settings lost.

**What it does:**
- Deletes ALL data (memory + settings + API keys)
- Complete fresh start

**How to do it:**

**Step 1: Close Alice**

**Step 2: Delete entire data directory**

```bash
# Windows (PowerShell)
Remove-Item -Recurse -Force $env:APPDATA\alice-ai-app

# Linux
rm -rf ~/.config/alice-ai-app

# macOS
rm -rf ~/Library/Application\ Support/alice-ai-app
```

**Step 3: Restart Alice**
- Will run first-time setup
- Configure API keys, settings from scratch

---

## Selective Cleanup Strategies

### Strategy 1: Keep Long-Term Memories, Clear Conversations

**Use case:** Free up space while preserving important facts

**Steps:**
1. Backup memories (optional):
   ```sql
   sqlite3 alice-thoughts.sqlite
   .output memories-backup.sql
   .dump long_term_memories
   .quit
   ```
2. Clear conversations:
   ```javascript
   await window.electron.ipcRenderer.invoke('thoughtVector:delete-all')
   ```
3. Verify memories intact:
   ```sql
   sqlite3 alice-thoughts.sqlite "SELECT COUNT(*) FROM long_term_memories;"
   ```

---

### Strategy 2: Keep Recent History, Delete Old

**Use case:** Retain last 30 days of conversations

**Steps:**
1. Close Alice
2. Run SQL:
   ```sql
   sqlite3 alice-thoughts.sqlite
   DELETE FROM thoughts WHERE created_at < date('now', '-30 days');
   VACUUM;
   .quit
   ```
3. Restart Alice (will rebuild indices)

---

### Strategy 3: Clear Everything Except Settings

**Use case:** Fresh start without reconfiguring

**Steps:**
1. Close Alice
2. Delete memory files (not settings):
   ```bash
   # Keep: alice-settings.json, google-calendar-tokens.json
   # Delete: Everything else
   rm alice-thoughts.sqlite*
   rm alice-rag.sqlite*
   rm alice-*.index
   rm alice-*.meta.json
   ```
3. Restart Alice

---

## Maintenance Operations

### Vacuum Database (Reclaim Disk Space)

**When to run:**
- After large deletions
- Database size hasn't decreased after deletions
- Periodic maintenance (monthly)

**How to do it:**

```sql
-- Close Alice first!
sqlite3 alice-thoughts.sqlite "VACUUM;"
sqlite3 alice-rag.sqlite "VACUUM;"
```

**Effect:** Rebuilds database file, removes fragmentation, reclaims deleted space.

---

### Rebuild HNSW Indices

**When to run:**
- After manual SQL deletions
- Index corruption suspected
- Index size mismatch warnings

**How to do it:**

**Option 1: Automatic (on restart)**
1. Delete index files
2. Restart Alice
3. Indices rebuild automatically from database

**Option 2: Manual rebuild**
```javascript
// Via developer console
await window.electron.ipcRenderer.invoke('thoughtVector:rebuild-index')
await window.electron.ipcRenderer.invoke('rag:rebuild-index')
```

**Note:** Full rebuild functions are not exposed by default. Use Option 1.

---

### Optimize RAG Full-Text Search

**When to run:**
- Slow keyword searches
- After many document additions/deletions

**How to do it:**

```sql
sqlite3 alice-rag.sqlite
INSERT INTO rag_chunks_fts(rag_chunks_fts) VALUES('optimize');
.quit
```

---

## Monitoring & Verification

### Check Memory Usage

**Via SQL:**
```sql
-- Thoughts count
sqlite3 alice-thoughts.sqlite "SELECT COUNT(*) FROM thoughts;"

-- Memories count
sqlite3 alice-thoughts.sqlite "SELECT COUNT(*) FROM long_term_memories;"

-- RAG documents count
sqlite3 alice-rag.sqlite "SELECT COUNT(*) FROM rag_documents;"

-- RAG chunks count
sqlite3 alice-rag.sqlite "SELECT COUNT(*) FROM rag_chunks;"

-- Database size
sqlite3 alice-thoughts.sqlite "SELECT page_count * page_size / 1024 / 1024 AS size_mb FROM pragma_page_count(), pragma_page_size();"
```

**Via File System:**
```bash
# Windows (PowerShell)
cd $env:APPDATA\alice-ai-app
Get-ChildItem alice-*.sqlite | Select-Object Name, @{Name="Size (MB)";Expression={[math]::Round($_.Length / 1MB, 2)}}

# Linux/macOS
du -h alice-*.sqlite alice-*.index
```

---

### Verify Cleanup Success

**After deletion, check counts:**
```javascript
// Thoughts should be 0
const thoughtCount = await window.electron.ipcRenderer.invoke('thoughtVector:count')
console.log('Thoughts:', thoughtCount)

// Memories should be 0
const memories = await window.electron.ipcRenderer.invoke('memory:get', { limit: 1 })
console.log('Memories:', memories.data.length)

// RAG should be 0
const ragStats = await window.electron.ipcRenderer.invoke('rag:stats')
console.log('RAG:', ragStats.data)
```

---

## Automation Scripts

### Scheduled Cleanup (Windows Task Scheduler)

**Create PowerShell script (`cleanup-alice.ps1`):**
```powershell
# Close Alice
Stop-Process -Name "alice" -Force -ErrorAction SilentlyContinue

# Wait for shutdown
Start-Sleep -Seconds 5

# Navigate to data directory
cd $env:APPDATA\alice-ai-app

# Delete old summaries (30+ days)
sqlite3 alice-thoughts.sqlite "DELETE FROM conversation_summaries WHERE created_at < date('now', '-30 days'); VACUUM;"

# Delete old generated images (90+ days)
Get-ChildItem generated_images | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-90)} | Remove-Item

Write-Host "Cleanup complete!"
```

**Schedule task:**
1. Open Task Scheduler
2. Create Basic Task → "Alice Cleanup"
3. Trigger: Weekly (Sunday 2 AM)
4. Action: Start Program → `powershell.exe -File "C:\path\to\cleanup-alice.ps1"`

---

### Scheduled Cleanup (Linux/macOS Cron)

**Create bash script (`cleanup-alice.sh`):**
```bash
#!/bin/bash

# Close Alice
pkill -f alice

# Wait for shutdown
sleep 5

# Navigate to data directory
cd ~/.config/alice-ai-app  # or ~/Library/Application Support/alice-ai-app on macOS

# Delete old summaries
sqlite3 alice-thoughts.sqlite "DELETE FROM conversation_summaries WHERE created_at < date('now', '-30 days'); VACUUM;"

# Delete old generated images
find generated_images -type f -mtime +90 -delete

echo "Cleanup complete!"
```

**Schedule cron job:**
```bash
# Edit crontab
crontab -e

# Add line (runs every Sunday at 2 AM)
0 2 * * 0 /home/youruser/scripts/cleanup-alice.sh
```

---

## Troubleshooting

### Issue: "Database is locked"

**Cause:** Alice or another process is using the database

**Solution:**
1. Close Alice completely
2. Check for stray processes: `tasklist | findstr alice` (Windows) or `ps aux | grep alice` (Linux/macOS)
3. Kill stray processes
4. Wait 10 seconds
5. Retry cleanup operation

---

### Issue: Cleanup doesn't free disk space

**Cause:** SQLite doesn't auto-reclaim space after DELETE

**Solution:**
```sql
sqlite3 alice-thoughts.sqlite "VACUUM;"
sqlite3 alice-rag.sqlite "VACUUM;"
```

---

### Issue: Memory appears after deletion

**Cause:** Index rebuild or cached data

**Solution:**
1. Close Alice
2. Delete index files
3. Restart Alice (indices rebuild from database)

---

### Issue: Cannot delete memory via UI

**Cause:** IPC handler error or database lock

**Solution:**
1. Check developer console for errors
2. Try via IPC directly (see method above)
3. If persists, use SQL direct deletion

---

## Safety Checklist

Before performing cleanup operations:

- [ ] **Backup important data** (if needed)
- [ ] **Close Alice application completely**
- [ ] **Verify no background processes running**
- [ ] **Understand what will be deleted** (irreversible!)
- [ ] **Test on small dataset first** (if using SQL)
- [ ] **Have backup of alice-settings.json** (contains API keys)

After cleanup:

- [ ] **Verify expected data is gone**
- [ ] **Verify expected data is still present**
- [ ] **Restart Alice and test functionality**
- [ ] **Check logs for errors**

---

## Code References

| Operation | File | Function |
|-----------|------|----------|
| Delete all thoughts | [thoughtVectorStore.ts:826](../../electron/main/thoughtVectorStore.ts) | `deleteAllThoughtVectors()` |
| Delete all memories | [memoryManager.ts:314](../../electron/main/memoryManager.ts) | `deleteAllMemoriesLocal()` |
| Delete one memory | [memoryManager.ts:288](../../electron/main/memoryManager.ts) | `deleteMemoryLocal()` |
| Clear RAG | [ragDocumentStore.ts:1211](../../electron/main/ragDocumentStore.ts) | `clearRag()` |
| Remove RAG paths | [ragDocumentStore.ts:1175](../../electron/main/ragDocumentStore.ts) | `removeRagPaths()` |
| IPC handlers | [ipcManager.ts:130-418](../../electron/main/ipcManager.ts) | Various handlers |

---

[← Back: IPC Handlers](./07-ipc-handlers.md) | [Back to Index](./README.md) | [Next: Vector Indices →](./09-vector-indices.md)
