.PHONY: build clean test run deps proto service

# Protobuf generation
proto:
	protoc --go_out=. --go_opt=paths=source_relative \
	  --go-grpc_out=. --go-grpc_opt=paths=source_relative \
	  proto/whisper/v1/whisper.proto

# Whisper gRPC service
service:
	go build -ldflags="-s -w" -o bin/whisper-service ./cmd/whisper-service

service-windows:
	GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o bin/whisper-service.exe ./cmd/whisper-service

service-linux:
	GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/whisper-service ./cmd/whisper-service

service-macos:
	GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o bin/whisper-service ./cmd/whisper-service

# Build targets
build: build-windows build-linux build-macos

build-windows:
	GOOS=windows GOARCH=amd64 go build -o bin/alice-backend-windows-amd64.exe ./main.go

build-linux:
	GOOS=linux GOARCH=amd64 go build -o bin/alice-backend-linux-amd64 ./main.go
	GOOS=linux GOARCH=arm64 go build -o bin/alice-backend-linux-arm64 ./main.go

build-macos:
	GOOS=darwin GOARCH=amd64 go build -o bin/alice-backend-macos-amd64 ./main.go
	GOOS=darwin GOARCH=arm64 go build -o bin/alice-backend-macos-arm64 ./main.go

# Development
run:
	go run ./main.go

test:
	go test -v ./...

clean:
	rm -rf bin/
	rm -rf models/

deps:
	go mod download
	go mod tidy

# Model management
download-models:
	go run ./main.go --download-models

# Development with hot reload
dev:
	@if command -v air >/dev/null 2>&1; then \
		air; \
	else \
		echo "Installing air for hot reload..."; \
		go install github.com/cosmtrek/air@latest; \
		air; \
	fi

# Cross-platform release
release: clean deps build
	@echo "Cross-platform build complete!"
	@ls -la bin/