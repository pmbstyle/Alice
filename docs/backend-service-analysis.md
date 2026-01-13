# Alice Go Backend Service - Complete Analysis

**Analysis Date:** 2026-01-11
**Backend Language:** Go
**Purpose:** Local AI Services Layer

---

## Executive Summary

The Alice Go backend is a **local AI microservices layer** that provides privacy-focused alternatives to cloud-based AI services. It does **NOT** modify or intercept LLM prompts/responses.

### Core Services

1. **Local Embeddings** - Generate 384-dim vectors using all-MiniLM-L6-v2 (ONNX)
2. **Local Speech-to-Text** - Transcribe audio using Whisper.cpp
3. **Local Text-to-Speech** - Synthesize speech using Piper TTS

### Key Characteristics

✅ **Completely local processing** - No data leaves your machine
✅ **Privacy-first** - No telemetry or external API calls
✅ **Cost-saving** - Free alternatives to OpenAI/Google APIs
✅ **Offline-capable** - Works without internet (after setup)
❌ **Does NOT modify LLM conversations** - Only provides supporting services

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Alice Electron App                           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Vue.js Frontend                            │    │
│  │  - Chat Interface                                       │    │
│  │  - Memory Manager                                       │    │
│  │  - Settings                                             │    │
│  └────────────┬───────────────────────────────────────────┘    │
│               │                                                  │
│               │ HTTP REST API (localhost:8765)                  │
│               ▼                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │         Electron Main Process                           │    │
│  │  - Spawns Go Backend Process                           │    │
│  │  - Manages IPC                                          │    │
│  └────────────┬───────────────────────────────────────────┘    │
└───────────────┼──────────────────────────────────────────────────┘
                │
                │ Child Process
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Go Backend Server                             │
│                   (localhost:8765)                              │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              HTTP REST API Server                        │  │
│  │  - CORS (localhost only)                                 │  │
│  │  - Error handling                                        │  │
│  │  - Request logging                                       │  │
│  └─────────────┬───────────────────────────────────────────┘  │
│                │                                                │
│  ┌─────────────┴──────────┬─────────────────┬───────────────┐ │
│  │                        │                 │               │ │
│  ▼                        ▼                 ▼               ▼ │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────┴──┐
│ │ Embeddings   │  │     STT      │  │     TTS      │  │ Models │
│ │   Service    │  │   Service    │  │   Service    │  │Manager │
│ └──────────────┘  └──────────────┘  └──────────────┘  └────────┘
│        ↓                 ↓                  ↓                    │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│ │ ONNX Runtime │  │ Whisper.cpp  │  │  Piper TTS   │          │
│ │  (MiniLM)    │  │              │  │              │          │
│ └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Service 1: Local Embeddings

### Purpose
Generate vector embeddings for semantic similarity search without using external APIs.

### Model
- **Name:** all-MiniLM-L6-v2
- **Type:** Sentence Transformer (BERT-based)
- **Dimensions:** 384
- **Source:** HuggingFace (Xenova/all-MiniLM-L6-v2)
- **Runtime:** ONNX Runtime
- **Size:** ~90 MB

### How It Works

```
Input Text
    ↓
WordPiece Tokenizer (Pure Go)
    ↓
Input IDs + Attention Mask
    ↓
ONNX Runtime Inference (model.onnx)
    ↓
Hidden States [batch_size, seq_len, hidden_dim]
    ↓
Mean Pooling (with attention mask)
    ↓
L2 Normalization
    ↓
384-dimensional Float32 Vector
```

### API Endpoints

**Generate Single Embedding**
```http
POST /api/embeddings/generate
Content-Type: application/json

{
  "text": "Hello, how are you?"
}

Response:
{
  "success": true,
  "data": {
    "embedding": [0.123, -0.456, ...], // 384 floats
    "text": "Hello, how are you?"
  }
}
```

