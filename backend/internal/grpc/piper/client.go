package piper

import (
	"context"
	"fmt"
	"log"
	"time"

	piperv1 "alice-backend/proto/piper/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Client manages the connection to the Piper gRPC service
type Client struct {
	address string
	conn    *grpc.ClientConn
	client  piperv1.PiperServiceClient
}

// NewClient creates a new Piper gRPC client
func NewClient(address string) *Client {
	return &Client{
		address: address,
	}
}

// Connect establishes a connection to the Piper gRPC service
func (c *Client) Connect(ctx context.Context) error {
	log.Printf("[PiperClient] Connecting to Piper service at %s", c.address)

	conn, err := grpc.DialContext(
		ctx,
		c.address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(50*1024*1024), // 50MB max for large audio
			grpc.MaxCallSendMsgSize(10*1024*1024), // 10MB max for text
		),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to Piper service: %w", err)
	}

	c.conn = conn
	c.client = piperv1.NewPiperServiceClient(conn)

	log.Println("[PiperClient] Successfully connected to Piper service")
	return nil
}

// ConnectWithRetry attempts to connect to the Piper service with exponential backoff
func (c *Client) ConnectWithRetry(ctx context.Context, maxRetries int) error {
	var lastErr error

	for i := 0; i < maxRetries; i++ {
		if i > 0 {
			waitTime := time.Duration(i) * time.Second
			log.Printf("[PiperClient] Retry %d/%d after %v...", i+1, maxRetries, waitTime)
			time.Sleep(waitTime)
		}

		connectCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := c.Connect(connectCtx)
		cancel()

		if err == nil {
			return nil
		}

		lastErr = err
		log.Printf("[PiperClient] Connection attempt %d failed: %v", i+1, err)
	}

	return fmt.Errorf("failed to connect after %d retries: %w", maxRetries, lastErr)
}

// HealthCheck verifies the service is healthy and ready
func (c *Client) HealthCheck(ctx context.Context) (bool, error) {
	if c.client == nil {
		return false, fmt.Errorf("client not connected")
	}

	resp, err := c.client.HealthCheck(ctx, &piperv1.HealthCheckRequest{})
	if err != nil {
		return false, fmt.Errorf("health check failed: %w", err)
	}

	isHealthy := resp.Status == "healthy" && resp.ModelLoaded
	log.Printf("[PiperClient] Health check: %s, model loaded: %v, voices: %d",
		resp.Status, resp.ModelLoaded, len(resp.AvailableVoices))

	return isHealthy, nil
}

// Synthesize sends a text-to-speech request to the Piper service
func (c *Client) Synthesize(ctx context.Context, text, voice string, speed float32) ([]byte, error) {
	if c.client == nil {
		return nil, fmt.Errorf("client not connected")
	}

	if text == "" {
		return nil, fmt.Errorf("text cannot be empty")
	}

	// Default speed if not specified
	if speed == 0 {
		speed = 1.0
	}

	log.Printf("[PiperClient] Sending synthesis request for voice: %s, text length: %d", voice, len(text))

	req := &piperv1.SynthesizeRequest{
		Text:  text,
		Voice: voice,
		Speed: speed,
	}

	resp, err := c.client.Synthesize(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("synthesis failed: %w", err)
	}

	log.Printf("[PiperClient] Synthesis completed in %dms, audio size: %d bytes",
		resp.DurationMs, len(resp.AudioData))

	return resp.AudioData, nil
}

// GetVoices retrieves the list of available voices from the service
func (c *Client) GetVoices(ctx context.Context) ([]*piperv1.Voice, error) {
	if c.client == nil {
		return nil, fmt.Errorf("client not connected")
	}

	resp, err := c.client.GetVoices(ctx, &piperv1.GetVoicesRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to get voices: %w", err)
	}

	log.Printf("[PiperClient] Retrieved %d voices", len(resp.Voices))

	return resp.Voices, nil
}

// Close closes the connection to the Piper service
func (c *Client) Close() error {
	if c.conn != nil {
		log.Println("[PiperClient] Closing connection to Piper service")
		return c.conn.Close()
	}
	return nil
}

// IsConnected checks if the client has an active connection
func (c *Client) IsConnected() bool {
	return c.conn != nil && c.client != nil
}

// String returns a string representation of the client
func (c *Client) String() string {
	if c.IsConnected() {
		return fmt.Sprintf("PiperClient{address: %s, connected: true}", c.address)
	}
	return fmt.Sprintf("PiperClient{address: %s, connected: false}", c.address)
}
