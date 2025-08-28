package server

import (
	"context"
	"log"
	"net/http"
	"time"

	"alice-backend/internal/api"
	"alice-backend/internal/config"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

// Server represents the HTTP server
type Server struct {
	httpServer *http.Server
	handler    *api.Handler
}

// NewServer creates a new HTTP server
func NewServer(config *config.Config, handler *api.Handler) *Server {
	return &Server{
		handler: handler,
	}
}

// Start starts the HTTP server
func (s *Server) Start(port string) error {
	router := mux.NewRouter()

	// Add middleware
	router.Use(loggingMiddleware)
	router.Use(recoveryMiddleware)

	// API routes
	apiRouter := router.PathPrefix("/api").Subrouter()

	// Health check
	apiRouter.HandleFunc("/health", s.handler.HealthCheck).Methods("GET")
	apiRouter.HandleFunc("/config", s.handler.GetConfig).Methods("GET")

	// STT routes
	sttRouter := apiRouter.PathPrefix("/stt").Subrouter()
	sttRouter.HandleFunc("/transcribe", s.handler.TranscribeAudio).Methods("POST")
	sttRouter.HandleFunc("/transcribe-audio", s.handler.TranscribeAudio).Methods("POST")
	sttRouter.HandleFunc("/transcribe-file", s.handler.TranscribeAudio).Methods("POST")
	sttRouter.HandleFunc("/ready", s.handler.STTReady).Methods("GET")
	sttRouter.HandleFunc("/info", s.handler.STTInfo).Methods("GET")

	// TTS routes
	ttsRouter := apiRouter.PathPrefix("/tts").Subrouter()
	ttsRouter.HandleFunc("/synthesize", s.handler.SynthesizeSpeech).Methods("POST")
	ttsRouter.HandleFunc("/voices", s.handler.GetVoices).Methods("GET")
	ttsRouter.HandleFunc("/ready", s.handler.TTSReady).Methods("GET")
	ttsRouter.HandleFunc("/info", s.handler.TTSInfo).Methods("GET")

	// Embeddings routes
	embeddingsRouter := apiRouter.PathPrefix("/embeddings").Subrouter()
	embeddingsRouter.HandleFunc("/generate", s.handler.GenerateEmbedding).Methods("POST")
	embeddingsRouter.HandleFunc("/batch", s.handler.GenerateEmbeddings).Methods("POST")
	embeddingsRouter.HandleFunc("/generate-batch", s.handler.GenerateEmbeddings).Methods("POST")
	embeddingsRouter.HandleFunc("/ready", s.handler.EmbeddingsReady).Methods("GET")
	embeddingsRouter.HandleFunc("/info", s.handler.EmbeddingsInfo).Methods("GET")

	// Model management routes
	modelsRouter := apiRouter.PathPrefix("/models").Subrouter()
	modelsRouter.HandleFunc("/download/{service}", s.handler.DownloadModel).Methods("POST")
	modelsRouter.HandleFunc("/status", s.handler.GetModelStatus).Methods("GET")
	modelsRouter.HandleFunc("/download-status", s.handler.GetModelDownloadStatus).Methods("GET")

	// CORS configuration
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := c.Handler(router)

	s.httpServer = &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("Server starting on port %s", port)
	return s.httpServer.ListenAndServe()
}

// Stop gracefully stops the server
func (s *Server) Stop(ctx context.Context) error {
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

// loggingMiddleware logs HTTP requests
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("Started %s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
		log.Printf("Completed %s %s in %v", r.Method, r.URL.Path, time.Since(start))
	})
}

// recoveryMiddleware recovers from panics
func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("Panic recovered: %v", err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
