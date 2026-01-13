# Voice Authentication API Specification

## Base URL

All voice authentication endpoints are prefixed with `/api/voiceauth`

## Common Data Types

### VoiceProfile
```json
{
  "user_id": "uuid-v4",
  "username": "John Doe",
  "enrollment_completed": true,
  "samples_count": 5,
  "created_at": "2026-01-11T12:00:00Z",
  "last_verified_at": "2026-01-11T14:30:00Z",
  "is_active": true,
  "verification_threshold": 0.70
}
```

### AudioInput
```json
{
  "audio_data": "base64-encoded-wav",
  "sample_rate": 16000
}
```

### SimilarityMatch
```json
{
  "user_id": "uuid-v4",
  "username": "John Doe",
  "similarity_score": 0.82,
  "rank": 1
}
```

## Endpoints

### 1. Start Enrollment

**POST** `/api/voiceauth/enroll/start`

Start a new voice profile enrollment process.

**Request Body:**
```json
{
  "username": "John Doe"
}
```

**Response (200 OK):**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "samples_required": 5,
  "message": "Enrollment started. Please provide 5 voice samples."
}
```

**Errors:**
- `400` - Username already exists
- `400` - Invalid username format

---

### 2. Submit Enrollment Sample

**POST** `/api/voiceauth/enroll/sample`

Submit an audio sample during enrollment.

**Request Body:**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "audio_data": "base64-encoded-wav-data",
  "sample_rate": 16000
}
```

**Response (200 OK):**
```json
{
  "sample_id": "sample-uuid",
  "samples_completed": 3,
  "samples_required": 5,
  "quality_score": 0.85,
  "message": "Sample accepted. 2 more samples required."
}
```

**Errors:**
- `400` - Invalid user_id
- `400` - Invalid audio format
- `400` - Audio too short (< 1 second)
- `404` - User not found
- `409` - Enrollment already completed

---

### 3. Complete Enrollment

**POST** `/api/voiceauth/enroll/complete`

Finalize enrollment and compute average embedding.

**Request Body:**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "profile": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "John Doe",
    "samples_count": 5,
    "created_at": "2026-01-11T12:00:00Z",
    "enrollment_completed": true
  }
}
```

**Errors:**
- `400` - Not enough samples (minimum 3 required)
- `404` - User not found

---

### 4. Verify Speaker (1:1)

**POST** `/api/voiceauth/verify`

Verify if the speaker matches a specific profile.

**Request Body:**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "audio_data": "base64-encoded-wav-data",
  "sample_rate": 16000
}
```

**Response (200 OK):**
```json
{
  "verified": true,
  "similarity_score": 0.82,
  "threshold": 0.70,
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "John Doe",
  "message": "Speaker verified as John Doe"
}
```

**Response (200 OK - Not Verified):**
```json
{
  "verified": false,
  "similarity_score": 0.45,
  "threshold": 0.70,
  "message": "Speaker verification failed. Similarity below threshold."
}
```

**Errors:**
- `400` - Invalid audio format
- `404` - User profile not found
- `400` - Profile enrollment not completed

---

### 5. Identify Speaker (1:N)

**POST** `/api/voiceauth/identify`

Identify the speaker by matching against all profiles.

**Request Body:**
```json
{
  "audio_data": "base64-encoded-wav-data",
  "sample_rate": 16000,
  "top_n": 3
}
```

**Response (200 OK - Identified):**
```json
{
  "identified": true,
  "best_match": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "John Doe",
    "similarity_score": 0.82,
    "rank": 1
  },
  "matches": [
    {
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "John Doe",
      "similarity_score": 0.82,
      "rank": 1
    },
    {
      "user_id": "660e8400-e29b-41d4-a716-446655440001",
      "username": "Jane Smith",
      "similarity_score": 0.45,
      "rank": 2
    }
  ],
  "threshold": 0.70,
  "message": "Speaker identified as John Doe"
}
```

**Response (200 OK - Not Identified):**
```json
{
  "identified": false,
  "matches": [],
  "threshold": 0.70,
  "message": "No matching profile found. Speaker unknown."
}
```

**Errors:**
- `400` - Invalid audio format
- `400` - No enrolled profiles available

---

### 6. List Profiles

**GET** `/api/voiceauth/profiles`

Get all voice profiles.

**Query Parameters:**
- `active_only` (boolean, optional): Only return active profiles (default: true)

**Response (200 OK):**
```json
{
  "profiles": [
    {
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "John Doe",
      "enrollment_completed": true,
      "samples_count": 5,
      "created_at": "2026-01-11T12:00:00Z",
      "last_verified_at": "2026-01-11T14:30:00Z",
      "is_active": true,
      "verification_threshold": 0.70
    }
  ],
  "count": 1
}
```

---

### 7. Get Profile by ID

**GET** `/api/voiceauth/profiles/:user_id`

Get a specific voice profile.

**Response (200 OK):**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "John Doe",
  "enrollment_completed": true,
  "samples_count": 5,
  "created_at": "2026-01-11T12:00:00Z",
  "last_verified_at": "2026-01-11T14:30:00Z",
  "is_active": true,
  "verification_threshold": 0.70
}
```

**Errors:**
- `404` - Profile not found

---

### 8. Update Profile

**PATCH** `/api/voiceauth/profiles/:user_id`

Update profile settings.

**Request Body:**
```json
{
  "username": "John Smith",
  "verification_threshold": 0.75,
  "notes": "Updated threshold for better accuracy"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "profile": {
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "John Smith",
    "verification_threshold": 0.75,
    "notes": "Updated threshold for better accuracy"
  }
}
```

**Errors:**
- `404` - Profile not found
- `400` - Invalid threshold (must be 0.0-1.0)

---

### 9. Delete Profile

**DELETE** `/api/voiceauth/profiles/:user_id`

Delete a voice profile (soft delete by default).

**Query Parameters:**
- `hard_delete` (boolean, optional): Permanently delete (default: false)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Profile deleted successfully"
}
```

