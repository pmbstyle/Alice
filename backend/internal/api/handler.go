package api

import (
	"encoding/json"
	"net/http"

	"alice-backend/internal/config"
	"alice-backend/internal/models"
)

// Handler provides HTTP handlers for all API endpoints
type Handler struct {
	config       *config.Config
	modelManager *models.Manager
}

// NewHandler creates a new API handler
func NewHandler(config *config.Config, modelManager *models.Manager) *Handler {
	return &Handler{
		config:       config,
		modelManager: modelManager,
	}
}

// writeSuccess writes a successful JSON response
func (h *Handler) writeSuccess(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

// writeError writes an error JSON response
func (h *Handler) writeError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   message,
	})
}

// writeBinary writes a binary response
func (h *Handler) writeBinary(w http.ResponseWriter, data []byte, contentType string) {
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// HealthCheck returns the health status of the backend
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"status": "healthy",
		"services": map[string]bool{
			"stt":        h.modelManager.GetSTTService() != nil && h.modelManager.GetSTTService().IsReady(),
			"tts":        h.modelManager.GetTTSService() != nil && h.modelManager.GetTTSService().IsReady(),
			"embeddings": h.modelManager.GetEmbeddingService() != nil && h.modelManager.GetEmbeddingService().IsReady(),
		},
	}
	h.writeSuccess(w, response)
}

// GetConfig returns the current configuration
func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	h.writeSuccess(w, h.config)
}

// STTReady checks if STT service is ready
func (h *Handler) STTReady(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.STT {
		h.writeError(w, http.StatusServiceUnavailable, "STT service is disabled")
		return
	}

	sttService := h.modelManager.GetSTTService()
	if sttService == nil || !sttService.IsReady() {
		h.writeError(w, http.StatusServiceUnavailable, "STT service is not ready")
		return
	}

	h.writeSuccess(w, map[string]bool{"ready": true})
}

// STTInfo returns STT service information
func (h *Handler) STTInfo(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.STT {
		h.writeError(w, http.StatusServiceUnavailable, "STT service is disabled")
		return
	}

	sttService := h.modelManager.GetSTTService()
	if sttService == nil {
		h.writeError(w, http.StatusServiceUnavailable, "STT service not available")
		return
	}

	info := sttService.GetInfo()
	h.writeSuccess(w, info)
}

// TTSReady checks if TTS service is ready
func (h *Handler) TTSReady(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.TTS {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service is disabled")
		return
	}

	ttsService := h.modelManager.GetTTSService()
	if ttsService == nil || !ttsService.IsReady() {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service is not ready")
		return
	}

	h.writeSuccess(w, map[string]bool{"ready": true})
}

// TTSInfo returns TTS service information
func (h *Handler) TTSInfo(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.TTS {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service is disabled")
		return
	}

	ttsService := h.modelManager.GetTTSService()
	if ttsService == nil {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service not available")
		return
	}

	info := ttsService.GetInfo()
	h.writeSuccess(w, info)
}

// EmbeddingsReady checks if embeddings service is ready
func (h *Handler) EmbeddingsReady(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.Embeddings {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is disabled")
		return
	}

	embeddingService := h.modelManager.GetEmbeddingService()
	if embeddingService == nil || !embeddingService.IsReady() {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is not ready")
		return
	}

	h.writeSuccess(w, map[string]bool{"ready": true})
}

// EmbeddingsInfo returns embeddings service information
func (h *Handler) EmbeddingsInfo(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.Embeddings {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is disabled")
		return
	}

	embeddingService := h.modelManager.GetEmbeddingService()
	if embeddingService == nil {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service not available")
		return
	}

	info := embeddingService.GetInfo()
	h.writeSuccess(w, info)
}
