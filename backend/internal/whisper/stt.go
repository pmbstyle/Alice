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

	// Determine the base directory for assets
	baseDir := embedded.GetProductionBaseDirectory()
	assetManager := embedded.NewAssetManager(baseDir)

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

	// Ensure assets are available (embedded or download)
	if err := s.assetManager.EnsureAssets(ctx); err != nil {
		log.Printf("Warning: Failed to extract embedded whisper assets: %v", err)
		log.Println("Will use download fallback when whisper binary is needed")
	} else {
		log.Println("Successfully extracted embedded Whisper assets")
	}

	if s.config.ModelPath == "" {
		s.config.ModelPath = "models/whisper-base.bin"
	}

	// Ensure Whisper model is available
	modelPath := s.assetManager.GetModelPath("whisper")
	if !s.assetManager.IsAssetAvailable(modelPath) {
		log.Printf("Whisper model not found at %s, will download when needed", modelPath)
		// Download model during initialization to avoid delays during transcription
		if err := s.downloadWhisperModel(ctx, modelPath); err != nil {
			log.Printf("Warning: Failed to download Whisper model during initialization: %v", err)
			log.Println("Will attempt to download when transcription is requested")
		} else {
			log.Printf("Successfully downloaded Whisper model to: %s", modelPath)
		}
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

// TranscribeAudio performs speech transcription using whisper.cpp
func (s *STTService) TranscribeAudio(ctx context.Context, audioData []byte) (string, error) {
	return s.TranscribeAudioWithLanguage(ctx, audioData, "")
}

// TranscribeAudioWithLanguage performs speech transcription with optional language override
func (s *STTService) TranscribeAudioWithLanguage(ctx context.Context, audioData []byte, language string) (string, error) {
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

	return s.transcribeDirectlyWithLanguage(ctx, samples, language)
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

// transcribeDirectlyWithLanguage performs direct transcription using whisper.cpp binary
func (s *STTService) transcribeDirectlyWithLanguage(ctx context.Context, samples []float32, language string) (string, error) {
	log.Printf("Direct transcription: processing %d audio samples", len(samples))
	
	if len(samples) == 0 {
		return "", nil
	}
	
	var whisperPath string
	embeddedBinaryPath := s.assetManager.GetBinaryPath("whisper")
	if s.assetManager.IsAssetAvailable(embeddedBinaryPath) {
		whisperPath = embeddedBinaryPath
	} else {
		possiblePaths := []string{
			"bin/whisper-cli.exe",
			"bin/whisper-command.exe",
			"bin/main.exe",
			"bin/whisper.exe",
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
		if downloadErr := s.downloadWhisperBinary(ctx); downloadErr != nil {
			return "", fmt.Errorf("no whisper binary found and download failed: %w", downloadErr)
		}
		
		possiblePaths := []string{
			"bin/whisper-cli.exe",
			"bin/whisper-command.exe", 
			"bin/main.exe",
			"bin/whisper.exe",
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
		
		if whisperPath == "" {
			return "", fmt.Errorf("no whisper binary found even after download attempt")
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
	
	// Ensure model is available, download if needed
	if !s.assetManager.IsAssetAvailable(modelPath) {
		log.Printf("Whisper model not available at %s, downloading...", modelPath)
		if err := s.downloadWhisperModel(ctx, modelPath); err != nil {
			return "", fmt.Errorf("failed to download whisper model: %w", err)
		}
	}
	
	// whisper.cpp command arguments - build args based on binary capabilities
	args := []string{
		"-m", modelPath,
		"-f", inputFile,
	}
	
	// Check if this binary supports -otxt flag by testing with --help
	helpCmd := exec.Command(whisperPath, "--help")
	helpOutput, _ := helpCmd.CombinedOutput()
	supportsOtxt := strings.Contains(string(helpOutput), "-otxt") || strings.Contains(string(helpOutput), "otxt")
	
	if supportsOtxt {
		args = append(args, "-otxt")
	}
	
	args = append(args, "-of", strings.TrimSuffix(outputFile, ".txt"))
	
	langToUse := language
	if langToUse == "" {
		langToUse = s.config.Language
	}
	
	if langToUse != "" && langToUse != "auto" {
		args = append(args, "-l", langToUse)
		log.Printf("Using language parameter: %s", langToUse)
	}
	
	log.Printf("Executing whisper: %s %v", whisperPath, args)
	
	cmd := exec.CommandContext(ctx, whisperPath, args...)
	
	// Set library path for Linux to find shared libraries
	if runtime.GOOS == "linux" {
		binDir := filepath.Dir(whisperPath)
		if cmd.Env == nil {
			cmd.Env = os.Environ()
		}
		// Add bin directory to LD_LIBRARY_PATH
		ldLibraryPath := binDir
		for _, env := range cmd.Env {
			if strings.HasPrefix(env, "LD_LIBRARY_PATH=") {
				existingPath := strings.TrimPrefix(env, "LD_LIBRARY_PATH=")
				ldLibraryPath = binDir + ":" + existingPath
				break
			}
		}
		cmd.Env = append(cmd.Env, "LD_LIBRARY_PATH="+ldLibraryPath)
	}
	
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
	var downloadURLs []string
	var fileName string

	switch runtime.GOOS {
	case "windows":
		if runtime.GOARCH == "amd64" || runtime.GOARCH == "x86_64" {
			downloadURLs = []string{
				"https://aliceai.ca/app_assets/whisper/whisper-windows.zip",
			}
			fileName = "whisper-windows.zip"
		} else {
			return fmt.Errorf("unsupported Windows architecture: %s", runtime.GOARCH)
		}
	case "darwin":
		if runtime.GOARCH == "arm64" {
			downloadURLs = []string{
				"https://aliceai.ca/app_assets/whisper/whisper-macos-arm64.zip",
			}
			fileName = "whisper-macos-arm64.zip"
		} else {
			downloadURLs = []string{
				"https://aliceai.ca/app_assets/whisper/whisper-macos-x64.zip",
			}
			fileName = "whisper-macos-x64.zip"
		}
	case "linux":
		if runtime.GOARCH == "amd64" || runtime.GOARCH == "x86_64" {
			downloadURLs = []string{
				"https://aliceai.ca/app_assets/whisper/whisper-linux-x64.zip",
			}
			fileName = "whisper-linux-x64.zip"
		} else {
			return fmt.Errorf("unsupported Linux architecture: %s", runtime.GOARCH)
		}
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	log.Printf("Downloading Whisper binary for %s/%s", runtime.GOOS, runtime.GOARCH)

	// Create bin directory
	if err := os.MkdirAll("bin", 0755); err != nil {
		return fmt.Errorf("failed to create bin directory: %w", err)
	}
	downloadPath := filepath.Join("bin", fileName)
	var lastErr error

	for i, downloadURL := range downloadURLs {
		log.Printf("Attempting binary download from source %d/%d: %s", i+1, len(downloadURLs), downloadURL)

		if err := s.downloadFileWithRetry(downloadURL, downloadPath, 2); err != nil {
			lastErr = err
			log.Printf("Binary download source %d failed: %v", i+1, err)
			continue
		}

		// Success - break out of loop
		log.Printf("Binary download successful from source %d", i+1)
		break
	}
	if _, err := os.Stat(downloadPath); err != nil {
		return fmt.Errorf("failed to download whisper binary from any source: %w", lastErr)
	}

	// Handle different file types
	if runtime.GOOS == "darwin" && runtime.GOARCH == "arm64" && fileName == "whisper-macos-arm64" {
		// Direct binary file - just make executable and rename
		targetPath := filepath.Join("bin", "whisper")
		if err := os.Rename(downloadPath, targetPath); err != nil {
			return fmt.Errorf("failed to move binary: %w", err)
		}
		if err := os.Chmod(targetPath, 0755); err != nil {
			return fmt.Errorf("failed to make binary executable: %w", err)
		}
		log.Printf("Direct binary installed: %s", targetPath)
	} else {
		defer os.Remove(downloadPath)
		if err := s.extractWhisperBinary(downloadPath); err != nil {
			return fmt.Errorf("failed to extract whisper binary: %w", err)
		}
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

	// Extract multiple useful whisper binaries and required DLLs/dylibs
	extractedCount := 0
	whisperBinaries := []string{"whisper-cli.exe", "whisper-command.exe", "main.exe", "whisper.exe"}
	requiredDLLs := []string{"ggml-base.dll", "ggml-cpu.dll", "ggml.dll", "whisper.dll", "SDL2.dll"}
	requiredDylibs := []string{} // dylib files for macOS

	if runtime.GOOS != "windows" {
		whisperBinaries = []string{"whisper-cli", "whisper-command", "main", "whisper"}
		requiredDLLs = []string{} // No DLLs needed on Unix
		if runtime.GOOS == "darwin" {
			// Required dylib files for macOS
			requiredDylibs = []string{"libggml.dylib", "libggml-base.dylib", "libggml-blas.dylib", 
				"libggml-cpu.dylib", "libggml-metal.dylib", "libwhisper.dylib", 
				"libwhisper.1.dylib", "libwhisper.1.7.6.dylib"}
		} else if runtime.GOOS == "linux" {
			// Required shared libraries for Linux
			requiredDLLs = []string{"libggml.so", "libggml-base.so", "libggml-cpu.so", 
				"libwhisper.so", "libwhisper.so.1", "libwhisper.so.1.7.6"}
		}
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

		// Check if this is one of the dylibs we need (macOS)
		for _, wantedDylib := range requiredDylibs {
			if fileName == strings.ToLower(wantedDylib) {
				// Create libinternal directory if it doesn't exist
				if err := os.MkdirAll("libinternal", 0755); err != nil {
					log.Printf("Failed to create libinternal directory: %v", err)
					continue
				}
				outputPath := filepath.Join("libinternal", wantedDylib)
				if err := s.extractSingleFile(file, outputPath); err != nil {
					log.Printf("Failed to extract dylib %s: %v", wantedDylib, err)
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

// downloadFileWithRetry downloads a file with retry logic
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
		if info, err := os.Stat(filepath); err != nil {
			lastErr = fmt.Errorf("downloaded file verification failed: %w", err)
			continue
		} else if info.Size() < 1000 {
			lastErr = fmt.Errorf("downloaded file too small (%d bytes), likely an error page", info.Size())
			os.Remove(filepath)
			continue
		}

		log.Printf("Download successful on attempt %d", attempt)
		return nil
	}

	return fmt.Errorf("download failed after %d attempts: %w", maxRetries, lastErr)
}

// downloadFileWithHeaders downloads a file with custom headers
func (s *STTService) downloadFileWithHeaders(url, filepath string) error {
	log.Printf("Starting download from: %s", url)

	client := &http.Client{
		Timeout: 15 * time.Minute,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "AliceElectron/1.0 (compatible; file downloader)")
	req.Header.Set("Accept", "application/octet-stream, */*")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to start download: %w", err)
	}
	defer resp.Body.Close()

	// Handle response codes
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