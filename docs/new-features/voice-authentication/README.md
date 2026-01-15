# Voice Authentication System for Alice

## Overview

This document outlines the complete implementation plan for adding voice authentication to Alice, allowing her to identify speakers by their voice in real-time during conversations.

**Status**: 📋 Planning Phase
**Priority**: Medium
**Estimated Effort**: 5-6 weeks
**Dependencies**: None (uses existing infrastructure)

## Quick Links

- [Architecture Overview](./architecture.md) - System design and component integration
- [Implementation Guide](./implementation.md) - Step-by-step implementation instructions
- [API Specification](./api-spec.md) - API endpoints and data structures
- [Database Schema](./database-schema.md) - Database tables and migrations
- [Testing Guide](./testing.md) - Testing strategy and verification steps
- [Library Research](./library-research.md) - Technology evaluation and selection

## What is Voice Authentication?

Voice authentication (speaker recognition) enables Alice to:
1. **Identify** who is speaking (1:N matching)
2. **Verify** a claimed identity (1:1 matching)
3. **Personalize** conversations based on speaker identity
4. **Track** conversation history per speaker
5. **Remember** individual users across sessions

## Why Voice Authentication?

**User Benefits**:
- Alice can greet users by name automatically
- Personalized conversation context for each family member/user
- Natural multi-user support without manual login
- Privacy-preserving biometric authentication (local only)

**Use Cases**:
- Family shared device: Alice recognizes each family member
- Office environment: Multiple team members using same Alice instance
- Personalized assistance: Different preferences, memories per user
- Access control: Voice-based authorization for sensitive commands

## Recommended Approach

**Technology**: ECAPA-TDNN speaker verification via ONNX Runtime

**Key Advantages**:
- ✅ 100% local processing (privacy-first)
- ✅ High accuracy: 1-2% Equal Error Rate
- ✅ Fast inference: <50ms on CPU, <15ms on GPU
- ✅ Leverages existing ONNX Runtime infrastructure
- ✅ Small model: ~23MB
- ✅ Compatible with 16kHz audio pipeline
- ✅ No new dependencies required

See [Library Research](./library-research.md) for detailed comparison of alternatives.

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vue)                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────┐ │
│  │ Enrollment UI    │  │ Profile Manager  │  │  Speaker  │ │
│  │ (5 samples)      │  │ (CRUD)           │  │ Indicator │ │
│  └──────────────────┘  └──────────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ▼ IPC
┌─────────────────────────────────────────────────────────────┐
│                   Electron Main Process                      │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ IPC Handlers     │  │ SQLite Database  │                │
│  │ (voice auth)     │  │ (voice_profiles) │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                              ▼ HTTP
┌─────────────────────────────────────────────────────────────┐
│                      Go Backend                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Speaker Service  │  │ Voice Auth API   │                │
│  │ (ONNX ECAPA)     │  │ (enrollment,     │                │
│  │                  │  │  verification)   │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

**Flow**:
1. User speaks → VAD captures audio
2. Audio sent to Go backend → ONNX extracts 192-dim embedding
3. Compare with stored profiles → Identify speaker
4. Update conversation context with speaker identity
5. Alice responds with personalized context

## Implementation Phases

### Phase 1: Backend Foundation (Week 1-2)
- Create speaker embedding service (ONNX)
- Implement cosine similarity comparison
- Model download mechanism
- Unit tests

**Files**: `backend/internal/speaker/*.go`

### Phase 2: API & Database (Week 2-3)
- API endpoints (enroll, verify, identify)
- Database schema (3 new tables)
- Profile management logic
- Integration tests

**Files**: `backend/internal/api/voiceauth.go`, `electron/main/thoughtVectorStore.ts`

### Phase 3: Frontend Integration (Week 3-4)
- Enrollment wizard UI
- Profile manager component
- Settings integration
- IPC handlers

**Files**: `src/components/voice-auth/*.vue`, `electron/main/ipcManager.ts`

### Phase 4: Conversation Integration (Week 4-5)
- Real-time speaker indicator
- VAD integration for continuous identification
- System prompt personalization
- Speaker tracking in messages

**Files**: `src/composables/useAudioProcessing.ts`, `src/stores/conversationStore.ts`

### Phase 5: Testing & Polish (Week 5-6)
- Comprehensive testing (unit, integration, UAT)
- Performance optimization
- Documentation
- Settings UI refinement

## Key Features

### Enrollment
- User provides 5 voice samples (3-5 seconds each)
- System extracts embeddings and computes average
- Stored locally in SQLite database
- ~2-3 minutes per user

### Verification (1:1 Matching)
- "Is this person who they claim to be?"
- Compare incoming audio against specific profile
- Returns similarity score + pass/fail
- Used for explicit authentication

### Identification (1:N Matching)
- "Who is speaking?"
- Compare against all enrolled profiles
- Returns ranked list of matches
- Used for automatic speaker recognition

