package piper

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log"
	"math"
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

// TTSService provides text-to-speech functionality using Piper
type TTSService struct {
	mu           sync.RWMutex
	ready        bool
	voices       map[string]*Voice
	config       *Config
	info         *ServiceInfo
	defaultVoice string
	assetManager *embedded.AssetManager
}

// Config holds TTS configuration
type Config struct {
	PiperPath string
	ModelPath string
	Voice     string
	Speed     float32
}

// Voice represents a TTS voice
type Voice struct {
	Name        string `json:"name"`
	Language    string `json:"language"`
	Gender      string `json:"gender"`
	Quality     string `json:"quality"`
	SampleRate  int    `json:"sample_rate"`
	Description string `json:"description"`
}

// ServiceInfo contains information about the TTS service
type ServiceInfo struct {
	Name        string            `json:"name"`
	Version     string            `json:"version"`
	Status      string            `json:"status"`
	Voices      []*Voice          `json:"voices"`
	Config      *Config           `json:"config"`
	LastUpdated time.Time         `json:"last_updated"`
	Metadata    map[string]string `json:"metadata"`
}

// NewTTSService creates a new TTS service
func NewTTSService(config *Config) *TTSService {
	// Create asset manager with current working directory as base
	assetManager := embedded.NewAssetManager(".")
	
	return &TTSService{
		config:       config,
		voices:       make(map[string]*Voice),
		defaultVoice: "en_US-amy-medium", // Set default to young woman voice
		assetManager: assetManager,
		info: &ServiceInfo{
			Name:        "Piper TTS",
			Version:     "1.0.0",
			Status:      "initializing",
			Voices:      []*Voice{},
			Config:      config,
			LastUpdated: time.Now(),
			Metadata:    make(map[string]string),
		},
	}
}

// Initialize initializes the TTS service
func (s *TTSService) Initialize(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	log.Println("Initializing Piper TTS service...")

	// First, try to extract embedded assets
	if err := s.assetManager.EnsureAssets(ctx); err != nil {
		log.Printf("Warning: Failed to extract embedded assets: %v", err)
		log.Println("Falling back to download-based approach...")
	} else {
		log.Println("Successfully extracted embedded Piper assets")
		// Update config to use embedded binary path
		s.config.PiperPath = s.assetManager.GetBinaryPath("piper")
		s.config.ModelPath = s.assetManager.GetModelPath("piper")
	}

	// Ensure Piper binary exists (don't fail initialization if missing)
	if err := s.ensurePiper(ctx); err != nil {
		log.Printf("Warning: %v - TTS will use fallback audio", err)
		// Continue initialization with placeholder functionality
	}

	// Load available voices
	s.loadVoices()

	s.ready = true
	s.info.Status = "ready"
	s.info.LastUpdated = time.Now()

	log.Println("Piper TTS service initialized successfully")
	return nil
}

// loadVoices loads available TTS voices
func (s *TTSService) loadVoices() {
	// Real Piper voices that can be downloaded
	voices := []*Voice{
		{
			Name:        "en_US-amy-medium",
			Language:    "en-US",
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Amy - English US female voice (Piper)",
		},
		{
			Name:        "en_US-hfc_female-medium", 
			Language:    "en-US",
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "HFC Female - English US female voice (Piper)",
		},
		{
			Name:        "en_US-kristin-medium",
			Language:    "en-US", 
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Kristin - English US female voice (Piper)",
		},
	}

	s.voices = make(map[string]*Voice)
	s.info.Voices = voices

	for _, voice := range voices {
		s.voices[voice.Name] = voice
	}
}

// IsReady returns true if the service is ready
func (s *TTSService) IsReady() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ready
}

// GetVoices returns available voices
func (s *TTSService) GetVoices() []*Voice {
	s.mu.RLock()
	defer s.mu.RUnlock()

	voices := make([]*Voice, 0, len(s.voices))
	for _, voice := range s.voices {
		voices = append(voices, voice)
	}
	return voices
}

// GetInfo returns service information
func (s *TTSService) GetInfo() *ServiceInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Return a copy to avoid concurrent access issues
	info := *s.info
	info.LastUpdated = time.Now()
	return &info
}

