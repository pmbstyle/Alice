package minilm

import (
	"context"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/daulet/tokenizers"
	ort "github.com/yalue/onnxruntime_go"
)

// OnnxEmbeddingService provides text embedding functionality using ONNX Runtime
type OnnxEmbeddingService struct {
	mu        sync.RWMutex
	ready     bool
	config    *Config
	info      *ServiceInfo
	tokenizer *tokenizers.Tokenizer
	session   *ort.AdvancedSession
}

// Ensure OnnxEmbeddingService implements EmbeddingProvider
var _ EmbeddingProvider = (*OnnxEmbeddingService)(nil)

// NewOnnxEmbeddingService creates a new ONNX-based embedding service
func NewOnnxEmbeddingService(config *Config) *OnnxEmbeddingService {
	return &OnnxEmbeddingService{
		config: config,
		info: &ServiceInfo{
			Name:        "ONNX MiniLM Embeddings",
			Version:     "1.0.0",
			Status:      "initializing",
			Model:       "all-MiniLM-L6-v2",
			Dimension:   config.Dimension,
			LastUpdated: time.Now(),
			Metadata:    make(map[string]string),
		},
	}
}

// Initialize initializes the ONNX embeddings service
func (s *OnnxEmbeddingService) Initialize(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	log.Println("Initializing ONNX embeddings service...")

	// Initialize ONNX Runtime environment
	err := ort.InitializeEnvironment()
	if err != nil {
		return fmt.Errorf("failed to initialize ONNX Runtime environment: %w", err)
	}

	// Set library path based on platform
	// This will be updated once we bundle the libraries
	libPath := s.getLibraryPath()
	if libPath != "" {
		ort.SetSharedLibraryPath(libPath)
		log.Printf("Set ONNX Runtime library path: %s", libPath)
	}

	// Ensure model files are available (download if needed)
	err = s.ensureModelFiles()
	if err != nil {
		return fmt.Errorf("failed to ensure model files: %w", err)
	}

	// Initialize tokenizer
	tokenizerPath := filepath.Join(s.config.ModelPath, "tokenizer.json")
	s.tokenizer, err = tokenizers.FromFile(tokenizerPath)
	if err != nil {
		// Try to load from HuggingFace Hub as fallback
		log.Printf("Failed to load tokenizer from file %s, trying HuggingFace Hub...", tokenizerPath)
		s.tokenizer, err = tokenizers.FromPretrained("sentence-transformers/all-MiniLM-L6-v2")
		if err != nil {
			return fmt.Errorf("failed to load tokenizer: %w", err)
		}
		log.Println("Loaded tokenizer from HuggingFace Hub")
	} else {
		log.Printf("Loaded tokenizer from file: %s", tokenizerPath)
	}

	// Initialize ONNX session
	modelPath := filepath.Join(s.config.ModelPath, "model.onnx")
	inputNames := []string{"input_ids", "attention_mask", "token_type_ids"}
	outputNames := []string{"last_hidden_state"}

	// Create empty tensors for initialization
	// We'll use dynamic shapes, so these are just placeholders
	maxSeqLength := int64(512) // Maximum sequence length for BERT-based models
	batchSize := int64(1)

	// Create input tensors
	inputShape := ort.NewShape(batchSize, maxSeqLength)
	inputTensor, err := ort.NewEmptyTensor[int64](inputShape)
	if err != nil {
		return fmt.Errorf("failed to create input tensor: %w", err)
	}
	defer inputTensor.Destroy()

	attentionTensor, err := ort.NewEmptyTensor[int64](inputShape)
	if err != nil {
		return fmt.Errorf("failed to create attention tensor: %w", err)
	}
	defer attentionTensor.Destroy()

	tokenTypeTensor, err := ort.NewEmptyTensor[int64](inputShape)
	if err != nil {
		return fmt.Errorf("failed to create token type tensor: %w", err)
	}
	defer tokenTypeTensor.Destroy()

	// Create output tensor
	// For all-MiniLM-L6-v2, hidden size is 384
	outputShape := ort.NewShape(batchSize, maxSeqLength, int64(s.config.Dimension))
	outputTensor, err := ort.NewEmptyTensor[float32](outputShape)
	if err != nil {
		return fmt.Errorf("failed to create output tensor: %w", err)
	}
	defer outputTensor.Destroy()

	// Create session
	s.session, err = ort.NewAdvancedSession(modelPath,
		inputNames, outputNames,
		[]ort.Value{inputTensor, attentionTensor, tokenTypeTensor},
		[]ort.Value{outputTensor}, nil)
	if err != nil {
		return fmt.Errorf("failed to create ONNX session: %w", err)
	}

	s.ready = true
	s.info.Status = "ready"
	s.info.LastUpdated = time.Now()
	s.info.Metadata["onnx_runtime"] = "enabled"
	s.info.Metadata["tokenizer"] = "sentence-transformers/all-MiniLM-L6-v2"

	log.Println("ONNX embeddings service initialized successfully")
	return nil
}