### Continuous Monitoring
- Identify speaker at conversation start
- Optional: Re-identify periodically during conversation
- Seamless multi-user conversations
- Speaker indicator always visible

## Privacy & Security

### Privacy Guarantees
- ✅ **100% Local**: All processing on device
- ✅ **No Cloud**: Never transmitted externally
- ✅ **No Raw Audio**: Only embeddings stored
- ✅ **Irreversible**: Embeddings cannot reconstruct voice
- ✅ **User Control**: Easy profile deletion

### Security Features
- Adjustable similarity threshold (0.60-0.90)
- Verification logging (audit trail)
- Profile soft-delete (can recover)
- Unknown speaker handling
- False acceptance prevention

## Getting Started

### For Developers

1. **Read the architecture**: [architecture.md](./architecture.md)
2. **Review API spec**: [api-spec.md](./api-spec.md)
3. **Check database schema**: [database-schema.md](./database-schema.md)
4. **Follow implementation guide**: [implementation.md](./implementation.md)
5. **Run tests**: [testing.md](./testing.md)

### For Users (After Implementation)

1. Open Alice Settings → Voice Authentication
2. Click "Enroll New Profile"
3. Enter your name
4. Record 5 voice samples (follow prompts)
5. Enable "Auto-Identify Speaker"
6. Start talking to Alice - she'll recognize you!

## Technical Specifications

**Audio Requirements**:
- Sample rate: 16kHz (existing pipeline)
- Format: 16-bit PCM WAV
- Channels: Mono
- Duration: 3-5 seconds per sample
- Enrollment: 5 samples minimum

**Model Specifications**:
- Model: ECAPA-TDNN (HuggingFace)
- Input: Variable-length 16kHz audio
- Output: 192-dimensional embedding
- Size: ~23MB ONNX format
- Performance: <50ms CPU, <15ms GPU

**Accuracy**:
- Equal Error Rate (EER): 1-2%
- False Acceptance Rate: <1% (threshold 0.70)
- False Rejection Rate: <3% (threshold 0.70)

## Files to Create/Modify

### Backend (Go)
**New files**:
- `backend/internal/speaker/service.go` - ONNX embedding service
- `backend/internal/speaker/voiceauth.go` - Business logic
- `backend/internal/api/voiceauth.go` - API handlers

**Modify**:
- `backend/internal/models/manager.go` - Service initialization
- `backend/internal/server/server.go` - Route registration

### Frontend (TypeScript/Vue)
**New files**:
- `src/services/voiceAuthService.ts` - API client
- `src/components/voice-auth/VoiceEnrollment.vue` - Enrollment UI
- `src/components/voice-auth/VoiceProfileManager.vue` - Profile manager
- `src/components/voice-auth/VoiceSpeakerIndicator.vue` - Speaker display

**Modify**:
- `electron/main/thoughtVectorStore.ts` - Database schema
- `electron/main/settingsManager.ts` - Settings extension
- `electron/main/ipcManager.ts` - IPC handlers
- `src/composables/useAudioProcessing.ts` - VAD integration
- `src/views/Settings.vue` - Settings UI

## Dependencies

**Required**: None! Uses existing infrastructure
- ✅ ONNX Runtime (already in project)
- ✅ SQLite (already in project)
- ✅ Electron IPC (already in project)
- ✅ Web Audio API (browser built-in)

**New Downloads**:
- ECAPA-TDNN ONNX model (~23MB, auto-downloaded on first run)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Poor accuracy with noise | Adjustable threshold, preprocessing improvements |
| Slow with many users | Caching, GPU acceleration, batch processing |
| Privacy concerns | Clear documentation, local-only emphasis, easy deletion |
| False acceptances | Default threshold 0.70, audit logging, user education |

## Future Enhancements

**v2 Features** (post-MVP):
- Adaptive thresholds per user
- Voice aging detection (prompt re-enrollment)
- Emotion detection
- Voice cloning/deepfake detection
- Multi-modal auth (face + voice)
- Speaker diarization (full conversation transcripts)

## Resources

**External Links**:
- [ECAPA-TDNN Paper](https://arxiv.org/abs/2005.07143)
- [HuggingFace ONNX Models](https://huggingface.co/Xenova/speaker-verification-onnx)
- [SpeechBrain Toolkit](https://speechbrain.github.io/)
- [ONNX Runtime Go](https://github.com/yalue/onnxruntime_go)

**Internal Documentation**:
- [Setup Instructions](../../setupInstructions.md)
- [Custom Tools Guide](../../custom-tools.md)
- [Security Review](../../CLAUDE.md)

## Questions or Issues?

- **Technical questions**: Review [implementation.md](./implementation.md)
- **API questions**: Review [api-spec.md](./api-spec.md)
- **Architecture questions**: Review [architecture.md](./architecture.md)
- **General questions**: Open an issue on GitHub

---

**Last Updated**: 2026-01-11
**Status**: Planning Complete, Ready for Implementation
**Maintainer**: Alice Development Team
