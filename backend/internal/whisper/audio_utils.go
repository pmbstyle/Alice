package whisper

import (
	"bytes"
	"fmt"
)

// convertAudioToSamples converts byte audio data to float32 samples
func convertAudioToSamples(audioData []byte) ([]float32, error) {
	if len(audioData)%2 != 0 {
		return nil, fmt.Errorf("invalid audio data: odd number of bytes")
	}

	numSamples := len(audioData) / 2
	samples := make([]float32, numSamples)

	for i := 0; i < numSamples; i++ {
		sample := int16(audioData[i*2]) | int16(audioData[i*2+1])<<8
		samples[i] = float32(sample) / 32768.0
	}

	return samples, nil
}

// createWAV creates a WAV file buffer from float32 samples
func createWAV(samples []float32) ([]byte, error) {
	const sampleRate = 16000
	const channels = 1
	const bitsPerSample = 16

	buffer := &bytes.Buffer{}

	dataSize := len(samples) * 2
	fileSize := 36 + dataSize

	// RIFF header
	buffer.WriteString("RIFF")
	buffer.WriteByte(byte(fileSize & 0xFF))
	buffer.WriteByte(byte((fileSize >> 8) & 0xFF))
	buffer.WriteByte(byte((fileSize >> 16) & 0xFF))
	buffer.WriteByte(byte((fileSize >> 24) & 0xFF))
	buffer.WriteString("WAVE")

	// fmt chunk
	buffer.WriteString("fmt ")
	buffer.Write([]byte{16, 0, 0, 0}) // Chunk size
	buffer.Write([]byte{1, 0})         // Audio format (PCM)
	buffer.Write([]byte{byte(channels), 0})

	// Sample rate
	buffer.WriteByte(byte(sampleRate & 0xFF))
	buffer.WriteByte(byte((sampleRate >> 8) & 0xFF))
	buffer.WriteByte(byte((sampleRate >> 16) & 0xFF))
	buffer.WriteByte(byte((sampleRate >> 24) & 0xFF))

	// Byte rate
	byteRate := sampleRate * channels * bitsPerSample / 8
	buffer.WriteByte(byte(byteRate & 0xFF))
	buffer.WriteByte(byte((byteRate >> 8) & 0xFF))
	buffer.WriteByte(byte((byteRate >> 16) & 0xFF))
	buffer.WriteByte(byte((byteRate >> 24) & 0xFF))

	// Block align
	blockAlign := channels * bitsPerSample / 8
	buffer.Write([]byte{byte(blockAlign), 0})

	// Bits per sample
	buffer.Write([]byte{byte(bitsPerSample), 0})

	// data chunk
	buffer.WriteString("data")
	buffer.WriteByte(byte(dataSize & 0xFF))
	buffer.WriteByte(byte((dataSize >> 8) & 0xFF))
	buffer.WriteByte(byte((dataSize >> 16) & 0xFF))
	buffer.WriteByte(byte((dataSize >> 24) & 0xFF))

	// Convert float32 samples to 16-bit PCM
	for _, sample := range samples {
		if sample > 1.0 {
			sample = 1.0
		} else if sample < -1.0 {
			sample = -1.0
		}

		sample16 := int16(sample * 32767)
		buffer.WriteByte(byte(sample16))
		buffer.WriteByte(byte(sample16 >> 8))
	}

	return buffer.Bytes(), nil
}
