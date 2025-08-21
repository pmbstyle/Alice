"""
Configuration management for Alice AI Backend
"""

import os
from typing import Optional
try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings."""
    
    # Server settings
    host: str = Field(default="127.0.0.1", env="ALICE_HOST")
    port: int = Field(default=8765, env="ALICE_PORT")
    log_level: str = Field(default="INFO", env="ALICE_LOG_LEVEL")
    
    # Service toggles
    enable_stt: bool = Field(default=True, env="ALICE_ENABLE_STT")
    enable_tts: bool = Field(default=True, env="ALICE_ENABLE_TTS")
    enable_embeddings: bool = Field(default=True, env="ALICE_ENABLE_EMBEDDINGS")
    
    # STT settings (faster-whisper)
    stt_model_size: str = Field(default="small", env="ALICE_STT_MODEL_SIZE")  # tiny, base, small, medium, large
    stt_device: str = Field(default="auto", env="ALICE_STT_DEVICE")  # auto, cpu, cuda
    stt_compute_type: str = Field(default="auto", env="ALICE_STT_COMPUTE_TYPE")  # auto, float16, int8
    
    # TTS settings (Kokoro)
    tts_voice: str = Field(default="af_bella", env="ALICE_TTS_VOICE")
    tts_device: str = Field(default="auto", env="ALICE_TTS_DEVICE")  # auto, cpu, cuda
    tts_quantization: str = Field(default="fp16", env="ALICE_TTS_QUANTIZATION")  # fp32, fp16, q8, q4
    
    # Embeddings settings (sentence-transformers)
    embeddings_model: str = Field(default="Qwen/Qwen3-Embedding-0.6B", env="ALICE_EMBEDDINGS_MODEL")
    embeddings_device: str = Field(default="auto", env="ALICE_EMBEDDINGS_DEVICE")  # auto, cpu, cuda
    
    # Cache settings
    cache_dir: Optional[str] = Field(default=None, env="ALICE_CACHE_DIR")
    models_cache_dir: Optional[str] = Field(default=None, env="ALICE_MODELS_CACHE_DIR")
    
    # Performance settings
    max_workers: int = Field(default=4, env="ALICE_MAX_WORKERS")
    request_timeout: int = Field(default=30, env="ALICE_REQUEST_TIMEOUT")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"


# Global settings instance
settings = Settings()


def get_cache_dir() -> str:
    """Get the cache directory path."""
    if settings.cache_dir:
        return settings.cache_dir
    
    # Default cache locations
    if os.name == 'nt':  # Windows
        cache_dir = os.path.join(os.environ.get('APPDATA', ''), 'AliceAI', 'cache')
    else:  # Unix-like
        cache_dir = os.path.join(os.path.expanduser('~'), '.cache', 'alice-ai')
    
    # Ensure directory exists
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def get_models_cache_dir() -> str:
    """Get the models cache directory path."""
    if settings.models_cache_dir:
        return settings.models_cache_dir
    
    models_dir = os.path.join(get_cache_dir(), 'models')
    os.makedirs(models_dir, exist_ok=True)
    return models_dir