// getLibraryPath returns the platform-specific library path
func (s *OnnxEmbeddingService) getLibraryPath() string {
	// Determine platform-specific library name and path
	var libName string
	var platformDir string

	switch {
	case filepath.Base(os.Args[0]) == "main" || filepath.Base(os.Args[0]) == "main.exe":
		// Development mode - libraries should be in backend/lib
		switch {
		case contains(os.Getenv("GOOS"), "windows") || contains(runtime.GOOS, "windows"):
			libName = "onnxruntime.dll"
			platformDir = "win32-x64"
		case contains(os.Getenv("GOOS"), "darwin") || contains(runtime.GOOS, "darwin"):
			libName = "libonnxruntime.dylib"
			if contains(os.Getenv("GOARCH"), "arm64") || contains(runtime.GOARCH, "arm64") {
				platformDir = "darwin-arm64"
			} else {
				platformDir = "darwin-x64"
			}
		default:
			libName = "libonnxruntime.so"
			platformDir = "linux-x64"
		}
		return filepath.Join("lib", platformDir, libName)
	default:
		// Production mode - libraries should be bundled with the app
		execPath, err := os.Executable()
		if err != nil {
			log.Printf("Failed to get executable path: %v", err)
			return ""
		}

		appDir := filepath.Dir(execPath)
		// In Electron apps, libraries are typically in resources/backend/lib
		baseDir := filepath.Join(appDir, "..", "resources", "backend", "lib")

		switch runtime.GOOS {
		case "windows":
			libName = "onnxruntime.dll"
			platformDir = "win32-x64"
		case "darwin":
			libName = "libonnxruntime.dylib"
			if runtime.GOARCH == "arm64" {
				platformDir = "darwin-arm64"
			} else {
				platformDir = "darwin-x64"
			}
		default:
			libName = "libonnxruntime.so"
			platformDir = "linux-x64"
		}

		return filepath.Join(baseDir, platformDir, libName)
	}
}

// contains checks if a string contains a substring (case-insensitive)
func contains(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
}

// IsReady returns true if the service is ready
func (s *OnnxEmbeddingService) IsReady() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ready
}

// GetInfo returns service information
func (s *OnnxEmbeddingService) GetInfo() *ServiceInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	info := *s.info
	info.LastUpdated = time.Now()
	return &info
}

