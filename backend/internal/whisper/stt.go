package whisper

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"alice-backend/internal/embedded"
)

// Config holds STT configuration
type Config struct {
	Language       string
	ModelPath      string
	SampleRate     int
	VoiceThreshold float64
}

// ServiceInfo contains information about the STT service
type ServiceInfo struct {
	Name        string            `json:"name"`
	Version     string            `json:"version"`
	Status      string            `json:"status"`
	Model       string            `json:"model"`
	Language    string            `json:"language"`
	LastUpdated time.Time         `json:"last_updated"`
	Metadata    map[string]string `json:"metadata"`
}

// STTService provides speech-to-text functionality using whisper
type STTService struct {
	mu           sync.RWMutex
	ready        bool
	config       *Config
	info         *ServiceInfo
	assetManager *embedded.AssetManager
}

// NewSTTService creates a new STT service
func NewSTTService(config *Config) *STTService {
	if config.SampleRate == 0 {
		config.SampleRate = 16000
	}
	if config.VoiceThreshold == 0 {
		config.VoiceThreshold = 0.02
	}

	assetManager := embedded.NewAssetManager(".")

	return &STTService{
		config:       config,
		assetManager: assetManager,
		info: &ServiceInfo{
			Name:        "Whisper STT",
			Version:     "1.0.0",
			Status:      "initializing",
			Model:       "whisper",
			Language:    config.Language,
			LastUpdated: time.Now(),
			Metadata:    make(map[string]string),
		},
	}
}

// Initialize initializes the STT service
func (s *STTService) Initialize(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	log.Println("Initializing Whisper STT service...")

	if s.config.ModelPath == "" {
		s.config.ModelPath = "models/whisper-base.bin"
	}

	s.ready = true
	s.info.Status = "ready"
	s.info.LastUpdated = time.Now()

	log.Println("Whisper STT service initialized successfully")
	return nil
}

// IsReady returns true if the service is ready
func (s *STTService) IsReady() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ready
}

// GetInfo returns service information
func (s *STTService) GetInfo() *ServiceInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	info := *s.info
	info.LastUpdated = time.Now()
	return &info
}

// TranscribeAudio performs actual speech transcription using Python whisper
func (s *STTService) TranscribeAudio(ctx context.Context, audioData []byte) (string, error) {
	if !s.IsReady() {
		return "", fmt.Errorf("Whisper STT service is not ready")
	}

	if len(audioData) == 0 {
		return "", fmt.Errorf("audio data cannot be empty")
	}

	samples, err := s.convertAudioToSamples(audioData)
	if err != nil {
		return "", fmt.Errorf("failed to convert audio: %w", err)
	}

	if len(samples) == 0 {
		return "", nil
	}

	text, err := s.transcribeDirectly(ctx, samples)
	if err != nil {
		log.Printf("Transcription failed: %v", err)
		return "", fmt.Errorf("transcription failed: %w", err)
	}

	return text, nil
}

// convertAudioToSamples converts byte audio data to float32 samples
func (s *STTService) convertAudioToSamples(audioData []byte) ([]float32, error) {
	if len(audioData)%2 != 0 {
		return nil, fmt.Errorf("invalid audio data: odd number of bytes")
	}

	numSamples := len(audioData) / 2
	samples := make([]float32, numSamples)

	for i := 0; i < numSamples; i++ {
		sample := int16(audioData[i*2]) | int16(audioData[i*2+1])<<8
		samples[i] = float32(sample) / 32768.0
	}

	return samples, nil
}