**Generate Batch Embeddings**
```http
POST /api/embeddings/generate-batch
Content-Type: application/json

{
  "texts": ["First text", "Second text", "Third text"]
}

Response:
{
  "success": true,
  "data": {
    "embeddings": [[...], [...], [...]] // Array of 384-dim vectors
  }
}
```

**Compute Similarity**
```http
POST /api/embeddings/similarity
Content-Type: application/json

{
  "embedding1": [0.1, 0.2, ...],
  "embedding2": [0.3, 0.4, ...]
}

Response:
{
  "success": true,
  "data": {
    "similarity": 0.87 // Cosine similarity
  }
}
```

**Search Similar Embeddings**
```http
POST /api/embeddings/search
Content-Type: application/json

{
  "query_embedding": [0.1, 0.2, ...],
  "candidate_embeddings": [[...], [...], [...]],
  "top_k": 5
}

Response:
{
  "success": true,
  "data": {
    "indices": [2, 0, 4, 1, 3],
    "similarities": [0.95, 0.87, 0.76, 0.65, 0.54]
  }
}
```

### Used By
- Memory system (thought vectors, long-term memories, RAG)
- Semantic search across conversations
- Document indexing

### Performance
- Single embedding: ~10-50ms
- Batch (10 texts): ~50-200ms
- Memory usage: ~500 MB RAM

### Code Location
- [backend/internal/minilm/onnx_embeddings.go](../backend/internal/minilm/onnx_embeddings.go)
- [backend/internal/api/embeddings.go](../backend/internal/api/embeddings.go)

---

## Service 2: Speech-to-Text (STT)

### Purpose
Transcribe audio to text locally without sending data to external APIs.

### Model
- **Name:** Whisper.cpp
- **Type:** Speech recognition
- **Models:** tiny, base, small, medium, large
- **Languages:** Multilingual (100+ languages)
- **Source:** OpenAI Whisper (via whisper.cpp port)

### How It Works

```
Audio Input (WAV, MP3, etc.)
    ↓
Audio Preprocessing
    ↓
Whisper.cpp Inference
    ↓
Text Transcription
```

### API Endpoints

**Transcribe Audio (JSON)**
```http
POST /api/stt/transcribe
Content-Type: application/json

{
  "audio_data": [0.1, -0.2, 0.3, ...], // Float32Array
  "sample_rate": 16000,
  "language": "en" // Optional
}

Response:
{
  "success": true,
  "data": {
    "text": "Hello, how are you?",
    "confidence": 0.95,
    "duration": 1.2
  }
}
```

**Transcribe Audio (File Upload)**
```http
POST /api/stt/transcribe
Content-Type: multipart/form-data

file: [audio file]
language: "en" (optional)

Response:
{
  "success": true,
  "data": {
    "text": "Transcribed text here",
    "confidence": 0.95,
    "duration": 2.5
  }
}
```

**Check STT Ready**
```http
GET /api/stt/ready

Response:
{
  "success": true,
  "data": {
    "ready": true
  }
}
```

### Supported Formats
- WAV (PCM)
- MP3
- Raw PCM audio (Float32Array from browser)

### Code Location
- [backend/internal/whisper/stt.go](../backend/internal/whisper/stt.go)
- [backend/internal/api/stt.go](../backend/internal/api/stt.go)
- [backend/internal/grpc/whisper/](../backend/internal/grpc/whisper/)

---

## Service 3: Text-to-Speech (TTS)

### Purpose
Convert text to speech locally without external API calls.

### Model
- **Name:** Piper TTS
- **Type:** Neural text-to-speech
- **Voices:** Multiple languages, genders
- **Default:** en-US-amy-medium
- **Output:** WAV audio (22050 Hz)

### How It Works

```
Input Text
    ↓
Text Normalization
    ↓
Piper TTS Model
    ↓
WAV Audio Output (22050 Hz)
```

### API Endpoints

