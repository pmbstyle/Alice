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

// PiperGRPCClient is an interface for the Piper gRPC client (for dependency injection)
type PiperGRPCClient interface {
	Synthesize(ctx context.Context, text, voice string, speed float32) ([]byte, error)
	IsConnected() bool
	HealthCheck(ctx context.Context) (bool, error)
}

// TTSService provides text-to-speech functionality using Piper
type TTSService struct {
	mu           sync.RWMutex
	ready        bool
	voices       map[string]*Voice
	config       *Config
	info         *ServiceInfo
	defaultVoice string
	assetManager *embedded.AssetManager
	grpcClient   PiperGRPCClient // gRPC client for service mode
	useGRPC      bool            // Flag to enable gRPC mode
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
	baseDir := embedded.GetProductionBaseDirectory()
	assetManager := embedded.NewAssetManager(baseDir)
	
	return &TTSService{
		config:       config,
		voices:       make(map[string]*Voice),
		defaultVoice: "en_US-amy-medium",
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

func (s *TTSService) Initialize(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	log.Println("Initializing Piper TTS service...")

	if err := s.assetManager.EnsureAssets(ctx); err != nil {
		log.Printf("Warning: Failed to extract embedded assets: %v", err)
		log.Println("Falling back to download-based approach...")
	} else {
		log.Println("Successfully extracted embedded Piper assets")
		s.config.PiperPath = s.assetManager.GetBinaryPath("piper")
		s.config.ModelPath = s.assetManager.GetModelPath("piper")
	}

	if err := s.ensurePiper(ctx); err != nil {
		log.Printf("Warning: %v - TTS will use fallback audio", err)
	}

	s.loadVoices()

	s.ready = true
	s.info.Status = "ready"
	s.info.LastUpdated = time.Now()

	log.Println("Piper TTS service initialized successfully")
	return nil
}

func (s *TTSService) loadVoices() {
	// Define all available voices (metadata only)
	allVoices := []*Voice{
		{
			Name:        "en_US-amy-medium",
			Language:    "en-US",
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Amy - English US female voice (Piper)",
		},
		{
			Name:        "en_US-lessac-medium",
			Language:    "en-US",
			Gender:      "female", 
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Lessac - English US female voice (Piper)",
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
		{
			Name:        "en_GB-alba-medium",
			Language:    "en-GB",
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Alba - English GB female voice (Piper)",
		},
		{
			Name:        "es_ES-carme-medium",
			Language:    "es-ES",
			Gender:      "female", 
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Carme - Spanish ES female voice (Piper)",
		},
		{
			Name:        "es_MX-teresa-medium",
			Language:    "es-MX",
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Teresa - Spanish MX female voice (Piper)",
		},
		{
			Name:        "es_MX-laura-high",
			Language:    "es-MX",
			Gender:      "female",
			Quality:     "high",
			SampleRate:  22050,
			Description: "Laura - Spanish MX female voice (Piper)",
		},
		{
			Name:        "fr_FR-siwis-medium",
			Language:    "fr-FR",
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Siwis - French female voice (Piper)",
		},

		{
			Name:        "de_DE-eva_k-x_low",
			Language:    "de-DE",
			Gender:      "female",
			Quality:     "x_low",
			SampleRate:  16000,
			Description: "Eva K - German female voice (Piper)",
		},

		{
			Name:        "it_IT-paola-medium",
			Language:    "it-IT",
			Gender:      "female", 
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Paola - Italian female voice (Piper)",
		},

		{
			Name:        "pt_BR-lais-medium",
			Language:    "pt-BR",
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Lais - Portuguese BR female voice (Piper)",
		},

		{
			Name:        "ru_RU-irina-medium",
			Language:    "ru-RU",
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Irina - Russian female voice (Piper)",
		},
		{
			Name:        "zh_CN-huayan-medium",
			Language:    "zh-CN",
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Huayan - Chinese female voice (Piper)",
		},
		{
			Name:        "ja_JP-qmu_amaryllis-medium",
			Language:    "ja-JP",
			Gender:      "female", 
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Amaryllis - Japanese female voice (Piper)",
		},

		{
			Name:        "nl_NL-mls_5809-low",
			Language:    "nl-NL",
			Gender:      "female",
			Quality:     "low",
			SampleRate:  16000,
			Description: "MLS 5809 - Dutch female voice (Piper)",
		},

		{
			Name:        "no_NO-talesyntese-medium",
			Language:    "no-NO",
			Gender:      "multi",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Talesyntese - Norwegian voice (Piper)",
		},
		{
			Name:        "sv_SE-nst-medium",
			Language:    "sv-SE",
			Gender:      "multi",
			Quality:     "medium", 
			SampleRate:  22050,
			Description: "NST - Swedish voice (Piper)",
		},
		{
			Name:        "da_DK-talesyntese-medium",
			Language:    "da-DK",
			Gender:      "multi",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Talesyntese - Danish voice (Piper)",
		},
		{
			Name:        "fi_FI-anna-medium",
			Language:    "fi-FI", 
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Anna - Finnish female voice (Piper)",
		},
		{
			Name:        "pl_PL-mls_6892-low",
			Language:    "pl-PL",
			Gender:      "female",
			Quality:     "low",
			SampleRate:  16000,
			Description: "MLS 6892 - Polish female voice (Piper)",
		},
		{
			Name:        "uk_UA-ukrainian_tts-medium",
			Language:    "uk-UA",
			Gender:      "multi",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Ukrainian TTS - Ukrainian voice (Piper)",
		},
		{
			Name:        "hi_IN-female-medium",
			Language:    "hi-IN",
			Gender:      "female", 
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Female - Hindi voice (Piper)",
		},
		{
			Name:        "ar_JO-amina-medium",
			Language:    "ar-JO",
			Gender:      "female",
			Quality:     "medium",
			SampleRate:  22050,
			Description: "Amina - Arabic female voice (Piper)",
		},
	}

	// Check which voices have models available (installed)
	modelDir := "models/piper"
	if s.config.ModelPath != "" {
		modelDir = s.config.ModelPath
	}

	s.voices = make(map[string]*Voice)
	installedVoices := []*Voice{}

	for _, voice := range allVoices {
		// Check if model files exist
		modelFile := filepath.Join(modelDir, voice.Name+".onnx")
		configFile := filepath.Join(modelDir, voice.Name+".onnx.json")

		// Check embedded assets
		embeddedModel := s.assetManager.GetVoiceModelPath(voice.Name)
		embeddedConfig := embeddedModel + ".json"

		isInstalled := false
		if s.assetManager.IsAssetAvailable(embeddedModel) && s.assetManager.IsAssetAvailable(embeddedConfig) {
			isInstalled = true
			log.Printf("Found embedded voice: %s", voice.Name)
		} else if _, err := os.Stat(modelFile); err == nil {
			if _, err := os.Stat(configFile); err == nil {
				isInstalled = true
				log.Printf("Found installed voice: %s", voice.Name)
			}
		}

		// Always register all voices in the map (for UI), but mark which are ready
		s.voices[voice.Name] = voice

		// Only add to installed list if model exists
		if isInstalled {
			installedVoices = append(installedVoices, voice)
		}
	}

	s.info.Voices = installedVoices // Only show installed voices in service info
	log.Printf("Registered %d voices (%d installed, %d available for download)",
		len(s.voices), len(installedVoices), len(allVoices)-len(installedVoices))
}

func (s *TTSService) IsReady() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ready
}

// SetGRPCClient sets the gRPC client for the TTS service
func (s *TTSService) SetGRPCClient(client PiperGRPCClient) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.grpcClient = client
	s.useGRPC = true
	log.Println("[TTSService] gRPC client enabled")
}

func (s *TTSService) GetVoices() []*Voice {
	s.mu.RLock()
	defer s.mu.RUnlock()

	voices := make([]*Voice, 0, len(s.voices))
	for _, voice := range s.voices {
		voices = append(voices, voice)
	}
	return voices
}

func (s *TTSService) GetInfo() *ServiceInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	info := *s.info
	info.LastUpdated = time.Now()
	return &info
}

