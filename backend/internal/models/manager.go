package models

import (
	"context"
	"fmt"
	"log"
	"sync"

	"alice-backend/internal/config"
	"alice-backend/internal/minilm"
	"alice-backend/internal/piper"
	"alice-backend/internal/whisper"
)

// Manager coordinates all AI services
type Manager struct {
	config           *config.Config
	sttService       *whisper.STTService
	ttsService       *piper.TTSService
	embeddingService *minilm.EmbeddingService
	mu               sync.RWMutex
}

// NewManager creates a new model manager
func NewManager(config *config.Config) *Manager {
	return &Manager{
		config: config,
	}
}

// Initialize initializes all services based on configuration
func (m *Manager) Initialize(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	log.Println("Initializing model manager...")

	// Initialize STT service if enabled
	if m.config.Features.STT {
		log.Println("Initializing STT service...")
		sttConfig := &whisper.Config{
			Language:       "en",
			ModelPath:      "models/whisper-base.bin",
			SampleRate:     16000,
			VoiceThreshold: 0.02,
		}

		m.sttService = whisper.NewSTTService(sttConfig)
		if err := m.sttService.Initialize(ctx); err != nil {
			return fmt.Errorf("failed to initialize STT service: %w", err)
		}
		log.Println("STT service initialized")
	}

	// Initialize TTS service if enabled
	if m.config.Features.TTS {
		log.Println("Initializing TTS service...")
		ttsConfig := &piper.Config{
			PiperPath: "", // Let ensurePiper set the correct OS-specific path
			ModelPath: "models/piper",
			Voice:     "en_US-amy-medium",
			Speed:     1.0,
		}

		m.ttsService = piper.NewTTSService(ttsConfig)
		if err := m.ttsService.Initialize(ctx); err != nil {
			return fmt.Errorf("failed to initialize TTS service: %w", err)
		}
		log.Println("TTS service initialized")
	}

	// Initialize embeddings service if enabled
	if m.config.Features.Embeddings {
		log.Println("Initializing embeddings service...")
		embeddingConfig := &minilm.Config{
			ModelPath: m.config.Models.MiniLM.Path,
			Dimension: 384,
		}

		m.embeddingService = minilm.NewEmbeddingService(embeddingConfig)
		if err := m.embeddingService.Initialize(ctx); err != nil {
			return fmt.Errorf("failed to initialize embeddings service: %w", err)
		}
		log.Println("Embeddings service initialized")
	}

	log.Println("Model manager initialized successfully")
	return nil
}

// GetSTTService returns the STT service
func (m *Manager) GetSTTService() *whisper.STTService {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sttService
}

// GetTTSService returns the TTS service
func (m *Manager) GetTTSService() *piper.TTSService {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.ttsService
}

// GetEmbeddingService returns the embeddings service
func (m *Manager) GetEmbeddingService() *minilm.EmbeddingService {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.embeddingService
}

// Shutdown gracefully shuts down all services
func (m *Manager) Shutdown(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	log.Println("Shutting down model manager...")

	var errs []error

	if m.sttService != nil {
		if err := m.sttService.Shutdown(ctx); err != nil {
			errs = append(errs, fmt.Errorf("STT shutdown error: %w", err))
		}
	}

	if m.ttsService != nil {
		if err := m.ttsService.Shutdown(ctx); err != nil {
			errs = append(errs, fmt.Errorf("TTS shutdown error: %w", err))
		}
	}

	if m.embeddingService != nil {
		if err := m.embeddingService.Shutdown(ctx); err != nil {
			errs = append(errs, fmt.Errorf("embeddings shutdown error: %w", err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("shutdown errors: %v", errs)
	}

	log.Println("Model manager shut down successfully")
	return nil
}

// GetStatus returns the status of all services
func (m *Manager) GetStatus() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	status := map[string]interface{}{
		"stt":        m.sttService != nil && m.sttService.IsReady(),
		"tts":        m.ttsService != nil && m.ttsService.IsReady(),
		"embeddings": m.embeddingService != nil && m.embeddingService.IsReady(),
	}

	return status
}
