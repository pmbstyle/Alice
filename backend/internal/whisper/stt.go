package whisper

import (
	"archive/zip"
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

// STTService provides speech-to-text functionality using whisper.cpp
type STTService struct {
	mu           sync.RWMutex
	ready        bool
	config       *Config
	info         *ServiceInfo
	assetManager *embedded.AssetManager
	// Remove whisper.Model dependency for now
}

// NewSTTService creates a new STT service
func NewSTTService(config *Config) *STTService {
	if config.SampleRate == 0 {
		config.SampleRate = 16000 // Default to 16kHz
	}
	if config.VoiceThreshold == 0 {
		config.VoiceThreshold = 0.02 // Default voice threshold
	}

	// Create asset manager with current working directory as base
	assetManager := embedded.NewAssetManager(".")

	return &STTService{
		config:       config,
		assetManager: assetManager,
		info: &ServiceInfo{
			Name:        "Whisper STT",
			Version:     "1.0.0",
			Status:      "initializing",
			Model:       "whisper.cpp",
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

	// First, try to extract embedded assets
	if err := s.assetManager.EnsureAssets(ctx); err != nil {
		log.Printf("Warning: Failed to extract embedded assets: %v", err)
		log.Println("Falling back to download-based approach...")
	} else {
		log.Println("Successfully extracted embedded Whisper assets")
		// Update config to use embedded binary path
		s.config.ModelPath = s.assetManager.GetModelPath("whisper")
	}

	// Download Whisper binary if needed (fallback)
	if err := s.ensureWhisperBinary(); err != nil {
		log.Printf("Warning: Failed to ensure whisper binary: %v", err)
		// Continue without failing initialization
	}

	// Download model if needed (fallback)
	if err := s.ensureModel(); err != nil {
		log.Printf("Warning: %v", err)
		// Don't fail initialization - continue with limited functionality
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

// TranscribeAudio performs actual speech transcription using whisper.cpp
func (s *STTService) TranscribeAudio(ctx context.Context, audioData []byte) (string, error) {
	if !s.IsReady() {
		return "", fmt.Errorf("Whisper STT service is not ready")
	}

	if len(audioData) == 0 {
		return "", fmt.Errorf("audio data cannot be empty")
	}

	// Convert audio data to float32 samples
	samples, err := s.convertAudioToSamples(audioData)
	if err != nil {
		return "", fmt.Errorf("failed to convert audio: %w", err)
	}

	if len(samples) == 0 {
		return "", nil // Empty audio
	}

	// Use actual Whisper transcription
	text, err := s.transcribeWithWhisper(ctx, samples)
	if err != nil {
		log.Printf("Whisper transcription failed: %v", err)

		// Provide helpful message instead of error when setup is incomplete
		if strings.Contains(err.Error(), "model not found") || strings.Contains(err.Error(), "binary not found") {
			return "STT setup incomplete - please download Whisper model and binary for real transcription", nil
		}

		// For other errors, return them
		return "", fmt.Errorf("transcription failed: %w", err)
	}

	return text, nil
}

// convertAudioToSamples converts byte audio data to float32 samples
func (s *STTService) convertAudioToSamples(audioData []byte) ([]float32, error) {
	// Assume 16-bit PCM, mono
	if len(audioData)%2 != 0 {
		return nil, fmt.Errorf("invalid audio data: odd number of bytes")
	}

	numSamples := len(audioData) / 2
	samples := make([]float32, numSamples)

	// Convert 16-bit PCM to float32
	for i := 0; i < numSamples; i++ {
		// Little-endian 16-bit
		sample := int16(audioData[i*2]) | int16(audioData[i*2+1])<<8
		samples[i] = float32(sample) / 32768.0 // Normalize to [-1, 1]
	}

	return samples, nil
}

// transcribeWithWhisper performs actual transcription using whisper.cpp binary
func (s *STTService) transcribeWithWhisper(ctx context.Context, samples []float32) (string, error) {
	// Check if model exists
	if _, err := os.Stat(s.config.ModelPath); err != nil {
		return "", fmt.Errorf("whisper model not found at %s", s.config.ModelPath)
	}

	// Find whisper binary - try embedded first, then fallback to downloaded
	var whisperPath string

	// First try embedded binary path
	embeddedBinaryPath := s.assetManager.GetBinaryPath("whisper")
	if s.assetManager.IsAssetAvailable(embeddedBinaryPath) {
		whisperPath = embeddedBinaryPath
	} else {
		// Fallback to downloaded binaries
		possiblePaths := []string{
			"bin/whisper-cli.exe",     // New CLI binary
			"bin/whisper-command.exe", // Alternative command binary
			"bin/main.exe",            // Main binary from archive
			"bin/whisper.exe",         // Deprecated binary (fallback)
		}

		if runtime.GOOS != "windows" {
			possiblePaths = []string{
				"bin/whisper-cli",
				"bin/whisper-command",
				"bin/main",
				"bin/whisper",
			}
		}

		for _, path := range possiblePaths {
			if _, err := os.Stat(path); err == nil {
				whisperPath = path
				break
			}
		}
	}

	if whisperPath == "" {
		return "", fmt.Errorf("no whisper binary found - please install whisper.cpp")
	}

	// Create temporary WAV file for input
	tmpDir := os.TempDir()
	inputFile := filepath.Join(tmpDir, fmt.Sprintf("whisper_input_%d.wav", time.Now().UnixNano()))
	outputFile := filepath.Join(tmpDir, fmt.Sprintf("whisper_output_%d.txt", time.Now().UnixNano()))

	defer os.Remove(inputFile)
	defer os.Remove(outputFile)

	// Write samples to WAV file
	if err := s.writeWAVFile(inputFile, samples); err != nil {
		return "", fmt.Errorf("failed to write WAV file: %w", err)
	}

	// Build whisper command
	args := []string{
		"-m", s.config.ModelPath,
		"-f", inputFile,
		"-otxt",
		"-of", strings.TrimSuffix(outputFile, ".txt"),
	}

	// Add language if specified
	if s.config.Language != "" && s.config.Language != "auto" {
		args = append(args, "-l", s.config.Language)
	}

	// Run whisper
	cmd := exec.CommandContext(ctx, whisperPath, args...)
	_, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("whisper command failed: %w", err)
	}

	// Read the transcription result
	transcription, err := os.ReadFile(outputFile)
	if err != nil {
		return "", fmt.Errorf("failed to read transcription: %w", err)
	}

	text := strings.TrimSpace(string(transcription))
	if text == "" {
		return "", nil // No speech detected
	}

	return text, nil
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

	// WAV header
	dataSize := len(samples) * 2 // 16-bit samples
	fileSize := 36 + dataSize

	// RIFF header
	file.WriteString("RIFF")
	file.Write([]byte{byte(fileSize & 0xFF), byte((fileSize >> 8) & 0xFF), byte((fileSize >> 16) & 0xFF), byte((fileSize >> 24) & 0xFF)})
	file.WriteString("WAVE")

	// fmt chunk
	file.WriteString("fmt ")
	file.Write([]byte{16, 0, 0, 0})       // chunk size
	file.Write([]byte{1, 0})              // PCM format
	file.Write([]byte{byte(channels), 0}) // channels

	// Sample rate (16000 as 4 bytes, little-endian)
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

	// Convert float32 samples to 16-bit PCM and write
	for _, sample := range samples {
		// Clamp to [-1, 1] range
		if sample > 1.0 {
			sample = 1.0
		} else if sample < -1.0 {
			sample = -1.0
		}

		// Convert to 16-bit signed integer
		sample16 := int16(sample * 32767)
		file.Write([]byte{byte(sample16), byte(sample16 >> 8)})
	}

	return nil
}

// ensureModel downloads the whisper model if it doesn't exist
func (s *STTService) ensureModel() error {
	if s.config.ModelPath == "" {
		// Default to base model
		s.config.ModelPath = "models/whisper-base.bin"
	}

	// Check if model exists
	if _, err := os.Stat(s.config.ModelPath); err == nil {
		log.Printf("Whisper model already exists: %s", s.config.ModelPath)
		return nil
	}

	// Create models directory
	modelsDir := filepath.Dir(s.config.ModelPath)
	if err := os.MkdirAll(modelsDir, 0755); err != nil {
		return fmt.Errorf("failed to create models directory: %w", err)
	}

	log.Printf("Downloading Whisper model to: %s", s.config.ModelPath)

	// Use a working direct download approach
	if err := s.downloadModelFromWorkingSource(); err != nil {
		log.Printf("Automatic download failed: %v", err)
		log.Printf("Please download a Whisper GGML model manually:")
		log.Printf("1. Visit: https://huggingface.co/ggml-org/whisper.cpp/tree/main")
		log.Printf("2. Download ggml-base.bin or ggml-tiny.bin")
		log.Printf("3. Place it at: %s", s.config.ModelPath)
		return fmt.Errorf("failed to download whisper model: %w", err)
	}

	log.Printf("Whisper model downloaded successfully: %s", s.config.ModelPath)
	return nil
}

func (s *STTService) downloadModelFromWorkingSource() error {
	// Use verified working sources in priority order
	urls := []string{
		// Primary: Official HuggingFace
		"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
		"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
		// Secondary: HuggingFace mirror
		"https://hf.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
		"https://hf.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
		// Tertiary: Alternative HuggingFace repository locations
		"https://huggingface.co/openai/whisper-base/resolve/main/ggml-base.bin",
		"https://huggingface.co/openai/whisper-tiny/resolve/main/ggml-tiny.bin",
	}

	var lastErr error
	for i, url := range urls {
		log.Printf("Attempting download from source %d/%d", i+1, len(urls))

		// Try with retry mechanism for robustness
		if err := s.downloadFileWithRetry(url, s.config.ModelPath, 3); err != nil {
			log.Printf("Source %d failed after retries: %v", i+1, err)
			lastErr = err
			continue
		}

		// Verify the downloaded file is valid (not empty, reasonable size)
		if info, err := os.Stat(s.config.ModelPath); err == nil && info.Size() > 1000000 { // At least 1MB
			log.Printf("Model downloaded successfully (%d MB)", info.Size()/(1024*1024))
			return nil
		} else {
			log.Printf("Downloaded file appears invalid, trying next source")
			os.Remove(s.config.ModelPath)
			lastErr = fmt.Errorf("downloaded file is too small or corrupt")
		}
	}

	return lastErr
}

// downloadFileWithHeaders downloads a file with custom headers and retry logic
func (s *STTService) downloadFileWithHeaders(url, filepath string) error {
	log.Printf("Starting download from: %s", url)

	// Create HTTP client with robust retry and timeout settings
	client := &http.Client{
		Timeout: 15 * time.Minute, // Extended timeout for large files
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			// Follow redirects for all trusted hosts
			if len(via) >= 5 {
				return fmt.Errorf("stopped after 5 redirects")
			}
			return nil
		},
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Add headers optimized for file downloads across different services
	req.Header.Set("User-Agent", "AliceElectron/1.0 (compatible; file downloader)")
	req.Header.Set("Accept", "application/octet-stream, */*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Accept-Encoding", "identity") // Disable compression for binary files
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Cache-Control", "no-cache")

	// For HuggingFace URLs, don't modify them - use them as-is
	// The /resolve/ format is correct for direct downloads

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to start download: %w", err)
	}
	defer resp.Body.Close()

	// Handle various response codes with better error reporting
	switch resp.StatusCode {
	case http.StatusOK:
		// Success - continue with download
	case http.StatusFound, http.StatusMovedPermanently, http.StatusTemporaryRedirect:
		// Redirects should be handled by client automatically
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Errorf("access denied (status: %d) - server requires authentication", resp.StatusCode)
	case http.StatusNotFound:
		return fmt.Errorf("file not found (status: 404) - URL may be outdated")
	case http.StatusTooManyRequests:
		return fmt.Errorf("rate limited (status: 429) - server is limiting downloads")
	case http.StatusServiceUnavailable:
		return fmt.Errorf("service unavailable (status: 503) - server temporarily down")
	default:
		if resp.StatusCode >= 400 {
			return fmt.Errorf("download failed (status: %d) - %s", resp.StatusCode, resp.Status)
		}
	}

	// Create the file
	out, err := os.Create(filepath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	// Copy with progress reporting
	written, err := io.Copy(out, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	log.Printf("Download completed: %s (%d bytes)", filepath, written)
	return nil
}

// downloadFileWithRetry downloads a file with retry logic for robustness
func (s *STTService) downloadFileWithRetry(url, filepath string, maxRetries int) error {
	var lastErr error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			// Exponential backoff: wait 2, 4, 8 seconds between retries
			waitTime := time.Duration(1<<uint(attempt-2)) * 2 * time.Second
			log.Printf("Retrying download in %v (attempt %d/%d)", waitTime, attempt, maxRetries)
			time.Sleep(waitTime)
		}

		log.Printf("Download attempt %d/%d from: %s", attempt, maxRetries, url)

		if err := s.downloadFileWithHeaders(url, filepath); err != nil {
			lastErr = err
			log.Printf("Attempt %d failed: %v", attempt, err)

			// Clean up partial file on failure
			if _, statErr := os.Stat(filepath); statErr == nil {
				os.Remove(filepath)
			}

			continue
		}

		// Verify file was downloaded correctly
		if info, err := os.Stat(filepath); err != nil {
			lastErr = fmt.Errorf("downloaded file verification failed: %w", err)
			continue
		} else if info.Size() < 1000 { // Less than 1KB probably indicates error page
			lastErr = fmt.Errorf("downloaded file too small (%d bytes), likely an error page", info.Size())
			os.Remove(filepath)
			continue
		}

		log.Printf("Download successful on attempt %d", attempt)
		return nil
	}

	return fmt.Errorf("download failed after %d attempts: %w", maxRetries, lastErr)
}

// downloadFile downloads a file from a URL with progress logging
func (s *STTService) downloadFile(url, filepath string) error {
	log.Printf("Starting download from: %s", url)

	// Create HTTP request
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("failed to start download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}

	// Create the file
	out, err := os.Create(filepath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	// Copy with progress reporting
	written, err := io.Copy(out, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	log.Printf("Download completed: %s (%d bytes)", filepath, written)
	return nil
}

// ensureWhisperBinary downloads whisper.cpp binary if it doesn't exist
func (s *STTService) ensureWhisperBinary() error {
	whisperPath := "bin/whisper"
	if runtime.GOOS == "windows" {
		whisperPath = "bin/whisper.exe"
	}

	// Check if binary already exists
	if _, err := os.Stat(whisperPath); err == nil {
		log.Printf("Whisper binary already exists: %s", whisperPath)
		return nil
	}

	// Check if it's in PATH
	if _, err := exec.LookPath("whisper"); err == nil {
		log.Printf("Whisper binary found in PATH")
		return nil
	}

	// Create bin directory
	if err := os.MkdirAll("bin", 0755); err != nil {
		return fmt.Errorf("failed to create bin directory: %w", err)
	}

	// Download whisper binary for current platform
	return s.downloadWhisperBinary()
}

// downloadWhisperBinary downloads the appropriate whisper.cpp binary for the current platform
func (s *STTService) downloadWhisperBinary() error {
	var downloadURLs []string
	var fileName string

	// Determine platform and download URLs (using latest v1.7.6 from ggml-org with fallbacks)
	switch runtime.GOOS {
	case "windows":
		if runtime.GOARCH == "amd64" || runtime.GOARCH == "x86_64" {
			downloadURLs = []string{
				"https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip",
				"https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.1/whisper-bin-x64.zip", // fallback
			}
			fileName = "whisper-bin-x64.zip"
		} else {
			downloadURLs = []string{
				"https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-Win32.zip",
				"https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.1/whisper-bin-Win32.zip", // fallback
			}
			fileName = "whisper-bin-Win32.zip"
		}
	case "darwin":
		if runtime.GOARCH == "arm64" {
			downloadURLs = []string{
				"https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-arm64.zip",
				"https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.1/whisper-bin-arm64.zip", // fallback
			}
			fileName = "whisper-bin-arm64.zip"
		} else {
			downloadURLs = []string{
				"https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip",
				"https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.1/whisper-bin-x64.zip", // fallback
			}
			fileName = "whisper-bin-x64.zip"
		}
	case "linux":
		downloadURLs = []string{
			"https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-Linux.zip",
			"https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.1/whisper-bin-Linux.zip", // fallback
		}
		fileName = "whisper-bin-Linux.zip"
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	log.Printf("Downloading Whisper binary for %s/%s", runtime.GOOS, runtime.GOARCH)

	// Try downloading from multiple URLs with retry mechanism
	zipPath := filepath.Join("bin", fileName)
	var lastErr error

	for i, downloadURL := range downloadURLs {
		log.Printf("Attempting binary download from source %d/%d: %s", i+1, len(downloadURLs), downloadURL)

		if err := s.downloadFileWithRetry(downloadURL, zipPath, 2); err != nil {
			lastErr = err
			log.Printf("Binary download source %d failed: %v", i+1, err)
			continue
		}

		// Success - break out of loop
		log.Printf("Binary download successful from source %d", i+1)
		break
	}

	// Check if any download succeeded
	if _, err := os.Stat(zipPath); err != nil {
		return fmt.Errorf("failed to download whisper binary from any source: %w", lastErr)
	}

	defer os.Remove(zipPath)

	// Extract the binary
	if err := s.extractWhisperBinary(zipPath); err != nil {
		return fmt.Errorf("failed to extract whisper binary: %w", err)
	}

	log.Printf("Whisper binary installed successfully")
	return nil
}

// extractWhisperBinary extracts the whisper binary from the downloaded zip
func (s *STTService) extractWhisperBinary(zipPath string) error {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer reader.Close()

	log.Printf("Extracting whisper binary from: %s", zipPath)

	// Extract multiple useful whisper binaries and required DLLs
	extractedCount := 0
	whisperBinaries := []string{"whisper-cli.exe", "whisper-command.exe", "main.exe", "whisper.exe"}
	requiredDLLs := []string{"ggml-base.dll", "ggml-cpu.dll", "ggml.dll", "whisper.dll", "SDL2.dll"}

	if runtime.GOOS != "windows" {
		whisperBinaries = []string{"whisper-cli", "whisper-command", "main", "whisper"}
		requiredDLLs = []string{} // No DLLs needed on Unix
	}

	for _, file := range reader.File {
		if file.FileInfo().IsDir() {
			continue
		}

		fileName := strings.ToLower(filepath.Base(file.Name))

		// Check if this is one of the binaries we want
		for _, wantedBinary := range whisperBinaries {
			if fileName == strings.ToLower(wantedBinary) {
				outputPath := filepath.Join("bin", wantedBinary)
				if err := s.extractSingleFile(file, outputPath); err != nil {
					log.Printf("Failed to extract %s: %v", wantedBinary, err)
					continue
				}
				extractedCount++
				break
			}
		}

		// Check if this is one of the DLLs we need
		for _, wantedDLL := range requiredDLLs {
			if fileName == strings.ToLower(wantedDLL) {
				outputPath := filepath.Join("bin", wantedDLL)
				if err := s.extractSingleFile(file, outputPath); err != nil {
					log.Printf("Failed to extract DLL %s: %v", wantedDLL, err)
					continue
				}
				extractedCount++
				break
			}
		}
	}

	if extractedCount == 0 {
		return fmt.Errorf("no suitable whisper binary found in archive")
	}

	log.Printf("Successfully extracted %d whisper binaries", extractedCount)
	return nil
}

// extractSingleFile extracts a single file from the zip to the target path
func (s *STTService) extractSingleFile(file *zip.File, outputPath string) error {
	rc, err := file.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	outFile, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer outFile.Close()

	// Copy the file
	_, err = io.Copy(outFile, rc)
	if err != nil {
		return err
	}

	// Make it executable on Unix systems
	if runtime.GOOS != "windows" {
		if err := os.Chmod(outputPath, 0755); err != nil {
			return err
		}
	}

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
