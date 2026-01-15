package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	grpcPiper "alice-backend/internal/grpc/piper"
	"alice-backend/internal/piper"
	piperv1 "alice-backend/proto/piper/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

var (
	port      = flag.Int("port", 50052, "The gRPC server port")
	modelDir  = flag.String("model-dir", "models/piper", "Path to Piper models directory")
	piperPath = flag.String("piper-path", "", "Path to Piper binary (auto-detect if empty)")
	logLevel  = flag.String("log-level", "INFO", "Log level (DEBUG, INFO, WARN, ERROR)")
)

func main() {
	flag.Parse()

	// Configure logging to stdout instead of stderr
	log.SetOutput(os.Stdout)
	log.SetFlags(log.LstdFlags)

	log.Printf("========================================")
	log.Printf("  Piper gRPC Service")
	log.Printf("========================================")
	log.Printf("Starting Piper gRPC Service on port %d", *port)
	log.Printf("Model directory: %s", *modelDir)
	log.Printf("Log level: %s", *logLevel)

	// Create TTS service configuration
	config := &piper.Config{
		PiperPath: *piperPath, // Empty string means auto-detect
		ModelPath: *modelDir,
		Voice:     "en_US-amy-medium", // Default voice
		Speed:     1.0,
	}

	// Initialize TTS service
	log.Println("Initializing Piper TTS service...")
	ttsService := piper.NewTTSService(config)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := ttsService.Initialize(ctx); err != nil {
		log.Fatalf("Failed to initialize Piper TTS service: %v", err)
	}

	// Log available voices
	voices := ttsService.GetVoices()
	log.Printf("✓ Piper TTS service initialized successfully")
	log.Printf("✓ Loaded %d voice models", len(voices))

	// Create gRPC server with increased message size limits
	grpcServer := grpc.NewServer(
		grpc.MaxRecvMsgSize(50 * 1024 * 1024), // 50MB max receive
		grpc.MaxSendMsgSize(50 * 1024 * 1024), // 50MB max send
	)

	// Register Piper service
	piperServer := grpcPiper.NewServer(ttsService)
	piperv1.RegisterPiperServiceServer(grpcServer, piperServer)

	// Register reflection service (useful for debugging with grpcurl)
	reflection.Register(grpcServer)

	log.Println("✓ gRPC services registered")
	log.Printf("✓ Server configured: %s", piperServer.String())

	// Start listening
	address := fmt.Sprintf(":%d", *port)
	listener, err := net.Listen("tcp", address)
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", address, err)
	}

	log.Printf("========================================")
	log.Printf("✓ Piper gRPC service listening on %s", address)
	log.Printf("✓ Service is ready to accept synthesis requests")
	log.Printf("========================================")

	// Start server in goroutine
	serverErrors := make(chan error, 1)
	go func() {
		if err := grpcServer.Serve(listener); err != nil {
			serverErrors <- fmt.Errorf("gRPC server error: %w", err)
		}
	}()

	// Wait for interrupt signal or server error
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	select {
	case <-sigChan:
		log.Println("Received interrupt signal, shutting down...")
	case err := <-serverErrors:
		log.Printf("Server error: %v", err)
	}

	// Graceful shutdown
	log.Println("Shutting down Piper gRPC service...")
	grpcServer.GracefulStop()
	log.Println("✓ Service stopped gracefully")
}