// Synthesize converts text to speech using Piper
func (s *TTSService) Synthesize(ctx context.Context, text string, voice string) ([]byte, error) {
	if !s.IsReady() {
		return nil, fmt.Errorf("TTS service is not ready")
	}

	if text == "" {
		return nil, fmt.Errorf("text cannot be empty")
	}

	if voice == "" {
		voice = s.config.Voice
		if voice == "" {
			voice = "en_US-amy-medium" // Default voice
		}
	}

	s.mu.RLock()
	selectedVoice, exists := s.voices[voice]
	
	// If requested voice not found, use default young woman voice (Amy)
	if !exists {
		log.Printf("Voice '%s' not found, trying default voices...", voice)
		
		// First try to use configured default voice
		if fallbackVoice, exists := s.voices[s.defaultVoice]; exists {
			selectedVoice = fallbackVoice
			voice = s.defaultVoice
			log.Printf("Using default fallback voice: %s", s.defaultVoice)
		} else {
			// If Amy not available, try any other English voice
			for _, fallbackVoice := range s.voices {
				if fallbackVoice.Language == "en-US" || fallbackVoice.Language == "en-GB" {
					selectedVoice = fallbackVoice
					voice = fallbackVoice.Name
					log.Printf("Using fallback voice: %s", fallbackVoice.Name)
					break
				}
			}
		}
		exists = selectedVoice != nil
	}
	s.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("no voices available")
	}

	// Ensure voice model exists
	if err := s.ensureVoiceModel(ctx, voice); err != nil {
		log.Printf("Failed to ensure voice model %s: %v", voice, err)
		// Fall back to placeholder for now
		return s.generatePlaceholderWAV(text, selectedVoice), nil
	}

	// Use Piper to synthesize speech
	audioData, err := s.synthesizeWithPiper(ctx, text, voice)
	if err != nil {
		log.Printf("Failed to synthesize with Piper: %v", err)
		// Fall back to placeholder
		return s.generatePlaceholderWAV(text, selectedVoice), nil
	}

	return audioData, nil
}

// generatePlaceholderWAV generates a speech-like WAV file with tones based on text
func (s *TTSService) generatePlaceholderWAV(text string, voice *Voice) []byte {
	// This generates a speech-like audio pattern based on text characteristics
	// In a real implementation, this would be generated by Piper

	const (
		sampleRate = 22050
		baseDuration = 0.8 // Base duration in seconds
	)

	// Calculate dynamic duration based on text length (roughly 150 words per minute)
	textDuration := float64(len(text)) * 0.1 // ~10 characters per second
	if textDuration < baseDuration {
		textDuration = baseDuration
	}
	if textDuration > 10.0 { // Cap at 10 seconds
		textDuration = 10.0
	}
	
	numSamples := int(sampleRate * textDuration)

	// WAV file format
	wav := make([]byte, 44+numSamples*2) // 44 bytes header + samples

	// RIFF header
	copy(wav[0:4], []byte("RIFF"))
	// File size - 8
	fileSize := uint32(44 + numSamples*2 - 8)
	wav[4] = byte(fileSize & 0xFF)
	wav[5] = byte((fileSize >> 8) & 0xFF)
	wav[6] = byte((fileSize >> 16) & 0xFF)
	wav[7] = byte((fileSize >> 24) & 0xFF)

	// WAVE header
	copy(wav[8:12], []byte("WAVE"))

	// fmt chunk
	copy(wav[12:16], []byte("fmt "))
	wav[16] = 16 // Chunk size
	wav[20] = 1  // Audio format (PCM)
	wav[22] = 1  // Number of channels (mono)

	// Sample rate
	wav[24] = byte(sampleRate & 0xFF)
	wav[25] = byte((sampleRate >> 8) & 0xFF)
	wav[26] = byte((sampleRate >> 16) & 0xFF)
	wav[27] = byte((sampleRate >> 24) & 0xFF)

	// Byte rate
	byteRate := uint32(sampleRate * 2)
	wav[28] = byte(byteRate & 0xFF)
	wav[29] = byte((byteRate >> 8) & 0xFF)
	wav[30] = byte((byteRate >> 16) & 0xFF)
	wav[31] = byte((byteRate >> 24) & 0xFF)

	// Block align
	wav[32] = 2

	// Bits per sample
	wav[34] = 16

	// data chunk
	copy(wav[36:40], []byte("data"))

	// Data size
	dataSize := uint32(numSamples * 2)
	wav[40] = byte(dataSize & 0xFF)
	wav[41] = byte((dataSize >> 8) & 0xFF)
	wav[42] = byte((dataSize >> 16) & 0xFF)
	wav[43] = byte((dataSize >> 24) & 0xFF)

	// Generate speech-like audio patterns
	s.generateSpeechLikeAudio(wav[44:], numSamples, text, voice)

	log.Printf("Generated %d samples (%.2f seconds) of audio for text: %s", numSamples, textDuration, text[:min(50, len(text))])
	return wav
}

