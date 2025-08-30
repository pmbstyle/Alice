package embedded

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"crypto/md5"
	"embed"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Embed all platform-specific binaries and data files
// This will be empty initially but will work when assets are added
//go:embed assets/.gitkeep
var EmbeddedAssets embed.FS

// AssetManager handles extraction and management of embedded assets
type AssetManager struct {
	baseDir string
	cache   map[string]string // asset -> extracted path
}

// PlatformInfo holds platform-specific asset information
type PlatformInfo struct {
	OS           string
	Arch         string
	WhisperPath  string
	PiperPath    string
	WhisperModel string
	PiperVoices  []string
}

// GetPlatformInfo returns platform-specific paths and requirements
func GetPlatformInfo() *PlatformInfo {
	info := &PlatformInfo{
		OS:           runtime.GOOS,
		Arch:         runtime.GOARCH,
		WhisperModel: "whisper-base.bin",
		PiperVoices:  []string{"en_US-amy-medium", "en_US-hfc_female-medium", "en_US-kristin-medium"},
	}

	switch runtime.GOOS {
	case "windows":
		info.WhisperPath = "main.exe"
		info.PiperPath = "piper.exe"
	case "darwin":
		info.WhisperPath = "main"
		info.PiperPath = "piper"
	case "linux":
		info.WhisperPath = "main"
		info.PiperPath = "piper"
	default:
		log.Printf("Warning: Unsupported platform %s", runtime.GOOS)
		info.WhisperPath = "main"
		info.PiperPath = "piper"
	}

	return info
}

// GetProductionBaseDirectory determines the appropriate base directory for assets
// based on whether we're running in development or production (Electron bundled) mode
func GetProductionBaseDirectory() string {
	// Get the executable path
	exePath, err := os.Executable()
	if err != nil {
		log.Printf("Warning: Could not determine executable path, using current directory: %v", err)
		return "."
	}

	exeDir := filepath.Dir(exePath)
	log.Printf("Executable directory: %s", exeDir)

	// Check if we're in an Electron app bundle structure
	// In production Electron apps, the backend executable is in:
	// - Windows: resources/backend/alice-backend.exe
	// - macOS: Resources/backend/alice-backend  
	// - Linux: resources/backend/alice-backend
	
	// Check for Electron resources structure
	parentDir := filepath.Dir(exeDir)
	if filepath.Base(exeDir) == "backend" && 
	   (filepath.Base(parentDir) == "resources" || filepath.Base(parentDir) == "Resources") {
		// We're in Electron production bundle
		log.Printf("Detected Electron production environment, using exe directory as base: %s", exeDir)
		return exeDir
	}

	// Check for typical development structure (resources/backend/)
	if strings.Contains(exeDir, "resources/backend") || strings.Contains(exeDir, "resources\\backend") {
		log.Printf("Detected development environment, using exe directory as base: %s", exeDir)  
		return exeDir
	}

	// Default to executable directory
	log.Printf("Using executable directory as asset base: %s", exeDir)
	return exeDir
}

// NewAssetManager creates a new asset manager with a base directory
func NewAssetManager(baseDir string) *AssetManager {
	return &AssetManager{
		baseDir: baseDir,
		cache:   make(map[string]string),
	}
}

