package downloader

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// Downloader handles model downloads
type Downloader struct {
	logger *log.Logger
	client *http.Client
}

// NewDownloader creates a new downloader instance
func NewDownloader(logger *log.Logger) *Downloader {
	return &Downloader{
		logger: logger,
		client: &http.Client{
			Timeout: 5 * time.Minute,
		},
	}
}

// Download downloads a file from URL to destination
func (d *Downloader) Download(url, destPath string) error {
	// Create directory if it doesn't exist
	dir := filepath.Dir(destPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Check if file already exists
	if _, err := os.Stat(destPath); err == nil {
		d.logger.Printf("File already exists: %s", destPath)
		return nil
	}

	d.logger.Printf("Downloading %s to %s", url, destPath)

	// Create request
	resp, err := d.client.Get(url)
	if err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}

	// Create destination file
	out, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	// Copy data
	written, err := io.Copy(out, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to save file: %w", err)
	}

	d.logger.Printf("Downloaded %d bytes to %s", written, destPath)
	return nil
}

// DownloadWithProgress downloads with progress logging
func (d *Downloader) DownloadWithProgress(url, destPath string) error {
	// Create directory if it doesn't exist
	dir := filepath.Dir(destPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Check if file already exists
	if _, err := os.Stat(destPath); err == nil {
		d.logger.Printf("File already exists: %s", destPath)
		return nil
	}

	d.logger.Printf("Downloading %s to %s", url, destPath)

	// Create request
	resp, err := d.client.Get(url)
	if err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %d", resp.StatusCode)
	}

	// Get content length for progress
	contentLength := resp.ContentLength

	// Create destination file
	out, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	// Create progress reader
	progressReader := &progressReader{
		reader:        resp.Body,
		total:         contentLength,
		logger:        d.logger,
		bytesReceived: 0,
	}

	// Copy data with progress
	written, err := io.Copy(out, progressReader)
	if err != nil {
		return fmt.Errorf("failed to save file: %w", err)
	}

	d.logger.Printf("Downloaded %d bytes to %s", written, destPath)
	return nil
}

// progressReader wraps an io.Reader to log progress
type progressReader struct {
	reader        io.Reader
	total         int64
	logger        *log.Logger
	bytesReceived int64
}

func (pr *progressReader) Read(p []byte) (int, error) {
	n, err := pr.reader.Read(p)
	pr.bytesReceived += int64(n)

	if pr.total > 0 {
		percentage := float64(pr.bytesReceived) * 100.0 / float64(pr.total)
		if int(percentage)%10 == 0 {
			pr.logger.Printf("Download progress: %.1f%%", percentage)
		}
	}

	return n, err
}