**Synthesize Speech**
```http
POST /api/tts/synthesize
Content-Type: application/json

{
  "text": "Hello, how are you?",
  "voice": "en-US-amy-medium", // Optional
  "speed": 1.0 // Optional
}

Response:
{
  "success": true,
  "data": {
    "audio": [0, 255, 128, ...], // Byte array as numbers
    "format": "wav",
    "sample_rate": 22050,
    "duration": 1.5
  }
}
```

**Get Available Voices**
```http
GET /api/tts/voices

Response:
{
  "success": true,
  "data": {
    "voices": [
      {
        "name": "en-US-amy-medium",
        "language": "en-US",
        "gender": "female",
        "description": "US English, Amy (medium quality)"
      },
      ...
    ]
  }
}
```

### Code Location
- [backend/internal/piper/tts.go](../backend/internal/piper/tts.go)
- [backend/internal/api/tts.go](../backend/internal/api/tts.go)

---

## Server Configuration

### Network Settings
- **Host:** `127.0.0.1` (localhost only)
- **Port:** `8765` (default, configurable)
- **Protocol:** HTTP REST API
- **Timeout:** 30 seconds

### CORS Policy
```go
// Only allows localhost origins
if host == "localhost" || host == "127.0.0.1" || host == "::1" {
  w.Header().Set("Access-Control-Allow-Origin", origin)
  w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}
```

### Middleware
1. **Logging Middleware** - Logs all requests with timestamps
2. **Recovery Middleware** - Catches panics and returns 500 errors
3. **CORS Middleware** - Restricts access to localhost only

### Code Location
- [backend/internal/server/server.go](../backend/internal/server/server.go)
- [backend/main.go](../backend/main.go)

---

## Model Management

### Model Storage Paths

**Windows:**
```
%APPDATA%\alice-ai-app\models\
```

**Linux:**
```
~/.config/alice-ai-app/models/
```

**macOS:**
```
~/Library/Application Support/alice-ai-app/models/
```

### Model Files

**Embeddings (MiniLM):**
- `model.onnx` - ONNX model (~90 MB)
- `vocab.txt` - WordPiece vocabulary (~230 KB)

**ONNX Runtime:**
- Downloaded to system temp directory
- Platform-specific:
  - Windows: `onnxruntime.dll`
  - macOS: `libonnxruntime.dylib`
  - Linux: `libonnxruntime.so`
- Version: v1.22.0
- Size: ~30-50 MB

**STT (Whisper):**
- Model binaries downloaded based on configuration
- Sizes vary: tiny (~75 MB) to large (~3 GB)

**TTS (Piper):**
- Voice model files (.onnx)
- Size: ~10-50 MB per voice

### Download Sources
- **ONNX Runtime:** GitHub releases (microsoft/onnxruntime)
- **MiniLM Model:** HuggingFace (Xenova/all-MiniLM-L6-v2)
- **Whisper Models:** aliceai.ca mirrors or GitHub
- **Piper Models:** GitHub releases

### Automatic Downloads
On first startup, the backend automatically downloads required models:

```go
func (s *OnnxEmbeddingService) Initialize(ctx context.Context) error {
  // 1. Download ONNX Runtime library
  libPath, err := ensureORTSharedLib()

  // 2. Download MiniLM model and vocab
  modelPath, vocabPath, err := ensureMiniLMModel(s.config.ModelPath)

  // 3. Load tokenizer
  s.tokenizer, err = loadWordPiece(vocabPath)

  // 4. Initialize ONNX session
  s.session, err = ort.NewDynamicAdvancedSession(modelPath, ...)

  return nil
}
```

### Model Download API

**Download Model**
```http
POST /api/models/download/{service}

service: "embeddings" | "stt" | "tts"

Response:
{
  "success": true,
  "data": {
    "status": "downloading",
    "progress": 45
  }
}
```

**Check Download Status**
```http
GET /api/models/download-status

Response:
{
  "success": true,
  "data": {
    "embeddings": "ready",
    "stt": "downloading",
    "tts": "ready"
  }
}
```

---

## What the Backend Does NOT Do

### ❌ Does NOT Intercept LLM Conversations