// EnsureAssets extracts all required assets for the current platform
func (am *AssetManager) EnsureAssets(ctx context.Context) error {
	info := GetPlatformInfo()
	
	log.Printf("Ensuring assets for platform: %s/%s", info.OS, info.Arch)
	
	// Create base directories
	if err := os.MkdirAll(filepath.Join(am.baseDir, "bin"), 0755); err != nil {
		return fmt.Errorf("failed to create bin directory: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(am.baseDir, "models"), 0755); err != nil {
		return fmt.Errorf("failed to create models directory: %w", err)
	}

	// Extract Whisper assets
	if err := am.extractWhisperAssets(ctx, info); err != nil {
		log.Printf("Warning: Failed to extract Whisper assets: %v", err)
	}

	// Extract Piper assets
	if err := am.extractPiperAssets(ctx, info); err != nil {
		log.Printf("Warning: Failed to extract Piper assets: %v", err)
	}

	// Extract voice models
	if err := am.extractVoiceModels(ctx, info); err != nil {
		log.Printf("Warning: Failed to extract voice models: %v", err)
	}

	return nil
}

// extractWhisperAssets extracts Whisper binary and dependencies
func (am *AssetManager) extractWhisperAssets(ctx context.Context, info *PlatformInfo) error {
	archiveName := fmt.Sprintf("whisper_%s_%s.zip", info.OS, info.Arch)
	archivePath := fmt.Sprintf("assets/whisper/%s", archiveName)
	
	log.Printf("Checking for Whisper assets: %s", archivePath)
	
	// Check if embedded archive exists
	if _, err := EmbeddedAssets.Open(archivePath); err != nil {
		log.Printf("No embedded whisper archive found for platform %s/%s - will use download fallback", info.OS, info.Arch)
		return fmt.Errorf("whisper archive not embedded for platform %s/%s", info.OS, info.Arch)
	}
	
	log.Printf("Extracting embedded Whisper assets from: %s", archivePath)
	// Extract archive to bin directory
	binDir := filepath.Join(am.baseDir, "bin")
	return am.extractEmbeddedZip(archivePath, binDir)
}

// extractPiperAssets extracts Piper binary and espeak-ng data
func (am *AssetManager) extractPiperAssets(ctx context.Context, info *PlatformInfo) error {
	var archiveName string
	var isZip bool

	switch info.OS {
	case "windows":
		archiveName = fmt.Sprintf("piper_windows_%s.zip", info.Arch)
		isZip = true
	case "darwin":
		archiveName = fmt.Sprintf("piper_macos_%s.tar.gz", info.Arch)
		isZip = false
	case "linux":
		archiveName = fmt.Sprintf("piper_linux_%s.tar.gz", info.Arch)
		isZip = false
	}
	
	archivePath := fmt.Sprintf("assets/piper/%s", archiveName)
	log.Printf("Checking for Piper assets: %s", archivePath)
	
	// Check if embedded archive exists
	if _, err := EmbeddedAssets.Open(archivePath); err != nil {
		log.Printf("No embedded piper archive found for platform %s/%s - will use download fallback", info.OS, info.Arch)
		return fmt.Errorf("piper archive not embedded for platform %s/%s", info.OS, info.Arch)
	}
	
	log.Printf("Extracting embedded Piper assets from: %s", archivePath)
	binDir := filepath.Join(am.baseDir, "bin")
	if isZip {
		return am.extractEmbeddedZip(archivePath, binDir)
	} else {
		return am.extractEmbeddedTarGz(archivePath, binDir)
	}
}

// extractVoiceModels extracts voice model files
func (am *AssetManager) extractVoiceModels(ctx context.Context, info *PlatformInfo) error {
	modelsDir := filepath.Join(am.baseDir, "models")
	
	// Extract Whisper model
	whisperModelPath := fmt.Sprintf("assets/models/%s", info.WhisperModel)
	if _, err := EmbeddedAssets.Open(whisperModelPath); err == nil {
		targetPath := filepath.Join(modelsDir, info.WhisperModel)
		if err := am.extractEmbeddedFile(whisperModelPath, targetPath); err != nil {
			log.Printf("Warning: Failed to extract Whisper model: %v", err)
		} else {
			log.Printf("Extracted embedded Whisper model: %s", targetPath)
		}
	} else {
		log.Printf("No embedded Whisper model found - will use download fallback")
	}
	
	// Extract Piper voice models
	piperModelsDir := filepath.Join(modelsDir, "piper")
	if err := os.MkdirAll(piperModelsDir, 0755); err != nil {
		return fmt.Errorf("failed to create piper models directory: %w", err)
	}
	
	for _, voice := range info.PiperVoices {
		onnxPath := fmt.Sprintf("assets/models/piper/%s.onnx", voice)
		jsonPath := fmt.Sprintf("assets/models/piper/%s.onnx.json", voice)
		
		if _, err := EmbeddedAssets.Open(onnxPath); err == nil {
			targetPath := filepath.Join(piperModelsDir, fmt.Sprintf("%s.onnx", voice))
			if err := am.extractEmbeddedFile(onnxPath, targetPath); err != nil {
				log.Printf("Warning: Failed to extract voice model %s: %v", voice, err)
			} else {
				log.Printf("Extracted voice model: %s", targetPath)
			}
		}
		
		if _, err := EmbeddedAssets.Open(jsonPath); err == nil {
			targetPath := filepath.Join(piperModelsDir, fmt.Sprintf("%s.onnx.json", voice))
			if err := am.extractEmbeddedFile(jsonPath, targetPath); err != nil {
				log.Printf("Warning: Failed to extract voice config %s: %v", voice, err)
			} else {
				log.Printf("Extracted voice config: %s", targetPath)
			}
		}
	}
	
	return nil
}

// extractEmbeddedZip extracts a ZIP archive from embedded assets
func (am *AssetManager) extractEmbeddedZip(archivePath, targetDir string) error {
	archiveData, err := EmbeddedAssets.ReadFile(archivePath)
	if err != nil {
		return fmt.Errorf("failed to read embedded archive: %w", err)
	}
	
	// Create a zip reader from the embedded data
	reader, err := zip.NewReader(strings.NewReader(string(archiveData)), int64(len(archiveData)))
	if err != nil {
		return fmt.Errorf("failed to create zip reader: %w", err)
	}
	
	return am.extractZipFiles(reader, targetDir)
}

// extractEmbeddedTarGz extracts a TAR.GZ archive from embedded assets
func (am *AssetManager) extractEmbeddedTarGz(archivePath, targetDir string) error {
	archiveData, err := EmbeddedAssets.ReadFile(archivePath)
	if err != nil {
		return fmt.Errorf("failed to read embedded archive: %w", err)
	}
	
	// Create gzip reader
	gzReader, err := gzip.NewReader(strings.NewReader(string(archiveData)))
	if err != nil {
		return fmt.Errorf("failed to create gzip reader: %w", err)
	}
	defer gzReader.Close()
	
	// Create tar reader
	tarReader := tar.NewReader(gzReader)
	
	return am.extractTarFiles(tarReader, targetDir)
}

// extractEmbeddedFile extracts a single file from embedded assets
func (am *AssetManager) extractEmbeddedFile(embeddedPath, targetPath string) error {
	data, err := EmbeddedAssets.ReadFile(embeddedPath)
	if err != nil {
		return fmt.Errorf("failed to read embedded file: %w", err)
	}
	
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("failed to create target directory: %w", err)
	}
	
	return os.WriteFile(targetPath, data, 0644)
}

