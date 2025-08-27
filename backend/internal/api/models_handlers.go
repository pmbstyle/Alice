package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

// DownloadModel handles model download requests
func (h *Handler) DownloadModel(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	service := vars["service"]

	var req DownloadModelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	response := DownloadModelResponse{
		Success: true,
		Message: "Model download started for service: " + service,
	}

	h.writeSuccess(w, response)
}

// GetModelStatus returns the status of all models
func (h *Handler) GetModelStatus(w http.ResponseWriter, r *http.Request) {
	response := ModelsStatusResponse{
		STT: ModelStatus{
			Installed:   h.modelManager.GetSTTService() != nil && h.modelManager.GetSTTService().IsReady(),
			Downloading: false,
		},
		TTS: ModelStatus{
			Installed:   h.modelManager.GetTTSService() != nil && h.modelManager.GetTTSService().IsReady(),
			Downloading: false,
		},
		Embeddings: ModelStatus{
			Installed:   h.modelManager.GetEmbeddingService() != nil && h.modelManager.GetEmbeddingService().IsReady(),
			Downloading: false,
		},
	}

	h.writeSuccess(w, response)
}

// GetModelDownloadStatus returns the download status of all models
func (h *Handler) GetModelDownloadStatus(w http.ResponseWriter, r *http.Request) {
	response := DownloadStatusResponse{
		STT: ModelStatus{
			Installed:   h.modelManager.GetSTTService() != nil && h.modelManager.GetSTTService().IsReady(),
			Downloading: false,
		},
		TTS: ModelStatus{
			Installed:   h.modelManager.GetTTSService() != nil && h.modelManager.GetTTSService().IsReady(),
			Downloading: false,
		},
		Embeddings: ModelStatus{
			Installed:   h.modelManager.GetEmbeddingService() != nil && h.modelManager.GetEmbeddingService().IsReady(),
			Downloading: false,
		},
	}

	h.writeSuccess(w, response)
}