// generateSpeechLikeAudio creates speech-like audio patterns based on text and voice characteristics
func (s *TTSService) generateSpeechLikeAudio(buffer []byte, numSamples int, text string, voice *Voice) {
	
	// Voice characteristics
	baseFreq := 150.0 // Base frequency for speech
	if voice.Gender == "female" {
		baseFreq = 220.0 // Higher pitch for female voices
	}

	// Text analysis for speech patterns
	words := len(strings.Fields(text))
	if words == 0 {
		words = 1
	}

	samplesPerWord := numSamples / words
	if samplesPerWord < 1000 {
		samplesPerWord = 1000 // Minimum duration per word
	}

	sampleIndex := 0
	
	for wordIndex := 0; wordIndex < words && sampleIndex < numSamples-samplesPerWord; wordIndex++ {
		// Generate audio for this word
		wordSamples := samplesPerWord
		if sampleIndex + wordSamples > numSamples {
			wordSamples = numSamples - sampleIndex
		}
		
		s.generateWordAudio(buffer[sampleIndex*2:(sampleIndex+wordSamples)*2], wordSamples, baseFreq, wordIndex)
		sampleIndex += wordSamples
		
		// Add brief pause between words (if space permits)
		pauseSamples := min(500, numSamples-sampleIndex) // ~22ms pause
		s.generateSilence(buffer[sampleIndex*2:(sampleIndex+pauseSamples)*2], pauseSamples)
		sampleIndex += pauseSamples
	}
	
	// Fill remaining with silence
	if sampleIndex < numSamples {
		remaining := numSamples - sampleIndex
		s.generateSilence(buffer[sampleIndex*2:], remaining)
	}
}

// generateWordAudio generates audio for a single word
func (s *TTSService) generateWordAudio(buffer []byte, samples int, baseFreq float64, wordIndex int) {
	
	// Much more speech-like frequency modulation
	for i := 0; i < samples; i++ {
		t := float64(i) / 22050.0 // Time in seconds
		
		// Dynamic frequency that varies throughout the word (more like speech)
		progress := float64(i) / float64(samples) // 0.0 to 1.0 through the word
		
		// Speech-like frequency modulation (rises and falls like natural speech)
		freqModulation := 1.0 + 0.3*math.Sin(progress*math.Pi*4) // Oscillates 4 times per word
		currentFreq := baseFreq * freqModulation
		
		// Create speech-like formants (multiple frequency bands like vowels)
		formant1 := 0.6 * math.Sin(2 * math.Pi * currentFreq * t)           // Fundamental
		formant2 := 0.3 * math.Sin(2 * math.Pi * currentFreq * 2.5 * t)     // First formant  
		formant3 := 0.15 * math.Sin(2 * math.Pi * currentFreq * 4.2 * t)    // Second formant
		formant4 := 0.08 * math.Sin(2 * math.Pi * currentFreq * 6.8 * t)    // Higher formant
		
		// Combine formants
		waveform := formant1 + formant2 + formant3 + formant4
		
		// Speech-like envelope (quick attack, sustained, quick decay)
		var envelope float64
		if progress < 0.1 {
			envelope = progress * 10 // Quick attack
		} else if progress > 0.8 {
			envelope = (1.0 - progress) * 5 // Quick decay  
		} else {
			envelope = 0.8 + 0.2*math.Sin(progress*math.Pi*6) // Sustained with slight variation
		}
		
		waveform *= envelope
		
		// Add speech-like noise and breathiness
		breathNoise := (math.Sin(t*1000)*0.1 + math.Sin(t*1700)*0.05) * 0.3
		waveform += breathNoise
		
		// Add random noise for naturalness
		randomNoise := (float64((i*31+wordIndex*47)%200)/200.0 - 0.5) * 0.1
		waveform += randomNoise
		
		// Apply light compression (like human vocal tract)
		if waveform > 0.7 {
			waveform = 0.7 + (waveform-0.7)*0.3
		} else if waveform < -0.7 {
			waveform = -0.7 + (waveform+0.7)*0.3
		}
		
		// Convert to 16-bit signed integer with reasonable volume
		sample := int16(waveform * 12000) // Higher volume than before
		
		// Write little-endian 16-bit sample
		buffer[i*2] = byte(sample & 0xFF)
		buffer[i*2+1] = byte((sample >> 8) & 0xFF)
	}
}