// extractZipFiles extracts files from a ZIP archive
func (am *AssetManager) extractZipFiles(reader *zip.Reader, targetDir string) error {
	for _, file := range reader.File {
		if err := am.extractZipFile(file, targetDir); err != nil {
			log.Printf("Warning: Failed to extract %s: %v", file.Name, err)
		}
	}
	return nil
}

// extractZipFile extracts a single file from ZIP
func (am *AssetManager) extractZipFile(file *zip.File, targetDir string) error {
	// Determine target path, handling nested directories
	targetPath := filepath.Join(targetDir, file.Name)
	
	// Handle directory entries
	if file.FileInfo().IsDir() {
		return os.MkdirAll(targetPath, file.FileInfo().Mode())
	}
	
	// Create target directory
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}
	
	// Extract file
	rc, err := file.Open()
	if err != nil {
		return fmt.Errorf("failed to open file in archive: %w", err)
	}
	defer rc.Close()
	
	outFile, err := os.Create(targetPath)
	if err != nil {
		return fmt.Errorf("failed to create target file: %w", err)
	}
	defer outFile.Close()
	
	_, err = io.Copy(outFile, rc)
	if err != nil {
		return fmt.Errorf("failed to copy file data: %w", err)
	}
	
	// Set permissions
	if err := os.Chmod(targetPath, file.FileInfo().Mode()); err != nil {
		log.Printf("Warning: Failed to set permissions for %s: %v", targetPath, err)
	}
	
	return nil
}

