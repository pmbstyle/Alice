"""
Text-to-Speech API endpoints
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from services.tts import tts_service
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


class SynthesisRequest(BaseModel):
    """Request model for speech synthesis."""
    text: str
    voice: Optional[str] = None


class SynthesisResponse(BaseModel):
    """Response model for speech synthesis."""
    success: bool
    message: Optional[str] = None


@router.post("/synthesize")
async def synthesize_speech(request: SynthesisRequest):
    """
    Synthesize speech from text.
    
    Args:
        request: Synthesis request with text and optional voice
    
    Returns:
        WAV audio data
    """
    try:
        if not await tts_service.is_ready():
            raise HTTPException(status_code=503, detail="TTS service not ready")
        
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text is required")
        
        # Synthesize speech
        audio_data = await tts_service.synthesize_speech(request.text, request.voice)
        
        if audio_data is None:
            raise HTTPException(status_code=500, detail="Failed to generate speech")
        
        # Return audio as WAV
        return Response(
            content=audio_data,
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=speech.wav"
            }
        )
    
    except Exception as e:
        logger.error(f"Speech synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")


@router.get("/voices")
async def get_voices():
    """Get available TTS voices."""
    try:
        voices = await tts_service.get_available_voices()
        return voices
    except Exception as e:
        logger.error(f"Failed to get voices: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get voices: {str(e)}")


@router.post("/test")
async def test_synthesis():
    """Test TTS service with a simple phrase."""
    try:
        if not await tts_service.is_ready():
            raise HTTPException(status_code=503, detail="TTS service not ready")
        
        result = await tts_service.test_synthesis()
        return result
    except Exception as e:
        logger.error(f"TTS test failed: {e}")
        raise HTTPException(status_code=500, detail=f"TTS test failed: {str(e)}")


@router.get("/ready")
async def check_ready():
    """Check if TTS service is ready."""
    ready = await tts_service.is_ready()
    return {"ready": ready}


@router.get("/info")
async def get_info():
    """Get TTS service information."""
    info = await tts_service.get_model_info()
    return info