// GenerateEmbedding generates a single embedding using ONNX Runtime
func (s *OnnxEmbeddingService) GenerateEmbedding(ctx context.Context, text string) ([]float32, error) {
	if !s.IsReady() {
		return nil, fmt.Errorf("embeddings service is not ready")
	}

	if text == "" {
		return nil, fmt.Errorf("text cannot be empty")
	}

	// Tokenize the input text
	encoding := s.tokenizer.EncodeWithOptions(text, true,
		tokenizers.WithReturnAttentionMask(),
		tokenizers.WithReturnTypeIDs())

	// Convert to int64 for ONNX
	inputIDs := make([]int64, len(encoding.IDs))
	attentionMask := make([]int64, len(encoding.AttentionMask))
	tokenTypeIDs := make([]int64, len(encoding.TypeIDs))

	for i, id := range encoding.IDs {
		inputIDs[i] = int64(id)
	}
	for i, mask := range encoding.AttentionMask {
		attentionMask[i] = int64(mask)
	}
	for i, typeID := range encoding.TypeIDs {
		tokenTypeIDs[i] = int64(typeID)
	}

	// Create tensors for this specific input
	seqLen := int64(len(inputIDs))
	batchSize := int64(1)

	inputShape := ort.NewShape(batchSize, seqLen)
	inputTensor, err := ort.NewTensor(inputShape, inputIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to create input tensor: %w", err)
	}
	defer inputTensor.Destroy()

	attentionTensor, err := ort.NewTensor(inputShape, attentionMask)
	if err != nil {
		return nil, fmt.Errorf("failed to create attention tensor: %w", err)
	}
	defer attentionTensor.Destroy()

	tokenTypeTensor, err := ort.NewTensor(inputShape, tokenTypeIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to create token type tensor: %w", err)
	}
	defer tokenTypeTensor.Destroy()

	// Create output tensor
	outputShape := ort.NewShape(batchSize, seqLen, int64(s.config.Dimension))
	outputTensor, err := ort.NewEmptyTensor[float32](outputShape)
	if err != nil {
		return nil, fmt.Errorf("failed to create output tensor: %w", err)
	}
	defer outputTensor.Destroy()

	// Create temporary session for this inference
	inputNames := []string{"input_ids", "attention_mask", "token_type_ids"}
	outputNames := []string{"last_hidden_state"}

	modelPath := filepath.Join(s.config.ModelPath, "model.onnx")
	session, err := ort.NewAdvancedSession(modelPath,
		inputNames, outputNames,
		[]ort.Value{inputTensor, attentionTensor, tokenTypeTensor},
		[]ort.Value{outputTensor}, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}
	defer session.Destroy()

	// Run inference
	err = session.Run()
	if err != nil {
		return nil, fmt.Errorf("ONNX inference failed: %w", err)
	}

	// Get output data
	outputData := outputTensor.GetData()

	// Perform mean pooling with attention mask
	embedding := s.meanPooling(outputData, attentionMask, int(seqLen), s.config.Dimension)

	// Normalize the embedding
	embedding = s.normalize(embedding)

	return embedding, nil
}

// meanPooling performs mean pooling on the token embeddings with attention mask
func (s *OnnxEmbeddingService) meanPooling(hiddenStates []float32, attentionMask []int64, seqLen, hiddenSize int) []float32 {
	embedding := make([]float32, hiddenSize)
	sumMask := float32(0)

	// Sum the embeddings for non-masked tokens
	for i := 0; i < seqLen; i++ {
		if attentionMask[i] == 1 {
			for j := 0; j < hiddenSize; j++ {
				embedding[j] += hiddenStates[i*hiddenSize+j]
			}
			sumMask += 1.0
		}
	}

	// Average the embeddings
	if sumMask > 0 {
		for j := 0; j < hiddenSize; j++ {
			embedding[j] /= sumMask
		}
	}

	return embedding
}

// normalize applies L2 normalization to the embedding
func (s *OnnxEmbeddingService) normalize(embedding []float32) []float32 {
	norm := float32(0)
	for _, val := range embedding {
		norm += val * val
	}
	norm = float32(math.Sqrt(float64(norm)))

	if norm > 0 {
		for i := range embedding {
			embedding[i] /= norm
		}
	}

	return embedding
}