// extractTarFiles extracts files from a TAR archive
func (am *AssetManager) extractTarFiles(reader *tar.Reader, targetDir string) error {
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to read tar header: %w", err)
		}
		
		if err := am.extractTarFile(reader, header, targetDir); err != nil {
			log.Printf("Warning: Failed to extract %s: %v", header.Name, err)
		}
	}
	return nil
}

// extractTarFile extracts a single file from TAR
func (am *AssetManager) extractTarFile(reader *tar.Reader, header *tar.Header, targetDir string) error {
	targetPath := filepath.Join(targetDir, header.Name)
	
	switch header.Typeflag {
	case tar.TypeDir:
		return os.MkdirAll(targetPath, os.FileMode(header.Mode))
	case tar.TypeReg:
		// Create target directory
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return fmt.Errorf("failed to create directory: %w", err)
		}
		
		// Extract file
		outFile, err := os.Create(targetPath)
		if err != nil {
			return fmt.Errorf("failed to create target file: %w", err)
		}
		defer outFile.Close()
		
		_, err = io.Copy(outFile, reader)
		if err != nil {
			return fmt.Errorf("failed to copy file data: %w", err)
		}
		
		// Set permissions
		if err := os.Chmod(targetPath, os.FileMode(header.Mode)); err != nil {
			log.Printf("Warning: Failed to set permissions for %s: %v", targetPath, err)
		}
	}
	
	return nil
}

// GetAssetPath returns the extracted path for a given asset
func (am *AssetManager) GetAssetPath(assetName string) (string, bool) {
	path, exists := am.cache[assetName]
	return path, exists
}

// GetBinaryPath returns the path to a platform-specific binary
func (am *AssetManager) GetBinaryPath(binaryName string) string {
	info := GetPlatformInfo()
	
	// Ensure bin directory exists
	binDir := filepath.Join(am.baseDir, "bin")
	if err := os.MkdirAll(binDir, 0755); err != nil {
		log.Printf("Warning: Failed to create bin directory: %v", err)
	}
	
	switch binaryName {
	case "whisper":
		return filepath.Join(binDir, info.WhisperPath)
	case "piper":
		return filepath.Join(binDir, info.PiperPath)
	default:
		return filepath.Join(binDir, binaryName)
	}
}

// GetModelPath returns the path to a model file
func (am *AssetManager) GetModelPath(modelName string) string {
	// Ensure models directory exists
	modelsDir := filepath.Join(am.baseDir, "models")
	if err := os.MkdirAll(modelsDir, 0755); err != nil {
		log.Printf("Warning: Failed to create models directory: %v", err)
	}
	
	switch modelName {
	case "whisper":
		return filepath.Join(modelsDir, "whisper-base.bin")
	default:
		return filepath.Join(modelsDir, modelName)
	}
}

// GetVoiceModelPath returns the path to a Piper voice model
func (am *AssetManager) GetVoiceModelPath(voiceName string) string {
	return filepath.Join(am.baseDir, "models", "piper", fmt.Sprintf("%s.onnx", voiceName))
}

// IsAssetAvailable checks if an asset is available and properly extracted
func (am *AssetManager) IsAssetAvailable(assetPath string) bool {
	if _, err := os.Stat(assetPath); err != nil {
		return false
	}
	return true
}

// GetChecksum returns MD5 checksum of a file for integrity verification
func (am *AssetManager) GetChecksum(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	
	hash := md5.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}