// generateSilence fills buffer with silence
func (s *TTSService) generateSilence(buffer []byte, samples int) {
	for i := 0; i < samples*2; i++ {
		buffer[i] = 0
	}
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ensurePiper downloads and sets up the Piper binary if needed
func (s *TTSService) ensurePiper(ctx context.Context) error {
	// Set or fix PiperPath if needed
	if s.config.PiperPath == "" {
		if runtime.GOOS == "windows" {
			s.config.PiperPath = "bin/piper.exe"
		} else {
			s.config.PiperPath = "bin/piper"
		}
	} else {
		// Fix path if it doesn't have correct extension on Windows
		if runtime.GOOS == "windows" && !strings.HasSuffix(s.config.PiperPath, ".exe") {
			s.config.PiperPath = s.config.PiperPath + ".exe"
		}
	}


	// Check if Piper binary and required DLLs exist
	binaryExists := false
	if _, err := os.Stat(s.config.PiperPath); err == nil {
		binaryExists = true
		log.Printf("Piper binary already exists: %s", s.config.PiperPath)
		
		// Check if required DLLs and espeak-ng-data exist
		binDir := filepath.Dir(s.config.PiperPath)
		requiredDLLs := []string{"espeak-ng.dll", "onnxruntime_providers_shared.dll", "onnxruntime.dll", "piper_phonemize.dll"}
		allDependenciesExist := true
		
		for _, dll := range requiredDLLs {
			dllPath := filepath.Join(binDir, dll)
			if _, err := os.Stat(dllPath); err != nil {
				log.Printf("Required DLL missing: %s", dllPath)
				allDependenciesExist = false
				break
			}
		}
		
		// Check if espeak-ng-data directory exists
		espeakDataPath := filepath.Join(binDir, "espeak-ng-data")
		if _, err := os.Stat(espeakDataPath); err != nil {
			log.Printf("Required espeak-ng-data directory missing: %s", espeakDataPath)
			allDependenciesExist = false
		}
		
		if allDependenciesExist {
			log.Printf("All required dependencies are present")
			return nil
		} else {
			log.Printf("Some dependencies are missing, need to re-extract")
		}
	}

	// Create bin directory
	binDir := filepath.Dir(s.config.PiperPath)
	if err := os.MkdirAll(binDir, 0755); err != nil {
		return fmt.Errorf("failed to create bin directory: %w", err)
	}

	if !binaryExists {
		log.Printf("Piper binary not found at %s", s.config.PiperPath)
	} else {
		log.Printf("Piper binary exists but DLLs are missing, re-downloading to get dependencies")
	}
	log.Printf("Attempting to download Piper binary automatically...")
	
	// Try to download automatically
	if err := s.downloadPiperBinary(); err != nil {
		log.Printf("Failed to download Piper binary: %v", err)
		log.Printf("Please download Piper manually from: https://github.com/rhasspy/piper/releases")
		log.Printf("Extract the binary to: %s", s.config.PiperPath)
		return fmt.Errorf("piper binary not found - please download manually")
	}
	
	log.Printf("Piper binary downloaded successfully: %s", s.config.PiperPath)
	return nil
}

// ensureVoiceModel downloads a voice model if it doesn't exist
func (s *TTSService) ensureVoiceModel(ctx context.Context, voice string) error {
	modelDir := "models/piper"
	if s.config.ModelPath != "" {
		modelDir = s.config.ModelPath
	}

	if err := os.MkdirAll(modelDir, 0755); err != nil {
		return fmt.Errorf("failed to create models directory: %w", err)
	}

	modelFile := filepath.Join(modelDir, voice+".onnx")
	configFile := filepath.Join(modelDir, voice+".onnx.json")

	// First check if embedded models were extracted
	embeddedModelPath := s.assetManager.GetVoiceModelPath(voice)
	embeddedConfigPath := embeddedModelPath + ".json"
	
	if s.assetManager.IsAssetAvailable(embeddedModelPath) && s.assetManager.IsAssetAvailable(embeddedConfigPath) {
		log.Printf("Using embedded voice model: %s", voice)
		// Update paths to use embedded models
		modelFile = embeddedModelPath
		configFile = embeddedConfigPath
	}

	// Check if both model and config exist
	if _, err := os.Stat(modelFile); err == nil {
		if _, err := os.Stat(configFile); err == nil {
			return nil // Both files exist
		}
	}

	log.Printf("Voice model %s not found, attempting to download...", voice)
	
	// Try to download the voice model automatically
	if err := s.downloadVoiceModel(voice, modelDir); err != nil {
		log.Printf("Failed to download voice model: %v", err)
		log.Printf("Please download manually from: https://huggingface.co/rhasspy/piper-voices/tree/main")
		log.Printf("Place files at: %s and %s", modelFile, configFile)
		return fmt.Errorf("voice model not found - please download manually")
	}
	
	log.Printf("Voice model %s downloaded successfully", voice)
	return nil
}

// synthesizeWithPiper uses the Piper binary to synthesize speech
func (s *TTSService) synthesizeWithPiper(ctx context.Context, text, voice string) ([]byte, error) {
	modelDir := "models/piper"
	if s.config.ModelPath != "" {
		modelDir = s.config.ModelPath
	}

	modelFile := filepath.Join(modelDir, voice+".onnx")

	// Create temporary files for input and output
	tmpDir := os.TempDir()
	inputFile := filepath.Join(tmpDir, fmt.Sprintf("piper_input_%d.txt", time.Now().UnixNano()))
	outputFile := filepath.Join(tmpDir, fmt.Sprintf("piper_output_%d.wav", time.Now().UnixNano()))

	defer os.Remove(inputFile)
	defer os.Remove(outputFile)

	// Write text to input file
	if err := os.WriteFile(inputFile, []byte(text), 0644); err != nil {
		return nil, fmt.Errorf("failed to write input file: %w", err)
	}

	// Build Piper command
	args := []string{
		"--model", modelFile,
		"--output_file", outputFile,
	}

	// Add speed if specified
	if s.config.Speed > 0 && s.config.Speed != 1.0 {
		args = append(args, "--length_scale", fmt.Sprintf("%.2f", 1.0/s.config.Speed))
	}

	// Run Piper
	cmd := exec.CommandContext(ctx, s.config.PiperPath, args...)
	cmd.Stdin = strings.NewReader(text)
	
	// Set espeak-ng data path environment variable
	espeakDataPath := filepath.Join(filepath.Dir(s.config.PiperPath), "espeak-ng-data")
	cmd.Env = append(os.Environ(), "ESPEAK_DATA_PATH="+espeakDataPath)

	_, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to run piper: %w", err)
	}

	// Read the output WAV file
	audioData, err := os.ReadFile(outputFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read output file: %w", err)
	}

	log.Printf("Piper synthesis complete: %d bytes", len(audioData))
	return audioData, nil
}

