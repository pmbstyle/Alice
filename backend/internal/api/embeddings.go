package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

// EmbeddingRequest represents a single embedding request
type EmbeddingRequest struct {
	Text string `json:"text"`
}

// EmbeddingResponse represents a single embedding response
type EmbeddingResponse struct {
	Embedding []float32 `json:"embedding"`
	Text      string    `json:"text"`
}

// BatchEmbeddingRequest represents a batch embedding request
type BatchEmbeddingRequest struct {
	Texts []string `json:"texts"`
}

// BatchEmbeddingResponse represents a batch embedding response
type BatchEmbeddingResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
}

// SimilarityRequest represents a similarity computation request
type SimilarityRequest struct {
	Embedding1 []float32 `json:"embedding1"`
	Embedding2 []float32 `json:"embedding2"`
}

// SimilarityResponse represents a similarity computation response
type SimilarityResponse struct {
	Similarity float32 `json:"similarity"`
}

// SearchRequest represents a similarity search request
type SearchRequest struct {
	QueryEmbedding      []float32   `json:"query_embedding"`
	CandidateEmbeddings [][]float32 `json:"candidate_embeddings"`
	TopK                int         `json:"top_k,omitempty"`
}

// SearchResponse represents a similarity search response
type SearchResponse struct {
	Indices      []int     `json:"indices"`
	Similarities []float32 `json:"similarities"`
}

// GenerateEmbedding handles single embedding generation
func (h *Handler) GenerateEmbedding(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.Embeddings {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is disabled")
		return
	}

	embeddingService := h.modelManager.GetEmbeddingService()
	if embeddingService == nil || !embeddingService.IsReady() {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is not ready")
		return
	}

	var req EmbeddingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Text == "" {
		h.writeError(w, http.StatusBadRequest, "Text is required")
		return
	}

	embedding, err := embeddingService.GenerateEmbedding(r.Context(), req.Text)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Embedding generation failed: "+err.Error())
		return
	}

	h.writeSuccess(w, EmbeddingResponse{
		Embedding: embedding,
		Text:      req.Text,
	})
}

// GenerateEmbeddings handles batch embedding generation
func (h *Handler) GenerateEmbeddings(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.Embeddings {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is disabled")
		return
	}

	embeddingService := h.modelManager.GetEmbeddingService()
	if embeddingService == nil || !embeddingService.IsReady() {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is not ready")
		return
	}

	var req BatchEmbeddingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.Texts) == 0 {
		h.writeError(w, http.StatusBadRequest, "Texts array is required")
		return
	}

	embeddings, err := embeddingService.GenerateEmbeddings(r.Context(), req.Texts)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Batch embedding generation failed: "+err.Error())
		return
	}

	h.writeSuccess(w, BatchEmbeddingResponse{
		Embeddings: embeddings,
	})
}

// ComputeSimilarity handles similarity computation
func (h *Handler) ComputeSimilarity(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.Embeddings {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is disabled")
		return
	}

	embeddingService := h.modelManager.GetEmbeddingService()
	if embeddingService == nil || !embeddingService.IsReady() {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is not ready")
		return
	}

	var req SimilarityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.Embedding1) == 0 || len(req.Embedding2) == 0 {
		h.writeError(w, http.StatusBadRequest, "Both embeddings are required")
		return
	}

	similarity, err := embeddingService.ComputeSimilarity(r.Context(), req.Embedding1, req.Embedding2)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Similarity computation failed: "+err.Error())
		return
	}

	h.writeSuccess(w, SimilarityResponse{
		Similarity: similarity,
	})
}

// SearchSimilar handles similarity search
func (h *Handler) SearchSimilar(w http.ResponseWriter, r *http.Request) {
	if !h.config.Features.Embeddings {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is disabled")
		return
	}

	embeddingService := h.modelManager.GetEmbeddingService()
	if embeddingService == nil || !embeddingService.IsReady() {
		h.writeError(w, http.StatusServiceUnavailable, "Embeddings service is not ready")
		return
	}

	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.QueryEmbedding) == 0 {
		h.writeError(w, http.StatusBadRequest, "Query embedding is required")
		return
	}

	if len(req.CandidateEmbeddings) == 0 {
		h.writeError(w, http.StatusBadRequest, "Candidate embeddings are required")
		return
	}

	indices, similarities, err := embeddingService.SearchSimilar(
		r.Context(),
		req.QueryEmbedding,
		req.CandidateEmbeddings,
		req.TopK,
	)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Similarity search failed: "+err.Error())
		return
	}

	h.writeSuccess(w, SearchResponse{
		Indices:      indices,
		Similarities: similarities,
	})
}

// GetEmbeddingsInfo returns embeddings service information
func (h *Handler) GetEmbeddingsInfo(w http.ResponseWriter, r *http.Request) {
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

// RegisterEmbeddingsRoutes registers embeddings-related routes
func (h *Handler) RegisterEmbeddingsRoutes(router *mux.Router) {
	embeddingsRouter := router.PathPrefix("/api/embeddings").Subrouter()

	embeddingsRouter.HandleFunc("/generate", h.GenerateEmbedding).Methods("POST")
	embeddingsRouter.HandleFunc("/batch", h.GenerateEmbeddings).Methods("POST")
	embeddingsRouter.HandleFunc("/similarity", h.ComputeSimilarity).Methods("POST")
	embeddingsRouter.HandleFunc("/search", h.SearchSimilar).Methods("POST")
	embeddingsRouter.HandleFunc("/info", h.GetEmbeddingsInfo).Methods("GET")
}
