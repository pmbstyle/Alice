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

	"alice-backend/internal/grpc/whisper"
	whisperStt "alice-backend/internal/whisper"
	whisperv1 "alice-backend/proto/whisper/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

var (
	port      = flag.Int("port", 50051, "The gRPC server port")
	modelPath = flag.String("model", "models/whisper-base.bin", "Path to the Whisper model")
	language  = flag.String("language", "auto", "Default language for transcription (use 'auto' for auto-detection)")
	logLevel  = flag.String("log-level", "INFO", "Log level (DEBUG, INFO, WARN, ERROR)")
)

func main() {
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Printf("Starting Whisper gRPC Service on port %d", *port)
	log.Printf("Model path: %s", *modelPath)
	log.Printf("Language: %s", *language)

	// Create STT service configuration
	// Convert "auto" to empty string for auto-detection
	sttLanguage := *language
	if sttLanguage == "auto" {
		sttLanguage = ""
	}

	config := &whisperStt.Config{
		Language:   sttLanguage,
		ModelPath:  *modelPath,
		SampleRate: 16000,
	}

	// Initialize STT service
	log.Println("Initializing Whisper STT service...")
	sttService := whisperStt.NewSTTService(config)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize the service (loads model into memory)
	if err := sttService.Initialize(ctx); err != nil {
		log.Fatalf("Failed to initialize Whisper STT service: %v", err)
	}

	log.Println("✓ Whisper model loaded successfully and ready for transcription")

	// Create gRPC server
	grpcServer := grpc.NewServer(
		grpc.MaxRecvMsgSize(50 * 1024 * 1024), // 50MB max message size for audio
	)

	// Register Whisper service
	whisperServer := whisper.NewServer(sttService)
	whisperv1.RegisterWhisperServiceServer(grpcServer, whisperServer)

	// Register reflection service (for grpcurl and debugging)
	reflection.Register(grpcServer)

	log.Println("gRPC services registered")

	// Start listening
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", *port))
	if err != nil {
		log.Fatalf("Failed to listen on port %d: %v", *port, err)
	}

	log.Printf("✓ Whisper gRPC service listening on :%d", *port)
	log.Println("Service is ready to accept transcription requests")

	// Start server in goroutine
	go func() {
		if err := grpcServer.Serve(listener); err != nil {
			log.Fatalf("Failed to serve: %v", err)
		}
	}()

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	<-sigChan
	log.Println("Shutting down Whisper gRPC service...")

	// Graceful shutdown
	grpcServer.GracefulStop()
	log.Println("✓ Service stopped gracefully")
}