**Errors:**
- `404` - Profile not found

---

### 10. Get Verification Logs

**GET** `/api/voiceauth/logs`

Get verification attempt logs.

**Query Parameters:**
- `user_id` (string, optional): Filter by user
- `limit` (integer, optional): Max results (default: 100)
- `offset` (integer, optional): Pagination offset (default: 0)
- `from_date` (ISO 8601, optional): Filter from date
- `to_date` (ISO 8601, optional): Filter to date

**Response (200 OK):**
```json
{
  "logs": [
    {
      "log_id": "log-uuid",
      "claimed_user_id": "550e8400-e29b-41d4-a716-446655440000",
      "verified_user_id": "550e8400-e29b-41d4-a716-446655440000",
      "similarity_score": 0.82,
      "verification_result": "success",
      "verification_type": "identification",
      "timestamp": "2026-01-11T14:30:00Z"
    }
  ],
  "count": 1,
  "total": 42
}
```

---

## Error Response Format

All errors follow this format:

```json
{
  "error": {
    "code": "INVALID_AUDIO",
    "message": "Audio format must be 16kHz mono PCM WAV",
    "details": {
      "received_sample_rate": 44100,
      "expected_sample_rate": 16000
    }
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_AUDIO` | 400 | Audio format invalid |
| `AUDIO_TOO_SHORT` | 400 | Audio < 1 second |
| `USER_NOT_FOUND` | 404 | User ID doesn't exist |
| `USERNAME_EXISTS` | 400 | Username already taken |
| `ENROLLMENT_INCOMPLETE` | 400 | Not enough samples |
| `ENROLLMENT_COMPLETE` | 409 | Already completed |
| `NO_PROFILES` | 400 | No enrolled profiles |
| `INVALID_THRESHOLD` | 400 | Threshold out of range |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Audio Format Requirements

**All audio submissions must meet these requirements:**

- **Format**: WAV (RIFF header)
- **Sample Rate**: 16000 Hz (16kHz)
- **Channels**: 1 (mono)
- **Bit Depth**: 16-bit signed PCM
- **Encoding**: Little-endian
- **Minimum Duration**: 1 second (16,000 samples)
- **Recommended Duration**: 3-5 seconds
- **Maximum Duration**: 10 seconds (160,000 samples)
- **Base64 Encoding**: Required for JSON transport

**Example WAV Header** (44 bytes):
```
RIFF [size] WAVE
fmt  [fmt chunk: 16 bytes, PCM, 1 channel, 16000 Hz, 16-bit]
data [size] [audio samples]
```

---

## Rate Limits

**Development**: No limits
**Production (recommended)**:
- Enrollment: 10 samples per minute per user
- Verification: 60 requests per minute per user
- Identification: 60 requests per minute per user

---

## Authentication

Currently: **None** (local desktop app)

Future: Optional API key for remote access scenarios

---

## WebSocket Support (Future)

For real-time continuous identification:

```javascript
ws://localhost:[port]/api/voiceauth/stream
```

Send audio chunks, receive identification updates in real-time.

---

## IPC Events (Electron)

Frontend can also interact via IPC:

```typescript
// Start enrollment
ipcRenderer.invoke('voiceauth:enroll-start', { username: 'John' })

// Submit sample
ipcRenderer.invoke('voiceauth:enroll-sample', { user_id, audio_data })

// Verify
ipcRenderer.invoke('voiceauth:verify', { user_id, audio_data })

// Identify
ipcRenderer.invoke('voiceauth:identify', { audio_data })

// Get profiles
ipcRenderer.invoke('voiceauth:get-profiles')

// Delete profile
ipcRenderer.invoke('voiceauth:delete-profile', { user_id })
```

---

## Examples

### Complete Enrollment Flow (JavaScript)

```javascript
// 1. Start enrollment
const { user_id } = await fetch('/api/voiceauth/enroll/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'John Doe' })
}).then(r => r.json())

// 2. Record and submit 5 samples
for (let i = 0; i < 5; i++) {
  const audioBlob = await recordAudio(3000) // 3 seconds
  const audioBuffer = await audioBlob.arrayBuffer()
  const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)))

  await fetch('/api/voiceauth/enroll/sample', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id,
      audio_data: base64Audio,
      sample_rate: 16000
    })
  })
}

// 3. Complete enrollment
const { profile } = await fetch('/api/voiceauth/enroll/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id })
}).then(r => r.json())

console.log('Enrollment complete:', profile)
```

### Identify Speaker (JavaScript)

```javascript
// Record audio
const audioBlob = await recordAudio(3000)
const audioBuffer = await audioBlob.arrayBuffer()
const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)))

// Identify
const result = await fetch('/api/voiceauth/identify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    audio_data: base64Audio,
    sample_rate: 16000,
    top_n: 1
  })
}).then(r => r.json())

if (result.identified) {
  console.log(`Speaker: ${result.best_match.username} (${result.best_match.similarity_score})`)
} else {
  console.log('Unknown speaker')
}
```

---

**Last Updated**: 2026-01-11
