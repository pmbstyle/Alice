package models

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"

	"alice-backend/internal/config"
	grpcPiper "alice-backend/internal/grpc/piper"
	grpcWhisper "alice-backend/internal/grpc/whisper"
	"alice-backend/internal/minilm"
	"alice-backend/internal/piper"
	"alice-backend/internal/whisper"
)

// Manager coordinates all AI services
type Manager struct {
	config            *config.Config
	sttService        *whisper.STTService
	ttsService        *piper.TTSService
	embeddingService  *minilm.OnnxEmbeddingService
	whisperGRPCClient *grpcWhisper.Client
	piperGRPCClient   *grpcPiper.Client
	mu                sync.RWMutex
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

		// Check if HTTP mode is enabled via environment variables (preferred over gRPC)
		if os.Getenv("WHISPER_USE_HTTP") == "true" {
			httpAddr := os.Getenv("WHISPER_HTTP_ADDR")
			if httpAddr == "" {
				httpAddr = "http://localhost:8082"
			}

			log.Printf("Attempting to connect to Whisper HTTP server at %s...", httpAddr)
			httpClient := whisper.NewHttpClient(httpAddr)

			if !httpClient.IsConnected() {
				log.Printf("Warning: Failed to connect to Whisper HTTP server")
				log.Println("STT service will use CLI fallback mode")
			} else {
				// Set the HTTP client in the STT service
				m.sttService.SetHTTPClient(httpClient)
				log.Println("✓ Successfully connected to Whisper HTTP server")
			}
		} else if os.Getenv("WHISPER_USE_GRPC") == "true" {
			// Fallback to gRPC mode if HTTP not enabled
			grpcAddr := os.Getenv("WHISPER_GRPC_ADDR")
			if grpcAddr == "" {
				grpcAddr = "localhost:50051"
			}

			log.Printf("Attempting to connect to Whisper gRPC service at %s...", grpcAddr)
			m.whisperGRPCClient = grpcWhisper.NewClient(grpcAddr)

			if err := m.whisperGRPCClient.ConnectWithRetry(ctx, 5); err != nil {
				log.Printf("Warning: Failed to connect to Whisper gRPC service: %v", err)
				log.Println("STT service will use CLI fallback mode")
			} else {
				// Set the gRPC client in the STT service
				m.sttService.SetGRPCClient(m.whisperGRPCClient)
				log.Println("✓ Successfully connected to Whisper gRPC service")
			}
		} else {
			log.Println("Whisper remote mode not enabled, using CLI mode")
		}

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

		// Try to connect to Piper gRPC service if enabled
		if os.Getenv("PIPER_USE_GRPC") == "true" {
			grpcAddr := os.Getenv("PIPER_GRPC_ADDR")
			if grpcAddr == "" {
				grpcAddr = "localhost:50052"
			}

			log.Printf("Attempting to connect to Piper gRPC service at %s...", grpcAddr)
			m.piperGRPCClient = grpcPiper.NewClient(grpcAddr)

			if err := m.piperGRPCClient.ConnectWithRetry(ctx, 5); err != nil {
				log.Printf("Warning: Failed to connect to Piper gRPC service: %v", err)
				log.Println("TTS service will use CLI fallback mode")
			} else {
				// Set the gRPC client in the TTS service
				m.ttsService.SetGRPCClient(m.piperGRPCClient)
				log.Println("✓ Successfully connected to Piper gRPC service")
			}
		} else {
			log.Println("Piper gRPC mode not enabled, using CLI mode")
		}

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

		// Always use ONNX implementation with automatic model downloading
		m.embeddingService = minilm.NewOnnxEmbeddingService(embeddingConfig)
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
func (m *Manager) GetEmbeddingService() *minilm.OnnxEmbeddingService {
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

	// Close Whisper gRPC client if connected
	if m.whisperGRPCClient != nil {
		if err := m.whisperGRPCClient.Close(); err != nil {
			errs = append(errs, fmt.Errorf("Whisper gRPC client close error: %w", err))
		}
	}

	// Close Piper gRPC client if connected
	if m.piperGRPCClient != nil {
		if err := m.piperGRPCClient.Close(); err != nil {
			errs = append(errs, fmt.Errorf("Piper gRPC client close error: %w", err))
		}
	}

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
