package api

// Request and response models for API endpoints

// TranscriptionRequest represents a speech-to-text request
type TranscriptionRequest struct {
	AudioData  []float32 `json:"audio_data,omitempty"`
	SampleRate int       `json:"sample_rate,omitempty"`
	Language   string    `json:"language,omitempty"`
}

// TranscriptionResponse represents a speech-to-text response
type TranscriptionResponse struct {
	Text       string  `json:"text"`
	Confidence float64 `json:"confidence,omitempty"`
	Duration   float64 `json:"duration,omitempty"`
}

// TranscriptionFileRequest represents a file-based transcription request
type TranscriptionFileRequest struct {
	Language string `json:"language,omitempty"`
}

// SynthesisRequest represents a text-to-speech request
type SynthesisRequest struct {
	Text  string `json:"text"`
	Voice string `json:"voice,omitempty"`
}

// SynthesisResponse represents a text-to-speech response
type SynthesisResponse struct {
	Audio      []byte  `json:"audio"`
	Format     string  `json:"format"`
	SampleRate int     `json:"sample_rate"`
	Duration   float64 `json:"duration,omitempty"`
}

// Voice represents a TTS voice
type Voice struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Language string `json:"language"`
	Gender   string `json:"gender,omitempty"`
}

// VoicesResponse represents available TTS voices
type VoicesResponse struct {
	Voices []Voice `json:"voices"`
}

// ModelStatus represents the status of a model
type ModelStatus struct {
	Installed   bool   `json:"installed"`
	Downloading bool   `json:"downloading"`
	Error       string `json:"error,omitempty"`
}

// ModelsStatusResponse represents the status of all models
type ModelsStatusResponse struct {
	STT        ModelStatus `json:"stt"`
	TTS        ModelStatus `json:"tts"`
	Embeddings ModelStatus `json:"embeddings"`
}

// DownloadModelRequest represents a model download request
type DownloadModelRequest struct {
	Service string `json:"service"`
}

// DownloadModelResponse represents a model download response
type DownloadModelResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

// DownloadStatusResponse represents the download status response
type DownloadStatusResponse struct {
	STT        ModelStatus `json:"stt"`
	TTS        ModelStatus `json:"tts"`
	Embeddings ModelStatus `json:"embeddings"`
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status   string `json:"status"`
	Version  string `json:"version"`
	Runtime  string `json:"runtime"`
	Services struct {
		STT        bool `json:"stt"`
		TTS        bool `json:"tts"`
		Embeddings bool `json:"embeddings"`
	} `json:"services"`
}

// ReadyResponse represents a service readiness response
type ReadyResponse struct {
	Ready bool `json:"ready"`
}

// InfoResponse represents service information
type InfoResponse map[string]interface{}
