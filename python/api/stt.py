"""
Speech-to-Text API endpoints
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException  # , UploadFile, File, Form
from pydantic import BaseModel

from services.stt import stt_service
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


class TranscriptionRequest(BaseModel):
    """Request model for transcription."""
    audio_data: list[float]  # Float32Array as list
    sample_rate: Optional[int] = 16000
    language: Optional[str] = None


class TranscriptionResponse(BaseModel):
    """Response model for transcription."""
    text: str
    language: str
    language_probability: float
    duration: float
    segments: list[dict]


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(request: TranscriptionRequest):
    """
    Transcribe audio from Float32Array data.
    
    Args:
        request: Transcription request with audio data
    
    Returns:
        Transcription result
    """
    try:
        if not await stt_service.is_ready():
            raise HTTPException(status_code=503, detail="STT service not ready")
        
        if not request.audio_data:
            raise HTTPException(status_code=400, detail="Audio data is required")
        
        # Transcribe audio
        result = await stt_service.transcribe_float32_array(
            request.audio_data,
            request.sample_rate,
            request.language
        )
        
        return TranscriptionResponse(**result)
    
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


# File transcription temporarily disabled - requires python-multipart dependency
# Install with: pip install python-multipart

def transcribe_file_stub():
    """File transcription temporarily disabled - requires python-multipart dependency"""
    pass


@router.get("/ready")
async def check_ready():
    """Check if STT service is ready."""
    ready = await stt_service.is_ready()
    return {"ready": ready}


@router.get("/info")
async def get_info():
    """Get STT service information."""
    info = await stt_service.get_model_info()
    return info