// synthesizeChunked splits long text into chunks and synthesizes each chunk separately
func (s *TTSService) synthesizeChunked(ctx context.Context, text, voice string, maxChunkSize int) ([]byte, error) {
	chunks := splitTextIntoChunks(text, maxChunkSize)
	log.Printf("[TTSService] Split text into %d chunks", len(chunks))

	var allAudioData []byte
	wavHeaderSize := 44

	for i, chunk := range chunks {
		log.Printf("[TTSService] Synthesizing chunk %d/%d (%d chars)", i+1, len(chunks), len(chunk))

		// Synthesize this chunk
		var chunkAudio []byte
		var err error

		// Try gRPC first if available
		s.mu.RLock()
		useGRPC := s.useGRPC && s.grpcClient != nil && s.grpcClient.IsConnected()
		s.mu.RUnlock()

		if useGRPC {
			speed := s.config.Speed
			if speed == 0 {
				speed = 1.0
			}
			chunkAudio, err = s.grpcClient.Synthesize(ctx, chunk, voice, speed)
		} else {
			chunkAudio, err = s.synthesizeWithPiper(ctx, chunk, voice)
		}

		if err != nil {
			log.Printf("[TTSService] Failed to synthesize chunk %d: %v", i+1, err)
			return nil, fmt.Errorf("failed to synthesize chunk %d: %w", i+1, err)
		}

		// For first chunk, include WAV header
		if i == 0 {
			allAudioData = append(allAudioData, chunkAudio...)
		} else {
			// For subsequent chunks, skip WAV header and append only audio data
			if len(chunkAudio) > wavHeaderSize {
				allAudioData = append(allAudioData, chunkAudio[wavHeaderSize:]...)
			}
		}
	}

	// Update WAV header with correct total size
	if len(allAudioData) > wavHeaderSize {
		totalSize := uint32(len(allAudioData) - 8)
		allAudioData[4] = byte(totalSize)
		allAudioData[5] = byte(totalSize >> 8)
		allAudioData[6] = byte(totalSize >> 16)
		allAudioData[7] = byte(totalSize >> 24)

		dataSize := uint32(len(allAudioData) - wavHeaderSize)
		allAudioData[40] = byte(dataSize)
		allAudioData[41] = byte(dataSize >> 8)
		allAudioData[42] = byte(dataSize >> 16)
		allAudioData[43] = byte(dataSize >> 24)
	}

	log.Printf("[TTSService] Chunked synthesis complete: %d total bytes", len(allAudioData))
	return allAudioData, nil
}

