"""
Text-to-Speech service using Kokoro TTS
"""

import asyncio
import io
import logging
import os
import tempfile
from typing import Optional, Dict, Any, List, Union
import numpy as np

# Import will be done at runtime to avoid bundling dependencies
KOKORO_AVAILABLE = False
KPipeline = None
torch = None
sf = None

def _import_kokoro():
    """Import kokoro at runtime."""
    global KOKORO_AVAILABLE, KPipeline, torch, sf
    if not KOKORO_AVAILABLE:
        try:
            from kokoro import KPipeline as _KPipeline
            import torch as _torch
            import soundfile as _sf
            KPipeline = _KPipeline
            torch = _torch
            sf = _sf
            KOKORO_AVAILABLE = True
            logger.info("kokoro imported successfully")
        except ImportError as e:
            logger.error(f"Failed to import kokoro: {e}")
            logger.info("Install with: pip install kokoro>=0.9.4 torch soundfile")
            raise
    return KPipeline

from config import settings, get_models_cache_dir
from utils.logger import get_logger
from utils.runtime_installer import runtime_installer

logger = get_logger(__name__)


class TTSService:
    """Text-to-Speech service using Kokoro TTS."""
    
    def __init__(self):
        self.pipeline: Optional[KPipeline] = None
        self.voice = settings.tts_voice
        self.device = settings.tts_device
        self.quantization = settings.tts_quantization
        self.cache_dir = get_models_cache_dir()
        self._lock = asyncio.Lock()
        self._initialized = False
        
        # Voice mapping
        self.available_voices = {
            # American English (a)
            "af_alloy": {"lang_code": "a", "description": "American English - Alloy"},
            "af_bella": {"lang_code": "a", "description": "American English - Bella"},
            "af_heart": {"lang_code": "a", "description": "American English - Heart"},
            "af_sky": {"lang_code": "a", "description": "American English - Sky"},
            
            # British English (b) 
            "bf_alloy": {"lang_code": "b", "description": "British English - Alloy"},
            "bf_bella": {"lang_code": "b", "description": "British English - Bella"},
            "bf_heart": {"lang_code": "b", "description": "British English - Heart"},
            "bf_sky": {"lang_code": "b", "description": "British English - Sky"},
        }
    
    async def initialize(self) -> bool:
        """Initialize the TTS service."""
        try:
            # Ensure kokoro is installed
            installed = await runtime_installer.ensure_package_installed(
                'kokoro',
                import_test=lambda: _import_kokoro()
            )
            if not installed:
                logger.error("Failed to install or import kokoro")
                return False
            
            # Import the classes after successful installation
            _import_kokoro()
            
        except Exception as e:
            logger.error(f"Error setting up kokoro: {e}")
            return False
        
        async with self._lock:
            if self._initialized:
                return True
            
            try:
                logger.info(f"Initializing TTS service with voice: {self.voice}")
                logger.info(f"Device: {self.device}, Quantization: {self.quantization}")
                
                # Get language code for the voice
                voice_info = self.available_voices.get(self.voice, {"lang_code": "a"})
                lang_code = voice_info["lang_code"]
                
                # Create pipeline in a separate thread to avoid blocking
                self.pipeline = await asyncio.get_event_loop().run_in_executor(
                    None,
                    self._create_pipeline,
                    lang_code
                )
                
                self._initialized = True
                logger.info(f"TTS service initialized successfully")
                return True
                
            except Exception as e:
                logger.error(f"Failed to initialize TTS service: {e}")
                return False
    
    def _create_pipeline(self, lang_code: str):
        """Create KPipeline instance (runs in thread pool)."""
        if not KOKORO_AVAILABLE or KPipeline is None:
            raise RuntimeError("kokoro not available or not imported correctly")
        
        logger.info(f"Downloading Kokoro TTS model for language {lang_code} if not cached...")
        return KPipeline(lang_code=lang_code)
    
    async def synthesize_speech(self, text: str, voice: Optional[str] = None) -> Optional[bytes]:
        """
        Synthesize speech from text.
        
        Args:
            text: Text to synthesize
            voice: Optional voice override
        
        Returns:
            Audio data as WAV bytes, or None if synthesis failed
        """
        if not self._initialized or not self.pipeline:
            raise RuntimeError("TTS service not initialized")
        
        # Use provided voice or default
        selected_voice = voice or self.voice
        
        # Validate voice
        if selected_voice not in self.available_voices:
            logger.warning(f"Voice '{selected_voice}' not available, using default: {self.voice}")
            selected_voice = self.voice
        
        try:
            # Generate speech in thread pool to avoid blocking
            audio_data = await asyncio.get_event_loop().run_in_executor(
                None,
                self._synthesize_text,
                text,
                selected_voice
            )
            
            if audio_data is not None:
                # Convert to WAV bytes
                return self._numpy_to_wav_bytes(audio_data, sample_rate=24000)
            else:
                return None
                
        except Exception as e:
            logger.error(f"Speech synthesis failed: {e}")
            raise
    
    def _synthesize_text(self, text: str, voice: str) -> Optional[np.ndarray]:
        """Synthesize text using Kokoro (runs in thread pool)."""
        try:
            # Clean and prepare text
            cleaned_text = self._clean_text(text)
            if not cleaned_text.strip():
                logger.warning("Empty text after cleaning, skipping synthesis")
                return None
            
            logger.debug(f"Synthesizing: '{cleaned_text[:100]}...' with voice: {voice}")
            
            # Generate audio using the pipeline
            generator = self.pipeline(
                cleaned_text,
                voice=voice,
                speed=1.0,
                split_pattern=r'[.!?]\s+'  # Split on sentences
            )
            
            # Collect all audio segments
            audio_segments = []
            for i, (gs, ps, audio) in enumerate(generator):
                if audio is not None and len(audio) > 0:
                    audio_segments.append(audio)
                    logger.debug(f"Generated segment {i}: {len(audio)} samples")
            
            if not audio_segments:
                logger.warning("No audio segments generated")
                return None
            
            # Concatenate all segments
            if len(audio_segments) == 1:
                final_audio = audio_segments[0]
            else:
                final_audio = np.concatenate(audio_segments, axis=0)
            
            logger.debug(f"Final audio shape: {final_audio.shape}")
            return final_audio
            
        except Exception as e:
            logger.error(f"Error in text synthesis: {e}")
            return None
    
    def _clean_text(self, text: str) -> str:
        """Clean and prepare text for TTS."""
        # Basic text cleaning
        cleaned = text.strip()
        
        # Remove excessive whitespace
        import re
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        # Ensure text ends with punctuation for better synthesis
        if cleaned and not cleaned[-1] in '.!?':
            cleaned += '.'
        
        return cleaned
    
    def _numpy_to_wav_bytes(self, audio_data: np.ndarray, sample_rate: int) -> bytes:
        """Convert numpy audio array to WAV bytes."""
        # Create WAV file in memory
        with io.BytesIO() as wav_buffer:
            sf.write(wav_buffer, audio_data, sample_rate, format='WAV', subtype='PCM_16')
            return wav_buffer.getvalue()
    
    async def get_available_voices(self) -> Dict[str, Any]:
        """Get list of available voices."""
        return self.available_voices
    
    async def is_ready(self) -> bool:
        """Check if the service is ready."""
        return self._initialized and self.pipeline is not None
    
    async def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model."""
        if not self._initialized:
            return {"status": "not_initialized"}
        
        return {
            "status": "ready",
            "voice": self.voice,
            "device": self.device,
            "quantization": self.quantization,
            "cache_dir": self.cache_dir,
            "available_voices": list(self.available_voices.keys()),
        }
    
    async def test_synthesis(self) -> Dict[str, Any]:
        """Test the TTS service with a simple phrase."""
        test_text = "Hello, this is a test of the Kokoro text to speech system."
        
        try:
            audio_data = await self.synthesize_speech(test_text)
            
            if audio_data:
                return {
                    "success": True,
                    "audio_length_bytes": len(audio_data),
                    "test_text": test_text
                }
            else:
                return {
                    "success": False,
                    "error": "No audio generated"
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    async def cleanup(self):
        """Clean up resources."""
        async with self._lock:
            if self.pipeline:
                # No explicit cleanup needed for Kokoro
                self.pipeline = None
            self._initialized = False
            logger.info("TTS service cleaned up")


# Global TTS service instance
tts_service = TTSService()