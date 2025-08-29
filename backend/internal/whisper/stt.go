package whisper

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
	"archive/zip"

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

// transcribeDirectly performs direct transcription using whisper.cpp binary
func (s *STTService) transcribeDirectly(ctx context.Context, samples []float32) (string, error) {
	log.Printf("Direct transcription: processing %d audio samples", len(samples))
	
	if len(samples) == 0 {
		return "", nil
	}
	
	// Get platform-appropriate whisper binary path
	whisperPath := s.assetManager.GetBinaryPath("whisper")
	
	// Check if whisper binary exists, if not try to ensure assets
	if _, err := os.Stat(whisperPath); err != nil {
		log.Printf("Whisper binary not found at %s, attempting to ensure assets", whisperPath)
		if err := s.assetManager.EnsureAssets(ctx); err != nil {
			log.Printf("Failed to ensure assets: %v", err)
		}
		
		// Check again after ensuring assets
		if _, err := os.Stat(whisperPath); err != nil {
			// Try downloading if embedded assets failed
			if downloadErr := s.downloadWhisperBinary(ctx); downloadErr != nil {
				return "", fmt.Errorf("whisper binary not found and download failed: %w (original error: %v)", downloadErr, err)
			}
		}
	}
	
	tmpDir := os.TempDir()
	inputFile := filepath.Join(tmpDir, fmt.Sprintf("whisper_direct_%d.wav", time.Now().UnixNano()))
	outputFile := filepath.Join(tmpDir, fmt.Sprintf("whisper_direct_%d.txt", time.Now().UnixNano()))
	
	defer os.Remove(inputFile)
	defer os.Remove(outputFile)
	
	if err := s.writeWAVFile(inputFile, samples); err != nil {
		return "", fmt.Errorf("failed to write WAV file: %w", err)
	}
	
	// Get model path
	modelPath := s.assetManager.GetModelPath("whisper")
	
	// whisper.cpp command arguments
	args := []string{
		"-m", modelPath,
		"-f", inputFile,
		"-otxt",
		"-of", strings.TrimSuffix(outputFile, ".txt"),
	}
	
	if s.config.Language != "" && s.config.Language != "auto" {
		args = append(args, "-l", s.config.Language)
	}
	
	log.Printf("Executing whisper: %s %v", whisperPath, args)
	
	cmd := exec.CommandContext(ctx, whisperPath, args...)
	output, err := cmd.CombinedOutput()
	
	log.Printf("Whisper command output: %s", string(output))
	
	if err != nil {
		return "", fmt.Errorf("whisper command failed: %w (output: %s)", err, string(output))
	}
	
	time.Sleep(100 * time.Millisecond)
	
	// The output file should be created by whisper.cpp with the specified name
	actualOutputFile := outputFile
	
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

// downloadWhisperBinary downloads the whisper.cpp binary for the current platform
func (s *STTService) downloadWhisperBinary(ctx context.Context) error {
	platform := runtime.GOOS
	arch := runtime.GOARCH
	
	var downloadURL string
	var binaryName string
	
	switch platform {
	case "windows":
		binaryName = "whisper-cli.exe"
		if arch == "amd64" {
			downloadURL = "https://github.com/ggerganov/whisper.cpp/releases/download/v1.5.4/whisper-1.5.4-win-x64.zip"
		} else {
			return fmt.Errorf("unsupported Windows architecture: %s", arch)
		}
	case "darwin":
		binaryName = "whisper-cli"
		if arch == "amd64" {
			downloadURL = "https://github.com/ggerganov/whisper.cpp/releases/download/v1.5.4/whisper-1.5.4-macos-x64.zip"
		} else if arch == "arm64" {
			downloadURL = "https://github.com/ggerganov/whisper.cpp/releases/download/v1.5.4/whisper-1.5.4-macos-arm64.zip"
		} else {
			return fmt.Errorf("unsupported macOS architecture: %s", arch)
		}
	case "linux":
		binaryName = "whisper-cli"
		if arch == "amd64" {
			downloadURL = "https://github.com/ggerganov/whisper.cpp/releases/download/v1.5.4/whisper-1.5.4-linux-x64.zip"
		} else {
			return fmt.Errorf("unsupported Linux architecture: %s", arch)
		}
	default:
		return fmt.Errorf("unsupported platform: %s", platform)
	}
	
	log.Printf("Downloading whisper binary for %s/%s from %s", platform, arch, downloadURL)
	
	binDir := filepath.Dir(s.assetManager.GetBinaryPath("whisper"))
	if err := os.MkdirAll(binDir, 0755); err != nil {
		return fmt.Errorf("failed to create bin directory: %w", err)
	}
	
	// Download the archive
	resp, err := http.Get(downloadURL)
	if err != nil {
		return fmt.Errorf("failed to download whisper binary: %w", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download whisper binary: HTTP %d", resp.StatusCode)
	}
	
	// Create temporary file for the archive
	tmpFile := filepath.Join(binDir, "whisper_download.zip")
	defer os.Remove(tmpFile)
	
	outFile, err := os.Create(tmpFile)
	if err != nil {
		return fmt.Errorf("failed to create temporary file: %w", err)
	}
	defer outFile.Close()
	
	_, err = io.Copy(outFile, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to save downloaded file: %w", err)
	}
	outFile.Close()
	
	// Extract the binary from the ZIP
	if err := s.extractWhisperFromZip(tmpFile, binDir, binaryName); err != nil {
		return fmt.Errorf("failed to extract whisper binary: %w", err)
	}
	
	// Download base model if needed
	modelPath := s.assetManager.GetModelPath("whisper")
	if _, err := os.Stat(modelPath); os.IsNotExist(err) {
		if err := s.downloadWhisperModel(ctx, modelPath); err != nil {
			log.Printf("Warning: Failed to download whisper model: %v", err)
		}
	}
	
	log.Printf("Successfully downloaded and extracted whisper binary")
	return nil
}

// extractWhisperFromZip extracts the whisper binary from a ZIP archive
func (s *STTService) extractWhisperFromZip(zipPath, targetDir, binaryName string) error {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("failed to open ZIP file: %w", err)
	}
	defer reader.Close()
	
	for _, file := range reader.File {
		// Look for the main whisper binary (usually just called "main" in whisper.cpp releases)
		if strings.Contains(file.Name, "main") && !strings.Contains(file.Name, "/") {
			rc, err := file.Open()
			if err != nil {
				return fmt.Errorf("failed to open file in ZIP: %w", err)
			}
			defer rc.Close()
			
			targetPath := filepath.Join(targetDir, binaryName)
			outFile, err := os.Create(targetPath)
			if err != nil {
				return fmt.Errorf("failed to create target file: %w", err)
			}
			defer outFile.Close()
			
			_, err = io.Copy(outFile, rc)
			if err != nil {
				return fmt.Errorf("failed to copy binary: %w", err)
			}
			
			// Make executable on Unix systems
			if runtime.GOOS != "windows" {
				err = os.Chmod(targetPath, 0755)
				if err != nil {
					log.Printf("Warning: Failed to make binary executable: %v", err)
				}
			}
			
			log.Printf("Extracted whisper binary to: %s", targetPath)
			return nil
		}
	}
	
	return fmt.Errorf("whisper binary not found in ZIP archive")
}

// downloadWhisperModel downloads the base Whisper model
func (s *STTService) downloadWhisperModel(ctx context.Context, modelPath string) error {
	modelURL := "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
	
	log.Printf("Downloading whisper model from %s", modelURL)
	
	if err := os.MkdirAll(filepath.Dir(modelPath), 0755); err != nil {
		return fmt.Errorf("failed to create models directory: %w", err)
	}
	
	resp, err := http.Get(modelURL)
	if err != nil {
		return fmt.Errorf("failed to download model: %w", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download model: HTTP %d", resp.StatusCode)
	}
	
	outFile, err := os.Create(modelPath)
	if err != nil {
		return fmt.Errorf("failed to create model file: %w", err)
	}
	defer outFile.Close()
	
	_, err = io.Copy(outFile, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to save model: %w", err)
	}
	
	log.Printf("Successfully downloaded whisper model to: %s", modelPath)
	return nil
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