// splitTextIntoChunks splits text into chunks at sentence boundaries
func splitTextIntoChunks(text string, maxChunkSize int) []string {
	// If text is shorter than max, return as-is
	if len(text) <= maxChunkSize {
		return []string{text}
	}

	var chunks []string
	sentences := strings.Split(text, ". ")

	currentChunk := ""
	for i, sentence := range sentences {
		// Add period back except for last sentence
		if i < len(sentences)-1 {
			sentence = sentence + "."
		}

		// If adding this sentence would exceed max, start new chunk
		if len(currentChunk)+len(sentence) > maxChunkSize && currentChunk != "" {
			chunks = append(chunks, strings.TrimSpace(currentChunk))
			currentChunk = sentence
		} else {
			if currentChunk != "" {
				currentChunk += " "
			}
			currentChunk += sentence
		}
	}

	// Add final chunk
	if currentChunk != "" {
		chunks = append(chunks, strings.TrimSpace(currentChunk))
	}

	return chunks
}

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

	// Split long text into chunks to avoid buffer limits
	const maxChunkSize = 500 // characters per chunk
	if len(text) > maxChunkSize {
		log.Printf("[TTSService] Text is long (%d chars), splitting into chunks", len(text))
		return s.synthesizeChunked(ctx, text, voice, maxChunkSize)
	}

	// Try gRPC mode if available
	s.mu.RLock()
	if s.useGRPC && s.grpcClient != nil && s.grpcClient.IsConnected() {
		s.mu.RUnlock()
		log.Printf("[TTSService] Using Piper gRPC service for synthesis")
		speed := s.config.Speed
		if speed == 0 {
			speed = 1.0
		}
		return s.grpcClient.Synthesize(ctx, text, voice, speed)
	}

	// Fallback to CLI mode
	log.Printf("[TTSService] Using Piper CLI mode for synthesis")
	selectedVoice, exists := s.voices[voice]
	
	if !exists {
		log.Printf("Voice '%s' not found, trying default voices...", voice)
		if fallbackVoice, exists := s.voices[s.defaultVoice]; exists {
			selectedVoice = fallbackVoice
			voice = s.defaultVoice
			log.Printf("Using default fallback voice: %s", s.defaultVoice)
		} else {
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

	if err := s.ensureVoiceModel(ctx, voice); err != nil {
		log.Printf("Failed to ensure voice model %s: %v", voice, err)
		// Fall back to placeholder for now
		return s.generatePlaceholderWAV(text, selectedVoice), nil
	}

	audioData, err := s.synthesizeWithPiper(ctx, text, voice)
	if err != nil {
		log.Printf("Failed to synthesize with Piper: %v", err)
			return s.generatePlaceholderWAV(text, selectedVoice), nil
	}

	return audioData, nil
}

func (s *TTSService) generatePlaceholderWAV(text string, voice *Voice) []byte {

	const (
		sampleRate = 22050
		baseDuration = 0.8 // Base duration in seconds
	)

	textDuration := float64(len(text)) * 0.1 // ~10 characters per second
	if textDuration < baseDuration {
		textDuration = baseDuration
	}
	if textDuration > 10.0 {
		textDuration = 10.0
	}
	
	numSamples := int(sampleRate * textDuration)

	wav := make([]byte, 44+numSamples*2)

	copy(wav[0:4], []byte("RIFF"))
	fileSize := uint32(44 + numSamples*2 - 8)
	wav[4] = byte(fileSize & 0xFF)
	wav[5] = byte((fileSize >> 8) & 0xFF)
	wav[6] = byte((fileSize >> 16) & 0xFF)
	wav[7] = byte((fileSize >> 24) & 0xFF)

	copy(wav[8:12], []byte("WAVE"))

	copy(wav[12:16], []byte("fmt "))
	wav[16] = 16
	wav[20] = 1
	wav[22] = 1

	wav[24] = byte(sampleRate & 0xFF)
	wav[25] = byte((sampleRate >> 8) & 0xFF)
	wav[26] = byte((sampleRate >> 16) & 0xFF)
	wav[27] = byte((sampleRate >> 24) & 0xFF)

	byteRate := uint32(sampleRate * 2)
	wav[28] = byte(byteRate & 0xFF)
	wav[29] = byte((byteRate >> 8) & 0xFF)
	wav[30] = byte((byteRate >> 16) & 0xFF)
	wav[31] = byte((byteRate >> 24) & 0xFF)

	wav[32] = 2

	wav[34] = 16

	copy(wav[36:40], []byte("data"))

	dataSize := uint32(numSamples * 2)
	wav[40] = byte(dataSize & 0xFF)
	wav[41] = byte((dataSize >> 8) & 0xFF)
	wav[42] = byte((dataSize >> 16) & 0xFF)
	wav[43] = byte((dataSize >> 24) & 0xFF)

	s.generateSpeechLikeAudio(wav[44:], numSamples, text, voice)

	log.Printf("Generated %d samples (%.2f seconds) of audio for text: %s", numSamples, textDuration, text[:min(50, len(text))])
	return wav
}

func (s *TTSService) generateSpeechLikeAudio(buffer []byte, numSamples int, text string, voice *Voice) {
	
	baseFreq := 150.0 // Base frequency for speech
	if voice.Gender == "female" {
		baseFreq = 220.0
	}

	words := len(strings.Fields(text))
	if words == 0 {
		words = 1
	}

	samplesPerWord := numSamples / words
	if samplesPerWord < 1000 {
		samplesPerWord = 1000
	}

	sampleIndex := 0
	
	for wordIndex := 0; wordIndex < words && sampleIndex < numSamples-samplesPerWord; wordIndex++ {
		wordSamples := samplesPerWord
		if sampleIndex + wordSamples > numSamples {
			wordSamples = numSamples - sampleIndex
		}
		s.generateWordAudio(buffer[sampleIndex*2:(sampleIndex+wordSamples)*2], wordSamples, baseFreq, wordIndex)
		sampleIndex += wordSamples
		pauseSamples := min(500, numSamples-sampleIndex)
		s.generateSilence(buffer[sampleIndex*2:(sampleIndex+pauseSamples)*2], pauseSamples)
		sampleIndex += pauseSamples
	}
	
	if sampleIndex < numSamples {
		remaining := numSamples - sampleIndex
		s.generateSilence(buffer[sampleIndex*2:], remaining)
	}
}

func (s *TTSService) generateWordAudio(buffer []byte, samples int, baseFreq float64, wordIndex int) {
	
	for i := 0; i < samples; i++ {
		t := float64(i) / 22050.0
		progress := float64(i) / float64(samples)
		freqModulation := 1.0 + 0.3*math.Sin(progress*math.Pi*4)
		currentFreq := baseFreq * freqModulation
		formant1 := 0.6 * math.Sin(2 * math.Pi * currentFreq * t)
		formant2 := 0.3 * math.Sin(2 * math.Pi * currentFreq * 2.5 * t)
		formant3 := 0.15 * math.Sin(2 * math.Pi * currentFreq * 4.2 * t)
		formant4 := 0.08 * math.Sin(2 * math.Pi * currentFreq * 6.8 * t)
		waveform := formant1 + formant2 + formant3 + formant4
		var envelope float64
		if progress < 0.1 {
			envelope = progress * 10
		} else if progress > 0.8 {
			envelope = (1.0 - progress) * 5
		} else {
			envelope = 0.8 + 0.2*math.Sin(progress*math.Pi*6)
		}
		waveform *= envelope
		breathNoise := (math.Sin(t*1000)*0.1 + math.Sin(t*1700)*0.05) * 0.3
		waveform += breathNoise
		randomNoise := (float64((i*31+wordIndex*47)%200)/200.0 - 0.5) * 0.1
		waveform += randomNoise
		if waveform > 0.7 {
			waveform = 0.7 + (waveform-0.7)*0.3
		} else if waveform < -0.7 {
			waveform = -0.7 + (waveform+0.7)*0.3
		}
		sample := int16(waveform * 12000)
		buffer[i*2] = byte(sample & 0xFF)
		buffer[i*2+1] = byte((sample >> 8) & 0xFF)
	}
}

func (s *TTSService) generateSilence(buffer []byte, samples int) {
	for i := 0; i < samples*2; i++ {
		buffer[i] = 0
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (s *TTSService) ensurePiper(ctx context.Context) error {
	if s.config.PiperPath == "" {
		if runtime.GOOS == "windows" {
			s.config.PiperPath = "bin/piper.exe"
		} else {
			s.config.PiperPath = "bin/piper"
		}
	} else {
		if runtime.GOOS == "windows" && !strings.HasSuffix(s.config.PiperPath, ".exe") {
			s.config.PiperPath = s.config.PiperPath + ".exe"
		}
	}


	binaryExists := false
	if _, err := os.Stat(s.config.PiperPath); err == nil {
		binaryExists = true
		log.Printf("Piper binary already exists: %s", s.config.PiperPath)
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
	
	if err := s.downloadPiperBinary(); err != nil {
		log.Printf("Failed to download Piper binary: %v", err)
		log.Printf("Please download Piper manually from: https://github.com/rhasspy/piper/releases")
		log.Printf("Extract the binary to: %s", s.config.PiperPath)
		return fmt.Errorf("piper binary not found - please download manually")
	}
	
	log.Printf("Piper binary downloaded successfully: %s", s.config.PiperPath)
	return nil
}

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

	embeddedModelPath := s.assetManager.GetVoiceModelPath(voice)
	embeddedConfigPath := embeddedModelPath + ".json"
	
	if s.assetManager.IsAssetAvailable(embeddedModelPath) && s.assetManager.IsAssetAvailable(embeddedConfigPath) {
		log.Printf("Using embedded voice model: %s", voice)
		modelFile = embeddedModelPath
		configFile = embeddedConfigPath
	}

	if _, err := os.Stat(modelFile); err == nil {
		if _, err := os.Stat(configFile); err == nil {
			return nil
		}
	}

	log.Printf("Voice model %s not found, attempting to download...", voice)
	
	if err := s.downloadVoiceModel(voice, modelDir); err != nil {
		log.Printf("Failed to download voice model: %v", err)
		log.Printf("Please download manually from: https://huggingface.co/rhasspy/piper-voices/tree/main")
		log.Printf("Place files at: %s and %s", modelFile, configFile)
		return fmt.Errorf("voice model not found - please download manually")
	}
	
	log.Printf("Voice model %s downloaded successfully", voice)
	return nil
}

func (s *TTSService) synthesizeWithPiper(ctx context.Context, text, voice string) ([]byte, error) {
	modelDir := "models/piper"
	if s.config.ModelPath != "" {
		modelDir = s.config.ModelPath
	}

	modelFile := filepath.Join(modelDir, voice+".onnx")

	tmpDir := os.TempDir()
	inputFile := filepath.Join(tmpDir, fmt.Sprintf("piper_input_%d.txt", time.Now().UnixNano()))
	outputFile := filepath.Join(tmpDir, fmt.Sprintf("piper_output_%d.wav", time.Now().UnixNano()))

	defer os.Remove(inputFile)
	defer os.Remove(outputFile)

	if err := os.WriteFile(inputFile, []byte(text), 0644); err != nil {
		return nil, fmt.Errorf("failed to write input file: %w", err)
	}

	args := []string{
		"--model", modelFile,
		"--output-file", outputFile,
	}

	if s.config.Speed > 0 && s.config.Speed != 1.0 {
		args = append(args, "--length_scale", fmt.Sprintf("%.2f", 1.0/s.config.Speed))
	}

	cmd := exec.CommandContext(ctx, s.config.PiperPath, args...)
	cmd.Stdin = strings.NewReader(text)
	
	espeakDataPath := filepath.Join(filepath.Dir(s.config.PiperPath), "espeak-ng-data")
	cmd.Env = append(os.Environ(), "ESPEAK_DATA_PATH="+espeakDataPath)

	_, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to run piper: %w", err)
	}

	audioData, err := os.ReadFile(outputFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read output file: %w", err)
	}

	log.Printf("Piper synthesis complete: %d bytes", len(audioData))
	return audioData, nil
}

func (s *TTSService) downloadPiperBinary() error {
	var downloadURLs []string
	var fileName string
	
	switch runtime.GOOS {
	case "windows":
		downloadURLs = []string{
			"https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip",
		}
		fileName = "piper_windows_amd64.zip"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			downloadURLs = []string{
				"https://raw.githubusercontent.com/pmbstyle/Alice/main/assets/binaries/piper-macos-arm64",
				"https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_aarch64.tar.gz",
			}
			fileName = "piper-macos-arm64"
		} else {
			downloadURLs = []string{
				"https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_macos_x64.tar.gz",
			}
			fileName = "piper_macos_x64.tar.gz"
		}
	case "linux":
		if runtime.GOARCH == "arm64" {
			downloadURLs = []string{
				"https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_aarch64.tar.gz",
			}
			fileName = "piper_linux_aarch64.tar.gz"
		} else if runtime.GOARCH == "arm" {
			downloadURLs = []string{
				"https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_armv7l.tar.gz",
			}
			fileName = "piper_linux_armv7l.tar.gz"
		} else {
			downloadURLs = []string{
				"https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz",
			}
			fileName = "piper_linux_x86_64.tar.gz"
		}
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	log.Printf("Downloading Piper binary for %s/%s", runtime.GOOS, runtime.GOARCH)
	downloadPath := filepath.Join("bin", fileName)
	var lastErr error
	for i, downloadURL := range downloadURLs {
		log.Printf("Attempting Piper download from source %d/%d: %s", i+1, len(downloadURLs), downloadURL)
		if err := s.downloadFileWithRetry(downloadURL, downloadPath, 2); err != nil {
			lastErr = err
			log.Printf("Piper download source %d failed: %v", i+1, err)
			continue
		}
		log.Printf("Piper download successful from source %d", i+1)
		break
	}
	if _, err := os.Stat(downloadPath); err != nil {
		return fmt.Errorf("failed to download Piper binary from any source: %w", lastErr)
	}

	if runtime.GOOS == "darwin" && runtime.GOARCH == "arm64" && fileName == "piper-macos-arm64" {
		targetPath := filepath.Join("bin", "piper")
		if err := os.Rename(downloadPath, targetPath); err != nil {
			return fmt.Errorf("failed to move binary: %w", err)
		}
		if err := os.Chmod(targetPath, 0755); err != nil {
			return fmt.Errorf("failed to make binary executable: %w", err)
		}
		log.Printf("Direct Piper binary installed: %s", targetPath)
	} else {
		defer os.Remove(downloadPath)
		if err := s.extractPiperBinary(downloadPath); err != nil {
			return fmt.Errorf("failed to extract binary: %w", err)
		}
	}
	
	log.Printf("Piper binary installed successfully")
	return nil
}

func (s *TTSService) downloadFile(url, filepath string) error {
	client := &http.Client{
		Timeout: 5 * time.Minute,
	}
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("User-Agent", "AliceElectron/1.0 (compatible; file downloader)")
	req.Header.Set("Accept", "application/octet-stream, */*")
	req.Header.Set("Accept-Encoding", "identity")
	req.Header.Set("Connection", "keep-alive")
	
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return fmt.Errorf("file not found (status: 404) - Piper release may have been moved")
	case http.StatusTooManyRequests:
		return fmt.Errorf("rate limited (status: 429) - GitHub is limiting downloads")
	case http.StatusServiceUnavailable:
		return fmt.Errorf("service unavailable (status: 503) - GitHub servers temporarily down")
	default:
		if resp.StatusCode >= 400 {
			return fmt.Errorf("download failed (status: %d) - %s", resp.StatusCode, resp.Status)
		}
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

func (s *TTSService) downloadFileWithRetry(url, filepath string, maxRetries int) error {
	var lastErr error
	
	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			waitTime := time.Duration(1<<uint(attempt-2)) * 2 * time.Second
			log.Printf("Retrying download in %v (attempt %d/%d)", waitTime, attempt, maxRetries)
			time.Sleep(waitTime)
		}
		log.Printf("Download attempt %d/%d from: %s", attempt, maxRetries, url)
		if err := s.downloadFile(url, filepath); err != nil {
			lastErr = err
			log.Printf("Attempt %d failed: %v", attempt, err)
			
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

func (s *TTSService) extractPiperBinary(archivePath string) error {
	if strings.HasSuffix(archivePath, ".zip") {
		return s.extractZip(archivePath)
	} else if strings.HasSuffix(archivePath, ".tar.gz") {
		return s.extractTarGz(archivePath)
	}
	return fmt.Errorf("unsupported archive format: %s", archivePath)
}

func (s *TTSService) extractZip(archivePath string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()


	requiredDLLs := []string{"espeak-ng.dll", "onnxruntime_providers_shared.dll", "onnxruntime.dll", "piper_phonemize.dll"}
	extractedFiles := 0
	binDir := filepath.Dir(s.config.PiperPath)
	
	for _, file := range reader.File {
		fileName := strings.ToLower(filepath.Base(file.Name))
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
		if strings.HasPrefix(file.Name, "piper/espeak-ng-data/") {
			relativePath := strings.TrimPrefix(file.Name, "piper/")
			targetPath := filepath.Join(binDir, relativePath)
			
			if file.FileInfo().IsDir() {
				if err := os.MkdirAll(targetPath, 0755); err != nil {
					log.Printf("Warning: Failed to create directory %s: %v", targetPath, err)
				}
			} else {
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
	
	for _, file := range reader.File {
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

	if runtime.GOOS != "windows" {
		if err := os.Chmod(outputPath, 0755); err != nil {
			return err
		}
	}

	return nil
}

func (s *TTSService) GetDefaultVoice() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.defaultVoice
}

func (s *TTSService) SetDefaultVoice(voiceName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	if _, exists := s.voices[voiceName]; !exists {
		return fmt.Errorf("voice '%s' not found", voiceName)
	}
	
	s.defaultVoice = voiceName
	log.Printf("Default voice set to: %s", voiceName)
	return nil
}

func (s *TTSService) GetAvailableVoices() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	voices := make([]string, 0, len(s.voices))
	for voiceName := range s.voices {
		voices = append(voices, voiceName)
	}
	return voices
}

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

	if runtime.GOOS != "windows" {
		if err := os.Chmod(outputPath, 0755); err != nil {
			return err
		}
	}

	return nil
}

func (s *TTSService) downloadVoiceModel(voiceName, modelDir string) error {
	baseURL := "https://huggingface.co/rhasspy/piper-voices/resolve/main"
	
	voiceMapping := map[string]struct {
		lang     string
		voice    string
		quality  string
	}{
		"en_US-amy-medium":        {"en/en_US", "amy", "medium"},
		"en_US-lessac-medium":     {"en/en_US", "lessac", "medium"},
		"en_US-hfc_female-medium": {"en/en_US", "hfc_female", "medium"},
		"en_US-kristin-medium":    {"en/en_US", "kristin", "medium"},
		"en_GB-alba-medium": {"en/en_GB", "alba", "medium"},

		"es_ES-carme-medium":  {"es/es_ES", "carme", "medium"},
		"es_MX-teresa-medium": {"es/es_MX", "teresa", "medium"},

		"fr_FR-siwis-medium": {"fr/fr_FR", "siwis", "medium"},

		"de_DE-eva_k-x_low": {"de/de_DE", "eva_k", "x_low"},

		"it_IT-paola-medium": {"it/it_IT", "paola", "medium"},

		"pt_BR-lais-medium": {"pt/pt_BR", "lais", "medium"},

		"ru_RU-irina-medium": {"ru/ru_RU", "irina", "medium"},

		"zh_CN-huayan-medium": {"zh/zh_CN", "huayan", "medium"},

		"ja_JP-qmu_amaryllis-medium": {"ja/ja_JP", "qmu_amaryllis", "medium"},

		"nl_NL-mls_5809-low": {"nl/nl_NL", "mls_5809", "low"},

		"no_NO-talesyntese-medium": {"no/no_NO", "talesyntese", "medium"},

		"sv_SE-nst-medium": {"sv/sv_SE", "nst", "medium"},

		"da_DK-talesyntese-medium": {"da/da_DK", "talesyntese", "medium"},

		"fi_FI-anna-medium": {"fi/fi_FI", "anna", "medium"},

		"pl_PL-mls_6892-low": {"pl/pl_PL", "mls_6892", "low"},

		"uk_UA-ukrainian_tts-medium": {"uk/uk_UA", "ukrainian_tts", "medium"},

		"hi_IN-female-medium": {"hi/hi_IN", "female", "medium"},

		"ar_JO-amina-medium": {"ar/ar_JO", "amina", "medium"},
	}
	
	voiceInfo, exists := voiceMapping[voiceName]
	if !exists {
		return fmt.Errorf("unknown voice: %s", voiceName)
	}
	
	onnxURL := fmt.Sprintf("%s/%s/%s/%s/%s.onnx", baseURL, voiceInfo.lang, voiceInfo.voice, voiceInfo.quality, voiceName)
	jsonURL := fmt.Sprintf("%s/%s/%s/%s/%s.onnx.json", baseURL, voiceInfo.lang, voiceInfo.voice, voiceInfo.quality, voiceName)
	
	onnxFile := filepath.Join(modelDir, voiceName+".onnx")
	jsonFile := filepath.Join(modelDir, voiceName+".onnx.json")
	
	log.Printf("Downloading voice model: %s", onnxURL)
	if err := s.downloadFileWithRetry(onnxURL, onnxFile, 3); err != nil {
		return fmt.Errorf("failed to download .onnx file: %w", err)
	}
	
	log.Printf("Downloading voice config: %s", jsonURL)
	if err := s.downloadFileWithRetry(jsonURL, jsonFile, 3); err != nil {
		return fmt.Errorf("failed to download .onnx.json file: %w", err)
	}
	
	return nil
}

func (s *TTSService) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.ready = false
	s.info.Status = "stopped"
	s.info.LastUpdated = time.Now()

	return nil
}