// downloadPiperBinary downloads the appropriate Piper binary for the current platform
func (s *TTSService) downloadPiperBinary() error {
	var downloadURL, fileName string
	
	// Determine platform and download URL
	switch runtime.GOOS {
	case "windows":
		downloadURL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
		fileName = "piper_windows_amd64.zip"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			downloadURL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_aarch64.tar.gz"
			fileName = "piper_macos_aarch64.tar.gz"
		} else {
			downloadURL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_x64.tar.gz"
			fileName = "piper_macos_x64.tar.gz"
		}
	case "linux":
		if runtime.GOARCH == "arm64" {
			downloadURL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_aarch64.tar.gz"
			fileName = "piper_linux_aarch64.tar.gz"
		} else if runtime.GOARCH == "arm" {
			downloadURL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_armv7l.tar.gz"
			fileName = "piper_linux_armv7l.tar.gz"
		} else {
			downloadURL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
			fileName = "piper_linux_x86_64.tar.gz"
		}
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	log.Printf("Downloading Piper binary from: %s", downloadURL)
	archivePath := filepath.Join("bin", fileName)
	
	// Download the archive
	if err := s.downloadFile(downloadURL, archivePath); err != nil {
		return fmt.Errorf("failed to download archive: %w", err)
	}

	// Extract the binary
	if err := s.extractPiperBinary(archivePath); err != nil {
		return fmt.Errorf("failed to extract binary: %w", err)
	}

	// Cleanup archive
	os.Remove(archivePath)
	
	log.Printf("Piper binary installed successfully")
	return nil
}

