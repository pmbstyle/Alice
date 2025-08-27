package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

// SynthesizeRequest represents a TTS synthesis request
type SynthesizeRequest struct {
	Text  string  `json:"text"`
	Voice string  `json:"voice,omitempty"`
	Speed float32 `json:"speed,omitempty"`
}

// VoiceResponse represents a voice information response
type VoiceResponse struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Language    string `json:"language"`
	Gender      string `json:"gender"`
}

// SynthesizeSpeech handles TTS synthesis
func (h *Handler) SynthesizeSpeech(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.TTS {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service is disabled")
		return
	}

	ttsService := h.modelManager.GetTTSService()
	if ttsService == nil || !ttsService.IsReady() {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service is not ready")
		return
	}

	var req SynthesizeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Text == "" {
		h.writeError(w, http.StatusBadRequest, "Text is required")
		return
	}

	if req.Voice == "" {
		req.Voice = "en-US-amy-medium"
	}

	audioData, err := ttsService.Synthesize(r.Context(), req.Text, req.Voice)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "TTS synthesis failed: "+err.Error())
		return
	}

	// Convert byte array to number array for frontend compatibility
	audioNumbers := make([]int, len(audioData))
	for i, b := range audioData {
		audioNumbers[i] = int(b)
	}

	response := map[string]interface{}{
		"audio":       audioNumbers,
		"format":      "wav",
		"sample_rate": 22050,
		"duration":    1.0, // Placeholder duration
	}

	h.writeSuccess(w, response)
}

// GetVoices returns available TTS voices
func (h *Handler) GetVoices(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.TTS {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service is disabled")
		return
	}

	ttsService := h.modelManager.GetTTSService()
	if ttsService == nil {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service not available")
		return
	}

	voices := ttsService.GetVoices()
	voiceResponses := make([]VoiceResponse, len(voices))

	for i, voice := range voices {
		voiceResponses[i] = VoiceResponse{
			Name:        voice.Name,
			Description: voice.Description,
			Language:    voice.Language,
			Gender:      voice.Gender,
		}
	}

	// Frontend expects voices in this format
	response := map[string]interface{}{
		"voices": voiceResponses,
	}

	h.writeSuccess(w, response)
}

// SetDefaultVoiceRequest represents a request to set default voice
type SetDefaultVoiceRequest struct {
	Voice string `json:"voice"`
}

// GetDefaultVoice returns the current default voice
func (h *Handler) GetDefaultVoice(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.TTS {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service is disabled")
		return
	}

	ttsService := h.modelManager.GetTTSService()
	if ttsService == nil {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service not available")
		return
	}

	defaultVoice := ttsService.GetDefaultVoice()
	response := map[string]interface{}{
		"default_voice": defaultVoice,
	}

	h.writeSuccess(w, response)
}

// SetDefaultVoice sets the default voice for TTS
func (h *Handler) SetDefaultVoice(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.TTS {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service is disabled")
		return
	}

	ttsService := h.modelManager.GetTTSService()
	if ttsService == nil || !ttsService.IsReady() {
		h.writeError(w, http.StatusServiceUnavailable, "TTS service is not ready")
		return
	}

	var req SetDefaultVoiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Voice == "" {
		h.writeError(w, http.StatusBadRequest, "Voice is required")
		return
	}

	if err := ttsService.SetDefaultVoice(req.Voice); err != nil {
		h.writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	response := map[string]interface{}{
		"message": "Default voice updated successfully",
		"voice":   req.Voice,
	}

	h.writeSuccess(w, response)
}

// RegisterTTSRoutes registers TTS-related routes
func (h *Handler) RegisterTTSRoutes(router *mux.Router) {
	ttsRouter := router.PathPrefix("/api/tts").Subrouter()
	ttsRouter.HandleFunc("/synthesize", h.SynthesizeSpeech).Methods("POST")
	ttsRouter.HandleFunc("/voices", h.GetVoices).Methods("GET")
	ttsRouter.HandleFunc("/default-voice", h.GetDefaultVoice).Methods("GET")
	ttsRouter.HandleFunc("/default-voice", h.SetDefaultVoice).Methods("POST")
}
