package config

import (
	"os"
	"strconv"
)

// Config holds the application configuration
type Config struct {
	Server   ServerConfig
	Models   ModelsConfig
	Features FeaturesConfig
}

// ServerConfig holds server configuration
type ServerConfig struct {
	Port string
}

// ModelsConfig holds model configuration
type ModelsConfig struct {
	Whisper WhisperConfig
	Piper   PiperConfig
	MiniLM  MiniLMConfig
}

// WhisperConfig holds Whisper model configuration
type WhisperConfig struct {
	Path string
}

// PiperConfig holds Piper model configuration
type PiperConfig struct {
	Path string
}

// MiniLMConfig holds MiniLM model configuration
type MiniLMConfig struct {
	Path string
}

// FeaturesConfig holds feature flags
type FeaturesConfig struct {
	STT        bool
	TTS        bool
	Embeddings bool
}

// LoadConfig loads configuration from environment variables
func LoadConfig() *Config {
	return &Config{
		Server: ServerConfig{
			Port: getEnv("PORT", "8765"),
		},
		Models: ModelsConfig{
			Whisper: WhisperConfig{
				Path: getEnv("WHISPER_MODEL_PATH", "./models/whisper-base"),
			},
			Piper: PiperConfig{
				Path: getEnv("PIPER_MODEL_PATH", "./models/piper"),
			},
			MiniLM: MiniLMConfig{
				Path: getEnv("MINILM_MODEL_PATH", "./models/minilm"),
			},
		},
		Features: FeaturesConfig{
			STT:        getBoolEnv("ENABLE_STT", true),
			TTS:        getBoolEnv("ENABLE_TTS", true),
			Embeddings: getBoolEnv("ENABLE_EMBEDDINGS", true),
		},
	}
}

// getEnv gets an environment variable with a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getBoolEnv gets a boolean environment variable with a default value
func getBoolEnv(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}
