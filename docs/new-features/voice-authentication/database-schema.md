# Voice Authentication Database Schema

## Overview

The voice authentication system uses 3 new SQLite tables integrated into Alice's existing database (`alice-thoughts.sqlite`).

## Table Definitions

### 1. voice_profiles

Stores enrolled user voice profiles with their embeddings.

```sql
CREATE TABLE voice_profiles (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  voice_embedding BLOB NOT NULL,
  enrollment_samples_count INTEGER NOT NULL DEFAULT 0,
  enrollment_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_verified_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  verification_threshold REAL NOT NULL DEFAULT 0.70,
  notes TEXT
);

CREATE INDEX idx_voice_profiles_active ON voice_profiles(is_active);
CREATE INDEX idx_voice_profiles_username ON voice_profiles(username);
```

**Columns:**
- `user_id` (TEXT, PRIMARY KEY): UUID v4 identifier
- `username` (TEXT, UNIQUE, NOT NULL): Display name (e.g., "John Doe")
- `voice_embedding` (BLOB, NOT NULL): 192-dimensional float32 array (768 bytes)
- `enrollment_samples_count` (INTEGER): Number of samples collected (typically 5)
- `enrollment_completed` (INTEGER): Boolean flag (0=incomplete, 1=complete)
- `created_at` (TEXT, NOT NULL): ISO 8601 timestamp
- `last_verified_at` (TEXT): ISO 8601 timestamp of last successful verification
- `is_active` (INTEGER): Boolean flag for soft delete (0=deleted, 1=active)
- `verification_threshold` (REAL): Per-user threshold (0.60-0.90)
- `notes` (TEXT): Optional user notes

**Embedding Format:**
- Type: `[]float32` (Go) / `Float32Array` (JavaScript)
- Dimensions: 192
- Size: 192 × 4 bytes = 768 bytes
- Encoding: Little-endian binary blob

**Example Row:**
```
user_id: 550e8400-e29b-41d4-a716-446655440000
username: John Doe
voice_embedding: [binary blob, 768 bytes]
enrollment_samples_count: 5
enrollment_completed: 1
created_at: 2026-01-11T12:00:00Z
last_verified_at: 2026-01-11T14:30:00Z
is_active: 1
verification_threshold: 0.70
notes: NULL
```

---

### 2. voice_enrollment_samples

Stores individual samples collected during enrollment for quality analysis and potential re-enrollment.

```sql
CREATE TABLE voice_enrollment_samples (
  sample_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sample_embedding BLOB NOT NULL,
  recorded_at TEXT NOT NULL,
  quality_score REAL,
  duration_ms INTEGER,
  FOREIGN KEY(user_id) REFERENCES voice_profiles(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_enrollment_samples_user ON voice_enrollment_samples(user_id);
CREATE INDEX idx_enrollment_samples_recorded ON voice_enrollment_samples(recorded_at);
```

**Columns:**
- `sample_id` (TEXT, PRIMARY KEY): UUID v4 identifier for this sample
- `user_id` (TEXT, FOREIGN KEY): References voice_profiles.user_id
- `sample_embedding` (BLOB, NOT NULL): 192-dim embedding for this specific sample
- `recorded_at` (TEXT, NOT NULL): ISO 8601 timestamp when sample was recorded
- `quality_score` (REAL): Quality metric (0.0-1.0), higher is better
- `duration_ms` (INTEGER): Audio duration in milliseconds

**Quality Score Calculation:**
- Based on audio signal-to-noise ratio
- Based on embedding consistency with other samples
- Based on audio length appropriateness
- Range: 0.0 (poor) to 1.0 (excellent)

**Example Row:**
```
sample_id: sample-uuid-001
user_id: 550e8400-e29b-41d4-a716-446655440000
sample_embedding: [binary blob, 768 bytes]
recorded_at: 2026-01-11T12:01:23Z
quality_score: 0.85
duration_ms: 3500
```

**Cascade Delete:** When a voice profile is deleted, all associated samples are automatically deleted.

---

### 3. voice_verification_logs

Audit trail for all verification and identification attempts.

```sql
CREATE TABLE voice_verification_logs (
  log_id TEXT PRIMARY KEY,
  claimed_user_id TEXT,
  verified_user_id TEXT,
  similarity_score REAL NOT NULL,
  verification_result TEXT NOT NULL,
  verification_type TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX idx_verification_logs_timestamp ON voice_verification_logs(timestamp);
CREATE INDEX idx_verification_logs_verified_user ON voice_verification_logs(verified_user_id);
CREATE INDEX idx_verification_logs_result ON voice_verification_logs(verification_result);
```

