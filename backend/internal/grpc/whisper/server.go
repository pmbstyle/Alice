package whisper

import (
	"context"
	"log"
	"time"

	whisperv1 "alice-backend/proto/whisper/v1"
	"alice-backend/internal/whisper"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Server implements the WhisperService gRPC server
type Server struct {
	whisperv1.UnimplementedWhisperServiceServer
	sttService *whisper.STTService
}

// NewServer creates a new WhisperService gRPC server
func NewServer(sttService *whisper.STTService) *Server {
	return &Server{
		sttService: sttService,
	}
}

// HealthCheck returns the health status of the service
func (s *Server) HealthCheck(ctx context.Context, req *whisperv1.HealthCheckRequest) (*whisperv1.HealthCheckResponse, error) {
	log.Println("[gRPC] HealthCheck called")

	modelLoaded := s.sttService.IsReady()

	status := "unhealthy"
	if modelLoaded {
		status = "healthy"
	}

	info := s.sttService.GetInfo()
	modelPath := info.Model

	return &whisperv1.HealthCheckResponse{
		Status:      status,
		ModelLoaded: modelLoaded,
		ModelPath:   modelPath,
	}, nil
}

// Transcribe converts audio data to text
func (s *Server) Transcribe(ctx context.Context, req *whisperv1.TranscribeRequest) (*whisperv1.TranscribeResponse, error) {
	log.Printf("[gRPC] Transcribe called with %d bytes of audio, language: %s", len(req.AudioData), req.Language)

	// Validate request
	if len(req.AudioData) == 0 {
		return nil, status.Error(codes.InvalidArgument, "audio_data cannot be empty")
	}

	// Check if service is ready
	if !s.sttService.IsReady() {
		return nil, status.Error(codes.Unavailable, "Whisper STT service is not ready")
	}

	// Start timing
	startTime := time.Now()

	// Perform transcription using the existing STT service
	text, err := s.sttService.TranscribeAudioWithLanguage(ctx, req.AudioData, req.Language)
	if err != nil {
		log.Printf("[gRPC] Transcription failed: %v", err)
		return nil, status.Errorf(codes.Internal, "transcription failed: %v", err)
	}

	// Calculate duration
	duration := time.Since(startTime)
	durationMs := duration.Milliseconds()

	log.Printf("[gRPC] Transcription completed in %dms: %s", durationMs, text)

	// Build response
	response := &whisperv1.TranscribeResponse{
		Text:             text,
		LanguageDetected: req.Language, // Whisper CLI doesn't return detected language directly
		Confidence:       0.95,          // Whisper doesn't provide confidence scores via CLI
		DurationMs:       durationMs,
	}

	return response, nil
}