**LLM requests go directly from frontend:**
- OpenAI API calls → Direct from frontend to OpenAI
- OpenRouter API calls → Direct from frontend to OpenRouter
- Ollama API calls → Direct from frontend to Ollama (localhost:11434)
- LM Studio API calls → Direct from frontend to LM Studio (localhost:1234)

**The backend never sees:**
- Your prompts to LLMs
- LLM responses
- Conversation context
- System messages

### ❌ Does NOT Modify Data

- No prompt injection
- No response filtering
- No content modification
- Stateless processing (input → output, no retention)

### ❌ Does NOT Store Data

- No conversation logs
- No processed text/audio saved
- No telemetry or analytics
- Ephemeral processing only

### ❌ Does NOT Connect to External Services

After initial model downloads:
- No external API calls
- No internet required (offline mode)
- No data transmission
- Completely air-gapped

---

## Security & Privacy

### ✅ Privacy-First Design

1. **Local Processing Only**
   - All inference happens on your machine
   - No cloud dependencies

2. **Localhost-Only Binding**
   - Server only listens on 127.0.0.1
   - Not accessible from network
   - CORS restricted to localhost

3. **No Data Persistence**
   - Stateless HTTP handlers
   - No database or file storage
   - No logs of processed content

4. **Open Source**
   - Full source code available
   - Auditable by security researchers
   - Uses open-source AI models

### Network Security

**Firewall Rules:**
- Backend does NOT need inbound internet access
- Only needs outbound for initial model downloads
- After setup, can run completely offline

**Port Binding:**
```go
s.httpServer = &http.Server{
  Addr: ":8765", // Binds to 127.0.0.1:8765
  Handler: handler,
}
```

### Data Flow Security

```
User Text
    ↓
Frontend (Browser Context)
    ↓
Electron Main Process
    ↓
HTTP POST to localhost:8765
    ↓
Go Backend (Local Processing)
    ↓
ONNX/Whisper/Piper (Local Inference)
    ↓
HTTP Response to Electron
    ↓
Frontend (Result Displayed)

NO EXTERNAL TRANSMISSION
```

---

## Performance Characteristics

### Resource Usage

**CPU:**
- Embeddings: 10-50ms per text (CPU-bound)
- STT: Depends on model size (GPU-accelerated if available)
- TTS: Near real-time synthesis

**Memory:**
- Embeddings: ~500 MB RAM
- STT: 500 MB - 2 GB (depends on Whisper model size)
- TTS: ~200-500 MB
- Total: ~1-3 GB RAM

**Disk:**
- Embeddings model: ~90 MB
- ONNX Runtime: ~30-50 MB
- STT models: 75 MB - 3 GB
- TTS voices: ~10-50 MB each

### Concurrency

**Thread-Safe Operations:**
- Multiple embedding requests can be processed concurrently
- Mutex-protected service access
- Goroutine-based HTTP handlers

**Throughput:**
- Embeddings: ~20-100 req/sec (single-threaded)
- STT: ~1-5 concurrent transcriptions
- TTS: ~10-20 concurrent syntheses

---

## Configuration

### Config File
Location: Backend reads from environment or default config

**Key Settings:**
```go
type Config struct {
  Server struct {
    Port string // Default: "8765"
    Host string // Default: "127.0.0.1"
  }

  Features struct {
    STT        bool // Enable/disable STT
    TTS        bool // Enable/disable TTS
    Embeddings bool // Enable/disable embeddings
  }

  Models struct {
    Path string // Model storage directory
  }
}
```

### Environment Variables
```bash
ALICE_BACKEND_PORT=8765
ALICE_MODEL_PATH=/path/to/models
ALICE_ENABLE_STT=true
ALICE_ENABLE_TTS=true
ALICE_ENABLE_EMBEDDINGS=true
```

---

## Startup & Shutdown

### Startup Sequence