**Columns:**
- `log_id` (TEXT, PRIMARY KEY): UUID v4 identifier
- `claimed_user_id` (TEXT): User ID that was claimed (NULL for identification)
- `verified_user_id` (TEXT): Actual matched user ID (NULL if no match)
- `similarity_score` (REAL, NOT NULL): Cosine similarity score (0.0-1.0)
- `verification_result` (TEXT, NOT NULL): One of: 'success', 'failed', 'unknown'
- `verification_type` (TEXT, NOT NULL): One of: 'verification', 'identification'
- `timestamp` (TEXT, NOT NULL): ISO 8601 timestamp

**Verification Result Values:**
- `success`: Verified/identified successfully (score above threshold)
- `failed`: Score below threshold (wrong person)
- `unknown`: No matching profile found (for identification)

**Verification Type Values:**
- `verification`: 1:1 matching (checking claimed identity)
- `identification`: 1:N matching (finding who is speaking)

**Example Rows:**

```
# Successful verification
log_id: log-uuid-001
claimed_user_id: 550e8400-e29b-41d4-a716-446655440000
verified_user_id: 550e8400-e29b-41d4-a716-446655440000
similarity_score: 0.82
verification_result: success
verification_type: verification
timestamp: 2026-01-11T14:30:00Z

# Failed verification (imposter)
log_id: log-uuid-002
claimed_user_id: 550e8400-e29b-41d4-a716-446655440000
verified_user_id: 660e8400-e29b-41d4-a716-446655440001
similarity_score: 0.45
verification_result: failed
verification_type: verification
timestamp: 2026-01-11T14:31:00Z

# Successful identification
log_id: log-uuid-003
claimed_user_id: NULL
verified_user_id: 550e8400-e29b-41d4-a716-446655440000
similarity_score: 0.78
verification_result: success
verification_type: identification
timestamp: 2026-01-11T14:32:00Z

# Unknown speaker
log_id: log-uuid-004
claimed_user_id: NULL
verified_user_id: NULL
similarity_score: 0.42
verification_result: unknown
verification_type: identification
timestamp: 2026-01-11T14:33:00Z
```

---

## Existing Table Modifications

### thoughts

Add speaker tracking to conversation messages.

```sql
ALTER TABLE thoughts ADD COLUMN speaker_user_id TEXT;
CREATE INDEX idx_thoughts_speaker ON thoughts(speaker_user_id);
```

**Purpose:** Track which user spoke each message for personalized conversation history.

**Migration:**
```sql
-- Add column (will be NULL for existing messages)
ALTER TABLE thoughts ADD COLUMN speaker_user_id TEXT;

-- Create index for efficient queries
CREATE INDEX idx_thoughts_speaker ON thoughts(speaker_user_id);

-- Optional: Update existing messages if default user known
-- UPDATE thoughts SET speaker_user_id = 'default-user-id' WHERE speaker_user_id IS NULL;
```

---

## Database Queries

### Common Queries

#### Get all active profiles
```sql
SELECT user_id, username, created_at, last_verified_at
FROM voice_profiles
WHERE is_active = 1
ORDER BY username ASC;
```

#### Get profile with embedding
```sql
SELECT user_id, username, voice_embedding, verification_threshold
FROM voice_profiles
WHERE user_id = ? AND is_active = 1;
```

#### Get enrollment samples for user
```sql
SELECT sample_id, sample_embedding, recorded_at, quality_score
FROM voice_enrollment_samples
WHERE user_id = ?
ORDER BY recorded_at ASC;
```

#### Log verification attempt
```sql
INSERT INTO voice_verification_logs (
  log_id, claimed_user_id, verified_user_id, similarity_score,
  verification_result, verification_type, timestamp
) VALUES (?, ?, ?, ?, ?, ?, ?);
```

#### Get recent verification history for user
```sql
SELECT log_id, similarity_score, verification_result, timestamp
FROM voice_verification_logs
WHERE verified_user_id = ?
ORDER BY timestamp DESC
LIMIT 50;
```

#### Get conversation messages by speaker
```sql
SELECT thought_id, text_content, created_at
FROM thoughts
WHERE speaker_user_id = ?
ORDER BY created_at DESC
LIMIT 100;
```

#### Soft delete profile
```sql
UPDATE voice_profiles
SET is_active = 0
WHERE user_id = ?;
```

#### Hard delete profile (cascade deletes samples automatically)
```sql
DELETE FROM voice_profiles WHERE user_id = ?;
-- Enrollment samples deleted by CASCADE
-- Verification logs remain for audit trail
```

---

## Migration Script

### Initial Schema Creation

