package minilm

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// Config holds embeddings configuration
type Config struct {
	ModelPath string
	Dimension int
}

// ServiceInfo contains information about the embeddings service
type ServiceInfo struct {
	Name        string            `json:"name"`
	Version     string            `json:"version"`
	Status      string            `json:"status"`
	Model       string            `json:"model"`
	Dimension   int               `json:"dimension"`
	LastUpdated time.Time         `json:"last_updated"`
	Metadata    map[string]string `json:"metadata"`
}

// EmbeddingService provides text embedding functionality using MiniLM
type EmbeddingService struct {
	mu     sync.RWMutex
	ready  bool
	config *Config
	info   *ServiceInfo
}

// NewEmbeddingService creates a new embedding service
func NewEmbeddingService(config *Config) *EmbeddingService {
	return &EmbeddingService{
		config: config,
		info: &ServiceInfo{
			Name:        "MiniLM Embeddings",
			Version:     "1.0.0",
			Status:      "initializing",
			Model:       "all-MiniLM-L6-v2",
			Dimension:   config.Dimension,
			LastUpdated: time.Now(),
			Metadata:    make(map[string]string),
		},
	}
}

// Initialize initializes the embeddings service
func (s *EmbeddingService) Initialize(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	log.Println("Initializing embeddings service...")

	s.ready = true
	s.info.Status = "ready"
	s.info.LastUpdated = time.Now()

	log.Println("Embeddings service initialized successfully")
	return nil
}

// IsReady returns true if the service is ready
func (s *EmbeddingService) IsReady() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ready
}

// GetInfo returns service information
func (s *EmbeddingService) GetInfo() *ServiceInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	info := *s.info
	info.LastUpdated = time.Now()
	return &info
}

// GenerateEmbedding generates a single embedding
func (s *EmbeddingService) GenerateEmbedding(ctx context.Context, text string) ([]float32, error) {
	if !s.IsReady() {
		return nil, fmt.Errorf("embeddings service is not ready")
	}

	if text == "" {
		return nil, fmt.Errorf("text cannot be empty")
	}

	// In a real implementation, this would use the MiniLM model
	// For now, return a placeholder embedding
	embedding := make([]float32, s.config.Dimension)
	for i := range embedding {
		embedding[i] = float32(i) * 0.1 // Placeholder values
	}
	return embedding, nil
}

// GenerateEmbeddings generates multiple embeddings
func (s *EmbeddingService) GenerateEmbeddings(ctx context.Context, texts []string) ([][]float32, error) {
	if !s.IsReady() {
		return nil, fmt.Errorf("embeddings service is not ready")
	}

	if len(texts) == 0 {
		return nil, fmt.Errorf("texts cannot be empty")
	}

	embeddings := make([][]float32, len(texts))
	for i, text := range texts {
		embedding, err := s.GenerateEmbedding(ctx, text)
		if err != nil {
			return nil, fmt.Errorf("failed to generate embedding for text %d: %w", i, err)
		}
		embeddings[i] = embedding
	}
	return embeddings, nil
}

// ComputeSimilarity computes cosine similarity between two embeddings
func (s *EmbeddingService) ComputeSimilarity(ctx context.Context, embedding1, embedding2 []float32) (float32, error) {
	if len(embedding1) != len(embedding2) {
		return 0, fmt.Errorf("embeddings must have the same dimension")
	}

	if len(embedding1) == 0 {
		return 0, fmt.Errorf("embeddings cannot be empty")
	}

	// Compute dot product
	dotProduct := float32(0)
	for i := range embedding1 {
		dotProduct += embedding1[i] * embedding2[i]
	}

	// Compute magnitudes
	magnitude1 := float32(0)
	magnitude2 := float32(0)
	for i := range embedding1 {
		magnitude1 += embedding1[i] * embedding1[i]
		magnitude2 += embedding2[i] * embedding2[i]
	}

	if magnitude1 == 0 || magnitude2 == 0 {
		return 0, nil
	}

	return dotProduct / (magnitude1 * magnitude2), nil
}

// SearchSimilar finds similar embeddings
func (s *EmbeddingService) SearchSimilar(ctx context.Context, queryEmbedding []float32, candidateEmbeddings [][]float32, topK int) ([]int, []float32, error) {
	if len(queryEmbedding) == 0 {
		return nil, nil, fmt.Errorf("query embedding cannot be empty")
	}

	if len(candidateEmbeddings) == 0 {
		return nil, nil, fmt.Errorf("candidate embeddings cannot be empty")
	}

	if topK <= 0 {
		topK = 5
	}

	// Compute similarities
	similarities := make([]float32, len(candidateEmbeddings))
	indices := make([]int, len(candidateEmbeddings))

	for i, candidate := range candidateEmbeddings {
		similarity, err := s.ComputeSimilarity(ctx, queryEmbedding, candidate)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to compute similarity for candidate %d: %w", i, err)
		}
		similarities[i] = similarity
		indices[i] = i
	}

	// Sort by similarity (descending)
	for i := 0; i < len(similarities)-1; i++ {
		for j := i + 1; j < len(similarities); j++ {
			if similarities[i] < similarities[j] {
				similarities[i], similarities[j] = similarities[j], similarities[i]
				indices[i], indices[j] = indices[j], indices[i]
			}
		}
	}

	// Return top K
	if topK > len(similarities) {
		topK = len(similarities)
	}

	return indices[:topK], similarities[:topK], nil
}

// Shutdown gracefully shuts down the embeddings service
func (s *EmbeddingService) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ready = false
	s.info.Status = "stopped"
	s.info.LastUpdated = time.Now()

	return nil
}
