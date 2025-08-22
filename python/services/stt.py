"""
Speech-to-Text service using faster-whisper
"""

import asyncio
import io
import logging
import os
import tempfile
from typing import Optional, Dict, Any, List
import wave

try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    FASTER_WHISPER_AVAILABLE = False
    WhisperModel = None

from config import settings, get_models_cache_dir
from utils.logger import get_logger
from utils.runtime_installer import runtime_installer

logger = get_logger(__name__)


class STTService:
    """Speech-to-Text service using faster-whisper."""
    
    def __init__(self):
        self.model: Optional[WhisperModel] = None
        self.model_size = settings.stt_model_size
        self.device = settings.stt_device
        self.compute_type = settings.stt_compute_type
        self.cache_dir = get_models_cache_dir()
        self._lock = asyncio.Lock()
        self._initialized = False
    
    async def initialize(self) -> bool:
        """Initialize the STT service."""
        try:
            # Ensure faster-whisper is installed
            installed = await runtime_installer.ensure_package_installed(
                'faster-whisper',
                import_test=lambda: _import_faster_whisper()
            )
            if not installed:
                logger.error("Failed to install or import faster-whisper")
                return False
        except Exception as e:
            logger.error(f"Error setting up faster-whisper: {e}")
            return False
        
        async with self._lock:
            if self._initialized:
                return True
            
            try:
                logger.info(f"Initializing STT service with model: {self.model_size}")
                logger.info(f"Device: {self.device}, Compute type: {self.compute_type}")
                
                # Set cache directory for models
                os.environ["HUGGINGFACE_HUB_CACHE"] = self.cache_dir
                
                # Determine device and compute type
                device = self._determine_device()
                compute_type = self._determine_compute_type(device)
                
                # Create model in a separate thread to avoid blocking
                self.model = await asyncio.get_event_loop().run_in_executor(
                    None,
                    self._create_model,
                    device,
                    compute_type
                )
                
                self._initialized = True
                logger.info(f"STT service initialized successfully")
                return True
                
            except Exception as e:
                logger.error(f"Failed to initialize STT service: {e}")
                return False
    
    def _create_model(self, device: str, compute_type: str) -> WhisperModel:
        """Create WhisperModel instance (runs in thread pool)."""
        return WhisperModel(
            self.model_size,
            device=device,
            compute_type=compute_type,
            download_root=self.cache_dir
        )
    
    def _determine_device(self) -> str:
        """Determine the appropriate device to use."""
        if self.device == "auto":
            try:
                import torch
                if torch.cuda.is_available():
                    logger.info("CUDA detected, using GPU")
                    return "cuda"
                else:
                    logger.info("CUDA not available, using CPU")
                    return "cpu"
            except ImportError:
                logger.info("PyTorch not available, using CPU")
                return "cpu"
        return self.device
    
    def _determine_compute_type(self, device: str) -> str:
        """Determine the appropriate compute type based on device."""
        if self.compute_type == "auto":
            if device == "cuda":
                return "float16"  # Use FP16 on GPU
            else:
                return "int8"  # Use INT8 on CPU for better performance
        return self.compute_type
    
    async def transcribe_audio(self, audio_data: bytes, language: Optional[str] = None) -> Dict[str, Any]:
        """
        Transcribe audio data to text.
        
        Args:
            audio_data: Raw audio data (WAV format expected)
            language: Optional language code (e.g., 'en', 'es', 'fr')
        
        Returns:
            Dictionary containing transcription result and metadata
        """
        if not self._initialized or not self.model:
            raise RuntimeError("STT service not initialized")
        
        try:
            # Save audio data to temporary file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_path = temp_file.name
            
            try:
                # Transcribe in thread pool to avoid blocking
                result = await asyncio.get_event_loop().run_in_executor(
                    None,
                    self._transcribe_file,
                    temp_path,
                    language
                )
                return result
                
            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
        
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise
    
    def _transcribe_file(self, audio_path: str, language: Optional[str] = None) -> Dict[str, Any]:
        """Transcribe audio file (runs in thread pool)."""
        # Transcription parameters
        params = {
            "beam_size": 5,
            "word_timestamps": True,
            "vad_filter": False,  # Disabled VAD due to onnxruntime DLL issues on Windows
        }
        
        if language:
            params["language"] = language
        
        # Perform transcription
        segments, info = self.model.transcribe(audio_path, **params)
        
        # Convert segments to list (forces transcription to complete)
        segments_list = []
        for segment in segments:
            segment_dict = {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "words": []
            }
            
            # Add word-level timestamps if available
            if hasattr(segment, 'words') and segment.words:
                segment_dict["words"] = [
                    {
                        "start": word.start,
                        "end": word.end,
                        "word": word.word,
                        "probability": getattr(word, 'probability', 1.0)
                    }
                    for word in segment.words
                ]
            
            segments_list.append(segment_dict)
        
        # Combine all text
        full_text = " ".join(segment["text"] for segment in segments_list).strip()
        
        return {
            "text": full_text,
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "segments": segments_list,
        }
    
    async def transcribe_float32_array(self, audio_array: List[float], sample_rate: int = 16000, language: Optional[str] = None) -> Dict[str, Any]:
        """
        Transcribe Float32Array audio data.
        
        Args:
            audio_array: Audio samples as float32 array
            sample_rate: Audio sample rate (default: 16000)
            language: Optional language code
        
        Returns:
            Dictionary containing transcription result and metadata
        """
        try:
            # Convert float32 array to WAV bytes
            wav_bytes = self._float32_to_wav(audio_array, sample_rate)
            
            # Transcribe the WAV data
            return await self.transcribe_audio(wav_bytes, language)
            
        except Exception as e:
            logger.error(f"Float32 array transcription failed: {e}")
            raise
    
    def _float32_to_wav(self, audio_array: List[float], sample_rate: int) -> bytes:
        """Convert float32 array to WAV bytes."""
        # Create WAV file in memory
        with io.BytesIO() as wav_buffer:
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(sample_rate)
                
                # Convert float32 to int16
                import struct
                int16_data = []
                for sample in audio_array:
                    # Clamp to [-1, 1] and convert to int16
                    clamped = max(-1.0, min(1.0, sample))
                    int16_sample = int(clamped * 32767)
                    int16_data.append(int16_sample)
                
                # Write samples
                wav_file.writeframes(struct.pack(f'{len(int16_data)}h', *int16_data))
            
            return wav_buffer.getvalue()
    
    async def is_ready(self) -> bool:
        """Check if the service is ready."""
        return self._initialized and self.model is not None
    
    async def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model."""
        if not self._initialized:
            return {"status": "not_initialized"}
        
        return {
            "status": "ready",
            "model_size": self.model_size,
            "device": self.device,
            "compute_type": self.compute_type,
            "cache_dir": self.cache_dir,
        }
    
    async def cleanup(self):
        """Clean up resources."""
        async with self._lock:
            if self.model:
                # No explicit cleanup needed for faster-whisper
                self.model = None
            self._initialized = False
            logger.info("STT service cleaned up")


# Global STT service instance
stt_service = STTService()