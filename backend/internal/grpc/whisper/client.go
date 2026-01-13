package whisper

import (
	"context"
	"fmt"
	"log"
	"time"

	whisperv1 "alice-backend/proto/whisper/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Client is a gRPC client for the Whisper service
type Client struct {
	address string
	conn    *grpc.ClientConn
	client  whisperv1.WhisperServiceClient
}

// NewClient creates a new Whisper gRPC client
func NewClient(address string) *Client {
	return &Client{
		address: address,
	}
}

// Connect establishes a connection to the Whisper gRPC service
func (c *Client) Connect(ctx context.Context) error {
	log.Printf("[WhisperClient] Connecting to Whisper service at %s", c.address)

	conn, err := grpc.DialContext(
		ctx,
		c.address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(50*1024*1024), // 50MB max message size
		),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to Whisper service: %w", err)
	}

	c.conn = conn
	c.client = whisperv1.NewWhisperServiceClient(conn)

	log.Println("[WhisperClient] Successfully connected to Whisper service")
	return nil
}

// ConnectWithRetry attempts to connect with retries
func (c *Client) ConnectWithRetry(ctx context.Context, maxRetries int) error {
	var lastErr error

	for i := 0; i < maxRetries; i++ {
		if i > 0 {
			waitTime := time.Duration(i) * time.Second
			log.Printf("[WhisperClient] Retry %d/%d after %v...", i+1, maxRetries, waitTime)
			time.Sleep(waitTime)
		}

		ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := c.Connect(ctx)
		cancel()

		if err == nil {
			return nil
		}

		lastErr = err
		log.Printf("[WhisperClient] Connection attempt %d failed: %v", i+1, err)
	}

	return fmt.Errorf("failed to connect after %d retries: %w", maxRetries, lastErr)
}

// HealthCheck checks if the Whisper service is healthy
func (c *Client) HealthCheck(ctx context.Context) (bool, error) {
	if c.client == nil {
		return false, fmt.Errorf("client not connected")
	}

	resp, err := c.client.HealthCheck(ctx, &whisperv1.HealthCheckRequest{})
	if err != nil {
		return false, fmt.Errorf("health check failed: %w", err)
	}

	return resp.Status == "healthy" && resp.ModelLoaded, nil
}

// Transcribe sends audio data to the Whisper service for transcription
func (c *Client) Transcribe(ctx context.Context, audioData []byte, language string) (string, error) {
	if c.client == nil {
		return "", fmt.Errorf("client not connected")
	}

	if len(audioData) == 0 {
		return "", fmt.Errorf("audio data cannot be empty")
	}

	log.Printf("[WhisperClient] Sending %d bytes of audio for transcription (language: %s)", len(audioData), language)

	req := &whisperv1.TranscribeRequest{
		AudioData:  audioData,
		Language:   language,
		SampleRate: 16000,
	}

	resp, err := c.client.Transcribe(ctx, req)
	if err != nil {
		return "", fmt.Errorf("transcription failed: %w", err)
	}

	log.Printf("[WhisperClient] Transcription completed in %dms: %s", resp.DurationMs, resp.Text)

	return resp.Text, nil
}

// Close closes the gRPC connection
func (c *Client) Close() error {
	if c.conn != nil {
		log.Println("[WhisperClient] Closing connection to Whisper service")
		return c.conn.Close()
	}
	return nil
}

// IsConnected returns true if the client is connected
func (c *Client) IsConnected() bool {
	return c.conn != nil && c.client != nil
}
