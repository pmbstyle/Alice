package minilm

import (
	"context"
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

// EmbeddingProvider defines the interface for embedding services
type EmbeddingProvider interface {
	// Initialize initializes the embeddings service
	Initialize(ctx context.Context) error

	// IsReady returns true if the service is ready
	IsReady() bool

	// GetInfo returns service information
	GetInfo() *ServiceInfo

	// GenerateEmbedding generates a single embedding
	GenerateEmbedding(ctx context.Context, text string) ([]float32, error)

	// GenerateEmbeddings generates multiple embeddings
	GenerateEmbeddings(ctx context.Context, texts []string) ([][]float32, error)

	// ComputeSimilarity computes cosine similarity between two embeddings
	ComputeSimilarity(ctx context.Context, embedding1, embedding2 []float32) (float32, error)

	// SearchSimilar finds similar embeddings
	SearchSimilar(ctx context.Context, queryEmbedding []float32, candidateEmbeddings [][]float32, topK int) ([]int, []float32, error)

	// Shutdown gracefully shuts down the embeddings service
	Shutdown(ctx context.Context) error
}