// GenerateEmbeddings generates multiple embeddings
func (s *OnnxEmbeddingService) GenerateEmbeddings(ctx context.Context, texts []string) ([][]float32, error) {
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
func (s *OnnxEmbeddingService) ComputeSimilarity(ctx context.Context, embedding1, embedding2 []float32) (float32, error) {
	if len(embedding1) != len(embedding2) {
		return 0, fmt.Errorf("embeddings must have the same dimension")
	}

	if len(embedding1) == 0 {
		return 0, fmt.Errorf("embeddings cannot be empty")
	}

	// Compute dot product (cosine similarity for normalized vectors)
	dotProduct := float32(0)
	for i := range embedding1 {
		dotProduct += embedding1[i] * embedding2[i]
	}

	return dotProduct, nil
}

// SearchSimilar finds similar embeddings
func (s *OnnxEmbeddingService) SearchSimilar(ctx context.Context, queryEmbedding []float32, candidateEmbeddings [][]float32, topK int) ([]int, []float32, error) {
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
func (s *OnnxEmbeddingService) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.tokenizer != nil {
		s.tokenizer.Close()
		s.tokenizer = nil
	}

	if s.session != nil {
		s.session.Destroy()
		s.session = nil
	}

	// Clean up ONNX Runtime environment
	ort.DestroyEnvironment()

	s.ready = false
	s.info.Status = "stopped"
	s.info.LastUpdated = time.Now()

	log.Println("ONNX embeddings service shutdown completed")
	return nil
}

// ensureModelFiles ensures that model files are available, downloading them if necessary
func (s *OnnxEmbeddingService) ensureModelFiles() error {
	log.Println("Checking for model files...")

	// Ensure ONNX Runtime libraries are available first
	if err := s.ensureOnnxLibraries(); err != nil {
		return fmt.Errorf("failed to ensure ONNX libraries: %w", err)
	}

	// Create model directory if it doesn't exist
	if err := os.MkdirAll(s.config.ModelPath, 0755); err != nil {
		return fmt.Errorf("failed to create model directory: %w", err)
	}

	// Check if files already exist
	modelPath := filepath.Join(s.config.ModelPath, "model.onnx")
	tokenizerPath := filepath.Join(s.config.ModelPath, "tokenizer.json")

	modelExists := fileExists(modelPath)
	tokenizerExists := fileExists(tokenizerPath)

	if modelExists && tokenizerExists {
		log.Println("Model files already exist, skipping download")
		return nil
	}

	log.Println("Model files missing, downloading...")

	// Download model files from HuggingFace
	baseURL := "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main"

	if !modelExists {
		log.Println("Downloading ONNX model...")
		if err := s.downloadFile(baseURL+"/onnx/model.onnx", modelPath); err != nil {
			return fmt.Errorf("failed to download ONNX model: %w", err)
		}
		log.Println("ONNX model downloaded successfully")
	}

	if !tokenizerExists {
		log.Println("Downloading tokenizer...")
		if err := s.downloadFile(baseURL+"/tokenizer.json", tokenizerPath); err != nil {
			return fmt.Errorf("failed to download tokenizer: %w", err)
		}
		log.Println("Tokenizer downloaded successfully")
	}

	log.Println("All model files are now available")
	return nil
}

// downloadFile downloads a file from a URL
func (s *OnnxEmbeddingService) downloadFile(url, dest string) error {
	// Create the destination file
	out, err := os.Create(dest)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer out.Close()

	// Make HTTP request
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("failed to download file: %w", err)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	// Copy data
	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

// ensureOnnxLibraries ensures ONNX Runtime libraries are available
func (s *OnnxEmbeddingService) ensureOnnxLibraries() error {
	// Get library path for current platform
	libPath := s.getLibraryPath()
	if libPath == "" {
		log.Println("No library path configured, skipping library check")
		return nil
	}

	// Check if library already exists
	if fileExists(libPath) {
		log.Printf("ONNX Runtime library already exists: %s", libPath)
		return nil
	}

	log.Println("ONNX Runtime library missing, downloading...")

	// Create lib directory structure
	libDir := filepath.Dir(libPath)
	if err := os.MkdirAll(libDir, 0755); err != nil {
		return fmt.Errorf("failed to create lib directory: %w", err)
	}

	// Determine platform and download URL
	var downloadURL string
	version := "1.21.0"

	switch runtime.GOOS {
	case "windows":
		downloadURL = fmt.Sprintf("https://github.com/microsoft/onnxruntime/releases/download/v%s/onnxruntime-win-x64-%s.zip", version, version)
	case "darwin":
		if runtime.GOARCH == "arm64" {
			downloadURL = fmt.Sprintf("https://github.com/microsoft/onnxruntime/releases/download/v%s/onnxruntime-osx-arm64-%s.tgz", version, version)
		} else {
			downloadURL = fmt.Sprintf("https://github.com/microsoft/onnxruntime/releases/download/v%s/onnxruntime-osx-x64-%s.tgz", version, version)
		}
	case "linux":
		downloadURL = fmt.Sprintf("https://github.com/microsoft/onnxruntime/releases/download/v%s/onnxruntime-linux-x64-%s.tgz", version, version)
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	// For now, just log that manual setup is required
	// In a production implementation, you'd add archive extraction logic here
	log.Printf("To download ONNX Runtime libraries automatically, please run: npm run setup:embeddings")
	log.Printf("Or manually download from: %s", downloadURL)
	log.Printf("Extract the library file to: %s", libPath)

	return fmt.Errorf("ONNX Runtime library not found at %s. Please run 'npm run setup:embeddings' to download it", libPath)
}

// fileExists checks if a file exists
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}