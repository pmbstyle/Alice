package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"alice-backend/internal/api"
	"alice-backend/internal/config"
	"alice-backend/internal/models"
	"alice-backend/internal/server"
)

func main() {
	// Load configuration
	cfg := config.LoadConfig()

	// Initialize model manager
	modelManager := models.NewManager(cfg)

	// Initialize services
	ctx := context.Background()
	if err := modelManager.Initialize(ctx); err != nil {
		slog.Error("Failed to initialize model manager", "error", err)
		os.Exit(1)
	}

	// Create API handler
	apiHandler := api.NewHandler(cfg, modelManager)

	// Create server
	srv := server.NewServer(cfg, apiHandler)

	// Start server in a goroutine
	go func() {
		slog.Info("Starting HTTP server", "address", ":"+cfg.Server.Port)
		if err := srv.Start(cfg.Server.Port); err != nil {
			slog.Error("Server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("Shutting down server...")

	// Create a context with timeout for graceful shutdown
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Shutdown server
	if err := srv.Stop(shutdownCtx); err != nil {
		slog.Error("Server shutdown error", "error", err)
	}

	// Shutdown model manager
	if err := modelManager.Shutdown(shutdownCtx); err != nil {
		slog.Error("Model manager shutdown error", "error", err)
	}

	slog.Info("Server stopped")
}
