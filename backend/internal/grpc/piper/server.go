package piper

import (
	"context"
	"fmt"
	"log"
	"time"

	"alice-backend/internal/piper"
	piperv1 "alice-backend/proto/piper/v1"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Server implements the Piper gRPC service
type Server struct {
	piperv1.UnimplementedPiperServiceServer
	ttsService *piper.TTSService
}

// NewServer creates a new Piper gRPC server
func NewServer(ttsService *piper.TTSService) *Server {
	return &Server{
		ttsService: ttsService,
	}
}

// HealthCheck verifies the service is running and models are loaded
func (s *Server) HealthCheck(ctx context.Context, req *piperv1.HealthCheckRequest) (*piperv1.HealthCheckResponse, error) {
	log.Println("[gRPC] HealthCheck called")

	isReady := s.ttsService.IsReady()
	statusStr := "unhealthy"
	if isReady {
		statusStr = "healthy"
	}

	voices := s.ttsService.GetVoices()
	voiceNames := make([]string, len(voices))
	for i, v := range voices {
		voiceNames[i] = v.Name
	}

	log.Printf("[gRPC] Health status: %s, voices: %d", statusStr, len(voiceNames))

	return &piperv1.HealthCheckResponse{
		Status:           statusStr,
		ModelLoaded:      isReady,
		AvailableVoices:  voiceNames,
	}, nil
}

// Synthesize converts text to speech audio
func (s *Server) Synthesize(ctx context.Context, req *piperv1.SynthesizeRequest) (*piperv1.SynthesizeResponse, error) {
	log.Printf("[gRPC] Synthesize called for voice: %s, text length: %d chars", req.Voice, len(req.Text))

	// Validate request
	if req.Text == "" {
		return nil, status.Error(codes.InvalidArgument, "text cannot be empty")
	}

	// Check if service is ready
	if !s.ttsService.IsReady() {
		return nil, status.Error(codes.Unavailable, "Piper TTS service is not ready")
	}

	// Start timing
	startTime := time.Now()

	// Perform synthesis
	audioData, err := s.ttsService.Synthesize(ctx, req.Text, req.Voice)
	if err != nil {
		log.Printf("[gRPC] Synthesis failed: %v", err)
		return nil, status.Errorf(codes.Internal, "synthesis failed: %v", err)
	}

	// Calculate duration
	duration := time.Since(startTime)
	durationMs := duration.Milliseconds()

	log.Printf("[gRPC] Synthesis completed in %dms, audio size: %d bytes", durationMs, len(audioData))

	// Build response
	response := &piperv1.SynthesizeResponse{
		AudioData:  audioData,
		SampleRate: 22050, // Piper default sample rate
		DurationMs: durationMs,
	}

	return response, nil
}

// GetVoices returns the list of available voice models
func (s *Server) GetVoices(ctx context.Context, req *piperv1.GetVoicesRequest) (*piperv1.GetVoicesResponse, error) {
	log.Println("[gRPC] GetVoices called")

	voices := s.ttsService.GetVoices()
	if len(voices) == 0 {
		log.Println("[gRPC] Warning: No voices available")
	}

	protoVoices := make([]*piperv1.Voice, len(voices))
	for i, v := range voices {
		protoVoices[i] = &piperv1.Voice{
			Name:        v.Name,
			Language:    v.Language,
			Gender:      v.Gender,
			Quality:     v.Quality,
			SampleRate:  int32(v.SampleRate),
			Description: v.Description,
		}
	}

	log.Printf("[gRPC] Returning %d voices", len(protoVoices))

	return &piperv1.GetVoicesResponse{
		Voices: protoVoices,
	}, nil
}

// String returns a string representation of the server
func (s *Server) String() string {
	if s.ttsService == nil {
		return "PiperServer{ttsService: nil}"
	}
	voices := s.ttsService.GetVoices()
	return fmt.Sprintf("PiperServer{voices: %d, ready: %v}", len(voices), s.ttsService.IsReady())
}