```typescript
// In electron/main/thoughtVectorStore.ts

export function initializeVoiceAuthSchema(db: Database.Database): void {
  // Create voice_profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_profiles (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      voice_embedding BLOB NOT NULL,
      enrollment_samples_count INTEGER NOT NULL DEFAULT 0,
      enrollment_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_verified_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      verification_threshold REAL NOT NULL DEFAULT 0.70,
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_voice_profiles_active
      ON voice_profiles(is_active);
    CREATE INDEX IF NOT EXISTS idx_voice_profiles_username
      ON voice_profiles(username);
  `);

  // Create voice_enrollment_samples table
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_enrollment_samples (
      sample_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      sample_embedding BLOB NOT NULL,
      recorded_at TEXT NOT NULL,
      quality_score REAL,
      duration_ms INTEGER,
      FOREIGN KEY(user_id) REFERENCES voice_profiles(user_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_enrollment_samples_user
      ON voice_enrollment_samples(user_id);
    CREATE INDEX IF NOT EXISTS idx_enrollment_samples_recorded
      ON voice_enrollment_samples(recorded_at);
  `);

  // Create voice_verification_logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_verification_logs (
      log_id TEXT PRIMARY KEY,
      claimed_user_id TEXT,
      verified_user_id TEXT,
      similarity_score REAL NOT NULL,
      verification_result TEXT NOT NULL,
      verification_type TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_verification_logs_timestamp
      ON voice_verification_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_verification_logs_verified_user
      ON voice_verification_logs(verified_user_id);
    CREATE INDEX IF NOT EXISTS idx_verification_logs_result
      ON voice_verification_logs(verification_result);
  `);

  // Add speaker column to thoughts (if not exists)
  try {
    db.exec(`ALTER TABLE thoughts ADD COLUMN speaker_user_id TEXT;`);
    db.exec(`CREATE INDEX idx_thoughts_speaker ON thoughts(speaker_user_id);`);
  } catch (err) {
    // Column probably already exists, ignore
  }

  console.log('Voice authentication schema initialized');
}
```

---

## Data Size Estimates

### Per Profile
- Profile metadata: ~200 bytes
- Voice embedding: 768 bytes
- Total per profile: ~1 KB

### Per Enrollment Sample
- Sample metadata: ~150 bytes
- Sample embedding: 768 bytes
- Total per sample: ~1 KB

### Per Verification Log
- Log entry: ~200 bytes

### Total Storage Examples

**10 users scenario:**
- 10 profiles: 10 KB
- 50 samples (5 per user): 50 KB
- 1,000 verification logs: 200 KB
- **Total: ~260 KB**

**100 users scenario:**
- 100 profiles: 100 KB
- 500 samples: 500 KB
- 10,000 verification logs: 2 MB
- **Total: ~2.6 MB**

**Storage is negligible compared to existing data** (conversation embeddings are much larger).

---

## Backup & Export

### Export Profile Data

```sql
-- Export profiles as JSON
SELECT json_object(
  'user_id', user_id,
  'username', username,
  'created_at', created_at,
  'samples_count', enrollment_samples_count
) as profile_json
FROM voice_profiles
WHERE is_active = 1;

-- Note: voice_embedding is binary, not exportable to JSON directly
-- For backup, use SQLite .backup command instead
```

### Backup Strategy

```bash
# Full database backup (includes voice auth tables)
sqlite3 alice-thoughts.sqlite ".backup alice-backup.sqlite"

# Export specific tables
sqlite3 alice-thoughts.sqlite ".dump voice_profiles" > voice_profiles_backup.sql
```

### Import/Restore

```bash
# Restore from backup
sqlite3 alice-thoughts.sqlite < voice_profiles_backup.sql
```

---

## Performance Considerations

### Indexing Strategy

- **Primary keys**: Fast lookups by ID
- **username index**: Fast profile search by name
- **is_active index**: Filter out deleted profiles
- **timestamp indexes**: Fast log queries by date range
- **speaker_user_id index**: Fast conversation history by speaker

### Query Optimization

**Loading all profiles for identification:**
```sql
-- Efficient: Load all embeddings once at startup
SELECT user_id, username, voice_embedding, verification_threshold
FROM voice_profiles
WHERE is_active = 1;
-- Cache in memory, reload only on profile changes
```

**Pagination for logs:**
```sql
-- Use LIMIT/OFFSET for large log tables
SELECT * FROM voice_verification_logs
ORDER BY timestamp DESC
LIMIT 50 OFFSET 0;
```

### Memory Usage

- **100 profiles in memory**: 100 KB (negligible)
- **Query result cache**: 10-50 MB typical
- **No performance concerns** for < 1000 users

---

## Data Privacy & Security

### Stored Data
- ✅ **Voice embeddings**: Irreversible, cannot reconstruct original audio
- ✅ **No raw audio**: Only embeddings stored
- ✅ **Local only**: Never transmitted externally
- ✅ **User deletable**: Easy profile removal

### Encryption
- **At rest**: SQLite database can be encrypted using OS-level encryption or SQLite extensions (SEE, SQLCipher)
- **In memory**: Standard process memory protections
- **In transit**: N/A (local only, no network transmission)

### Compliance
- **GDPR**: Right to deletion (soft/hard delete supported)
- **CCPA**: Right to access (query APIs), right to delete
- **Local data**: No cloud storage, full user control

---

**Last Updated**: 2026-01-11
