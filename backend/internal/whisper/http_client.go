package whisper

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"time"
)

// HttpClient is an HTTP client for the Whisper server
type HttpClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewHttpClient creates a new Whisper HTTP client
func NewHttpClient(baseURL string) *HttpClient {
	return &HttpClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Transcribe sends audio to whisper-server.exe via HTTP
func (c *HttpClient) Transcribe(ctx context.Context, audioData []byte, language string) (string, error) {
	if len(audioData) == 0 {
		return "", fmt.Errorf("audio data cannot be empty")
	}

	log.Printf("[HttpClient] Sending %d bytes of audio for transcription (language: %s)", len(audioData), language)

	// Convert audio bytes to float32 samples
	samples, err := convertAudioToSamples(audioData)
	if err != nil {
		return "", fmt.Errorf("failed to convert audio to samples: %w", err)
	}

	// Create WAV file in memory
	wavData, err := createWAV(samples)
	if err != nil {
		return "", fmt.Errorf("failed to create WAV: %w", err)
	}

	// Create multipart form data
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Add audio file
	part, err := writer.CreateFormFile("file", "audio.wav")
	if err != nil {
		return "", fmt.Errorf("failed to create form file: %w", err)
	}

	_, err = part.Write(wavData)
	if err != nil {
		return "", fmt.Errorf("failed to write audio data: %w", err)
	}

	// Add language parameter if specified
	if language != "" && language != "auto" {
		err = writer.WriteField("language", language)
		if err != nil {
			return "", fmt.Errorf("failed to write language field: %w", err)
		}
	}

	// Add response format
	err = writer.WriteField("response_format", "json")
	if err != nil {
		return "", fmt.Errorf("failed to write response format: %w", err)
	}

	err = writer.Close()
	if err != nil {
		return "", fmt.Errorf("failed to close multipart writer: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/inference", body)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Send request
	startTime := time.Now()
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("server returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	// Parse JSON response
	var result struct {
		Text     string `json:"text"`
		Language string `json:"language"`
		Segments []struct {
			Text string `json:"text"`
		} `json:"segments"`
	}

	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	duration := time.Since(startTime)
	log.Printf("[HttpClient] Transcription completed in %dms: %s", duration.Milliseconds(), result.Text)

	return result.Text, nil
}

// IsConnected checks if the HTTP server is reachable
func (c *HttpClient) IsConnected() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/", nil)
	if err != nil {
		return false
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

// HealthCheck checks if the Whisper HTTP server is healthy
func (c *HttpClient) HealthCheck(ctx context.Context) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/", nil)
	if err != nil {
		return false, fmt.Errorf("failed to create health check request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("health check failed: %w", err)
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK, nil
}