// writeWAVFile writes float32 samples to a WAV file
func (s *STTService) writeWAVFile(filename string, samples []float32) error {
	const sampleRate = 16000
	const channels = 1
	const bitsPerSample = 16

	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	dataSize := len(samples) * 2
	fileSize := 36 + dataSize

	// RIFF header
	file.WriteString("RIFF")
	file.Write([]byte{byte(fileSize & 0xFF), byte((fileSize >> 8) & 0xFF), byte((fileSize >> 16) & 0xFF), byte((fileSize >> 24) & 0xFF)})
	file.WriteString("WAVE")

	// fmt chunk
	file.WriteString("fmt ")
	file.Write([]byte{16, 0, 0, 0})
	file.Write([]byte{1, 0})
	file.Write([]byte{byte(channels), 0})

	// Sample rate
	file.Write([]byte{byte(sampleRate & 0xFF), byte((sampleRate >> 8) & 0xFF), byte((sampleRate >> 16) & 0xFF), byte((sampleRate >> 24) & 0xFF)})

	// Byte rate
	byteRate := sampleRate * channels * bitsPerSample / 8
	file.Write([]byte{byte(byteRate & 0xFF), byte((byteRate >> 8) & 0xFF), byte((byteRate >> 16) & 0xFF), byte((byteRate >> 24) & 0xFF)})

	// Block align
	blockAlign := channels * bitsPerSample / 8
	file.Write([]byte{byte(blockAlign), 0})

	// Bits per sample
	file.Write([]byte{byte(bitsPerSample), 0})

	// data chunk
	file.WriteString("data")
	file.Write([]byte{byte(dataSize & 0xFF), byte((dataSize >> 8) & 0xFF), byte((dataSize >> 16) & 0xFF), byte((dataSize >> 24) & 0xFF)})

	// Convert float32 samples to 16-bit PCM
	for _, sample := range samples {
		if sample > 1.0 {
			sample = 1.0
		} else if sample < -1.0 {
			sample = -1.0
		}

		sample16 := int16(sample * 32767)
		file.Write([]byte{byte(sample16), byte(sample16 >> 8)})
	}

	return nil
}

// transcribeDirectly performs direct transcription using Python whisper
func (s *STTService) transcribeDirectly(ctx context.Context, samples []float32) (string, error) {
	log.Printf("Direct transcription: processing %d audio samples", len(samples))
	
	if len(samples) == 0 {
		return "", nil
	}
	
	whisperPath := "/Users/pmb/Library/Python/3.9/bin/whisper"
	if _, err := os.Stat(whisperPath); err != nil {
		if _, err := exec.LookPath("whisper"); err != nil {
			return "", fmt.Errorf("python whisper not found: %w", err)
		}
		whisperPath = "whisper"
	}
	
	tmpDir := os.TempDir()
	inputFile := filepath.Join(tmpDir, fmt.Sprintf("whisper_direct_%d.wav", time.Now().UnixNano()))
	outputFile := filepath.Join(tmpDir, fmt.Sprintf("whisper_direct_%d.txt", time.Now().UnixNano()))
	
	defer os.Remove(inputFile)
	defer os.Remove(outputFile)
	
	if err := s.writeWAVFile(inputFile, samples); err != nil {
		return "", fmt.Errorf("failed to write WAV file: %w", err)
	}
	
	outputDir := filepath.Dir(outputFile)
	args := []string{
		"--model", "base",
		"--output_format", "txt",
		"--output_dir", outputDir,
		inputFile,
	}
	
	if s.config.Language != "" && s.config.Language != "auto" {
		args = append(args, "--language", s.config.Language)
	}
	
	log.Printf("Executing whisper: %s %v", whisperPath, args)
	
	cmd := exec.CommandContext(ctx, whisperPath, args...)
	output, err := cmd.CombinedOutput()
	
	log.Printf("Whisper command output: %s", string(output))
	
	if err != nil {
		return "", fmt.Errorf("whisper command failed: %w (output: %s)", err, string(output))
	}
	
	time.Sleep(100 * time.Millisecond)
	
	inputBaseName := strings.TrimSuffix(filepath.Base(inputFile), filepath.Ext(inputFile))
	actualOutputFile := filepath.Join(outputDir, inputBaseName + ".txt")
	
	if _, err := os.Stat(actualOutputFile); os.IsNotExist(err) {
		return "", fmt.Errorf("whisper output file not created: %s (command output: %s)", actualOutputFile, string(output))
	}
	
	transcription, err := os.ReadFile(actualOutputFile)
	if err != nil {
		return "", fmt.Errorf("failed to read transcription: %w", err)
	}
	
	defer os.Remove(actualOutputFile)
	
	text := strings.TrimSpace(string(transcription))
	log.Printf("Direct transcription completed: '%s'", text)
	
	return text, nil
}

// Shutdown gracefully shuts down the STT service
func (s *STTService) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ready = false
	s.info.Status = "stopped"
	s.info.LastUpdated = time.Now()

	return nil
}