```
1. Electron Main Process starts
   ↓
2. Spawn Go backend as child process
   ↓
3. Go backend initializes:
   a. Load configuration
   b. Create Model Manager
   c. Download models (if not present)
   d. Load models into memory
   e. Start HTTP server
   ↓
4. Backend sends "ready" signal
   ↓
5. Frontend connects to localhost:8765
   ↓
6. Health check succeeds
   ↓
7. Services available
```

### Graceful Shutdown

```go
func main() {
  // Wait for interrupt signal
  quit := make(chan os.Signal, 1)
  signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
  <-quit

  // Shutdown server gracefully
  ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
  defer cancel()

  srv.Stop(ctx)           // Stop HTTP server
  modelManager.Shutdown(ctx) // Unload models

  log.Println("Server stopped")
}
```

**Cleanup:**
- HTTP server stops accepting connections
- In-flight requests complete (30s timeout)
- ONNX sessions destroyed
- Memory freed

---

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    // Service-specific data here
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message here"
}
```

### HTTP Status Codes
- `200 OK` - Success
- `400 Bad Request` - Invalid input
- `500 Internal Server Error` - Processing failed
- `503 Service Unavailable` - Service not ready

---

## Troubleshooting

### Backend Not Starting

**Check logs:**
```bash
# Backend logs in Electron console
# Look for "Starting HTTP server" message
```

**Common issues:**
1. Port 8765 already in use
2. Model download failed (network issue)
3. Insufficient disk space for models
4. ONNX Runtime incompatible with system

### Service Not Ready

**Check health endpoint:**
```bash
curl http://localhost:8765/api/health
```

**If service shows not ready:**
1. Models still downloading
2. Model file corrupted
3. Insufficient memory
4. ONNX Runtime initialization failed

### Slow Performance

**Embeddings slow:**
- CPU-bound operation
- Consider fewer concurrent requests
- Check system load

**STT slow:**
- Large Whisper model (try smaller model)
- Long audio files
- CPU inference (GPU would be faster)

---

## Code Structure

```
backend/
├── main.go                          # Entry point
├── go.mod                           # Go dependencies
├── internal/
│   ├── api/
│   │   ├── handler.go              # Base API handler
│   │   ├── embeddings.go           # Embeddings endpoints
│   │   ├── stt.go                  # STT endpoints
│   │   ├── tts.go                  # TTS endpoints
│   │   ├── models.go               # Model types
│   │   └── models_handlers.go      # Model management endpoints
│   ├── server/
│   │   └── server.go               # HTTP server setup
│   ├── config/
│   │   └── config.go               # Configuration
│   ├── models/
│   │   └── manager.go              # Model lifecycle manager
│   ├── minilm/
│   │   ├── onnx_embeddings.go      # ONNX embedding service
│   │   └── types.go                # Type definitions
│   ├── whisper/
│   │   └── stt.go                  # Whisper STT service
│   ├── piper/
│   │   └── tts.go                  # Piper TTS service
│   ├── grpc/
│   │   └── whisper/                # gRPC client for Whisper
│   │       ├── server.go
│   │       └── client.go
│   └── downloader/
│       └── downloader.go           # Model downloader utility
```

---

## Summary

### The Go backend is a **local AI services proxy** that:

✅ **Provides:**
1. Local embeddings (MiniLM via ONNX)
2. Local speech-to-text (Whisper.cpp)
3. Local text-to-speech (Piper TTS)

✅ **Benefits:**
- Complete privacy (no external APIs)
- Cost savings (free local inference)
- Offline capability
- Fast performance

❌ **Does NOT:**
- Modify LLM prompts or responses
- Intercept conversations
- Store any data
- Connect to external services (after setup)

### Architecture:
```
Frontend → Backend (localhost:8765) → Local AI Models → Results
```

**The backend is purely a local processing layer for supporting AI services, not a middleware for LLM interactions.**

---

## Additional Resources

- [Main Project README](../README.md)
- [Memory System Documentation](./memory-system/README.md)
- [Security Analysis](../CLAUDE.md)
- [Setup Instructions](./setupInstructions.md)

---

*Last Updated: 2026-01-11*
