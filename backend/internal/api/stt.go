package api

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gorilla/mux"
)

// TranscribeRequest represents a transcription request (JSON format)
type TranscribeRequest struct {
	AudioData  []float32 `json:"audio_data,omitempty"`
	SampleRate int       `json:"sample_rate,omitempty"`
	Language   string    `json:"language,omitempty"`
}

// TranscribeResponse represents a transcription response
type TranscribeResponse struct {
	Text       string  `json:"text"`
	Confidence float32 `json:"confidence"`
	Duration   float32 `json:"duration,omitempty"`
}

// TranscribeAudio handles audio transcription (supports both multipart and JSON)
func (h *Handler) TranscribeAudio(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.STT {
		h.writeError(w, http.StatusServiceUnavailable, "STT service is disabled")
		return
	}

	sttService := h.modelManager.GetSTTService()
	if sttService == nil || !sttService.IsReady() {
		h.writeError(w, http.StatusServiceUnavailable, "STT service is not ready")
		return
	}

	var audioData []byte
	var err error

	// Check Content-Type to determine request format
	contentType := r.Header.Get("Content-Type")
	
	if contentType == "application/json" {
		// Handle JSON request (from frontend audio processing)
		var req TranscribeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			h.writeError(w, http.StatusBadRequest, "Invalid JSON request body")
			return
		}

		if len(req.AudioData) == 0 {
			h.writeError(w, http.StatusBadRequest, "Audio data is required")
			return
		}

		// Convert Float32Array to 16-bit PCM bytes
		audioData = make([]byte, len(req.AudioData)*2)
		for i, sample := range req.AudioData {
			// Clamp sample to [-1, 1] range
			if sample > 1.0 {
				sample = 1.0
			} else if sample < -1.0 {
				sample = -1.0
			}
			
			// Convert float32 to 16-bit signed integer
			sample16 := int16(sample * 32767)
			
			// Write as little-endian 16-bit
			audioData[i*2] = byte(sample16 & 0xFF)
			audioData[i*2+1] = byte((sample16 >> 8) & 0xFF)
		}
	} else {
		// Handle multipart form (file upload)
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			h.writeError(w, http.StatusBadRequest, "Failed to parse multipart form")
			return
		}

		file, _, err := r.FormFile("file")
		if err != nil {
			// Try "audio" field for backward compatibility
			file, _, err = r.FormFile("audio")
			if err != nil {
				h.writeError(w, http.StatusBadRequest, "Failed to get audio file (expected 'file' or 'audio' field)")
				return
			}
		}
		defer file.Close()

		// Read audio data
		audioData, err = io.ReadAll(file)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, "Failed to read audio file")
			return
		}
	}

	// Transcribe audio
	text, err := sttService.TranscribeAudio(r.Context(), audioData)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Transcription failed: "+err.Error())
		return
	}

	h.writeSuccess(w, TranscribeResponse{
		Text:       text,
		Confidence: 0.95, // Placeholder confidence
		Duration:   1.0,  // Placeholder duration
	})
}

// RegisterSTTRoutes registers STT-related routes
func (h *Handler) RegisterSTTRoutes(router *mux.Router) {
	sttRouter := router.PathPrefix("/api/stt").Subrouter()
	sttRouter.HandleFunc("/transcribe", h.TranscribeAudio).Methods("POST")
}