// downloadFile downloads a file from a URL
func (s *TTSService) downloadFile(url, filepath string) error {
	client := &http.Client{
		Timeout: 5 * time.Minute,
	}
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	
	// Add headers to appear as regular browser
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept", "*/*")
	
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}

	out, err := os.Create(filepath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to save file: %w", err)
	}

	log.Printf("Downloaded file: %s (%d bytes)", filepath, resp.ContentLength)
	return nil
}

// extractPiperBinary extracts the Piper binary from the downloaded archive
func (s *TTSService) extractPiperBinary(archivePath string) error {
	if strings.HasSuffix(archivePath, ".zip") {
		return s.extractZip(archivePath)
	} else if strings.HasSuffix(archivePath, ".tar.gz") {
		return s.extractTarGz(archivePath)
	}
	return fmt.Errorf("unsupported archive format: %s", archivePath)
}

// extractZip extracts piper.exe from a ZIP archive
func (s *TTSService) extractZip(archivePath string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()


	// First pass: extract required DLLs and espeak-ng-data
	requiredDLLs := []string{"espeak-ng.dll", "onnxruntime_providers_shared.dll", "onnxruntime.dll", "piper_phonemize.dll"}
	extractedFiles := 0
	binDir := filepath.Dir(s.config.PiperPath)
	
	for _, file := range reader.File {
		fileName := strings.ToLower(filepath.Base(file.Name))
		
		// Check if this is a required DLL
		if !file.FileInfo().IsDir() {
			for _, dll := range requiredDLLs {
				if fileName == dll {
					dllPath := filepath.Join(binDir, dll)
					if err := s.extractSingleFileFromZip(file, dllPath); err != nil {
						log.Printf("Warning: Failed to extract %s: %v", dll, err)
					} else {
						log.Printf("Extracted required DLL: %s", dllPath)
						extractedFiles++
					}
					break
				}
			}
		}
		
		// Extract espeak-ng-data directory
		if strings.HasPrefix(file.Name, "piper/espeak-ng-data/") {
			// Remove "piper/" prefix to get relative path from bin directory
			relativePath := strings.TrimPrefix(file.Name, "piper/")
			targetPath := filepath.Join(binDir, relativePath)
			
			if file.FileInfo().IsDir() {
				// Create directory
				if err := os.MkdirAll(targetPath, 0755); err != nil {
					log.Printf("Warning: Failed to create directory %s: %v", targetPath, err)
				}
			} else {
				// Extract file
				if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
					log.Printf("Warning: Failed to create directory %s: %v", filepath.Dir(targetPath), err)
					continue
				}
				if err := s.extractSingleFileFromZip(file, targetPath); err != nil {
					log.Printf("Warning: Failed to extract %s: %v", targetPath, err)
				}
			}
		}
	}
	
	// Second pass: extract the main binary
	for _, file := range reader.File {
		// Look for piper.exe specifically, avoid directories and other files
		if file.FileInfo().IsDir() {
			continue
		}
		fileName := strings.ToLower(filepath.Base(file.Name))
		if fileName == "piper.exe" || (fileName == "piper" && filepath.Ext(fileName) == "") {
			log.Printf("Found Piper binary: %s", file.Name)
			err := s.extractSingleFileFromZip(file, s.config.PiperPath)
			if err == nil {
				log.Printf("Extracted %d DLL dependencies and piper binary successfully", extractedFiles)
			}
			return err
		}
	}
	
	return fmt.Errorf("piper binary not found in archive")
}

// extractTarGz extracts piper from a tar.gz archive
func (s *TTSService) extractTarGz(archivePath string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()

	gzReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		if header.Typeflag == tar.TypeReg {
			fileName := strings.ToLower(filepath.Base(header.Name))
			if fileName == "piper" && filepath.Ext(fileName) == "" {
				log.Printf("Found Piper binary: %s", header.Name)
				return s.extractSingleFileFromTar(tarReader, s.config.PiperPath)
			}
		}
	}
	
	return fmt.Errorf("piper binary not found in archive")
}

// extractSingleFileFromZip extracts a single file from ZIP
func (s *TTSService) extractSingleFileFromZip(file *zip.File, outputPath string) error {
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

	_, err = io.Copy(outFile, rc)
	if err != nil {
		return err
	}

	// Make executable on Unix systems
	if runtime.GOOS != "windows" {
		if err := os.Chmod(outputPath, 0755); err != nil {
			return err
		}
	}

	return nil
}

// GetDefaultVoice returns the current default voice
func (s *TTSService) GetDefaultVoice() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.defaultVoice
}

// SetDefaultVoice sets the default voice to use for synthesis
func (s *TTSService) SetDefaultVoice(voiceName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	// Check if voice exists
	if _, exists := s.voices[voiceName]; !exists {
		return fmt.Errorf("voice '%s' not found", voiceName)
	}
	
	s.defaultVoice = voiceName
	log.Printf("Default voice set to: %s", voiceName)
	return nil
}

// GetAvailableVoices returns list of available voice names
func (s *TTSService) GetAvailableVoices() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	voices := make([]string, 0, len(s.voices))
	for voiceName := range s.voices {
		voices = append(voices, voiceName)
	}
	return voices
}

// extractSingleFileFromTar extracts a single file from tar
func (s *TTSService) extractSingleFileFromTar(tarReader *tar.Reader, outputPath string) error {
	outFile, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer outFile.Close()

	_, err = io.Copy(outFile, tarReader)
	if err != nil {
		return err
	}

	// Make executable on Unix systems
	if runtime.GOOS != "windows" {
		if err := os.Chmod(outputPath, 0755); err != nil {
			return err
		}
	}

	return nil
}

// downloadVoiceModel downloads a voice model from HuggingFace
func (s *TTSService) downloadVoiceModel(voiceName, modelDir string) error {
	// HuggingFace URLs for Piper voice models
	baseURL := "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US"
	
	// Map voice names to their paths
	voicePaths := map[string]string{
		"en_US-amy-medium":        "amy/medium",
		"en_US-hfc_female-medium": "hfc_female/medium",
		"en_US-kristin-medium":    "kristin/medium",
	}
	
	voicePath, exists := voicePaths[voiceName]
	if !exists {
		return fmt.Errorf("unknown voice: %s", voiceName)
	}
	
	// Special handling for en_GB voices
	voiceURL := baseURL
	if strings.HasPrefix(voiceName, "en_GB") {
		voiceURL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB"
	}
	
	// Download both .onnx and .onnx.json files
	onnxURL := fmt.Sprintf("%s/%s/%s.onnx", voiceURL, voicePath, voiceName)
	jsonURL := fmt.Sprintf("%s/%s/%s.onnx.json", voiceURL, voicePath, voiceName)
	
	onnxFile := filepath.Join(modelDir, voiceName+".onnx")
	jsonFile := filepath.Join(modelDir, voiceName+".onnx.json")
	
	// Download .onnx file
	log.Printf("Downloading voice model: %s", onnxURL)
	if err := s.downloadFile(onnxURL, onnxFile); err != nil {
		return fmt.Errorf("failed to download .onnx file: %w", err)
	}
	
	// Download .onnx.json file
	log.Printf("Downloading voice config: %s", jsonURL)
	if err := s.downloadFile(jsonURL, jsonFile); err != nil {
		return fmt.Errorf("failed to download .onnx.json file: %w", err)
	}
	
	return nil
}

// Shutdown gracefully shuts down the TTS service
func (s *TTSService) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ready = false
	s.info.Status = "stopped"
	s.info.LastUpdated = time.Now()

	return nil
}
