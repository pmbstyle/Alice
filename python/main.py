#!/usr/bin/env python3
"""
Alice AI Backend - FastAPI Server
Provides AI services: STT, TTS, and Embeddings
"""

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from services.stt import stt_service
from services.tts import tts_service  
from services.embeddings import embeddings_service
from utils.logger import setup_logger
from utils.runtime_installer import runtime_installer

# Set up logging
logger = setup_logger(__name__)

# Global service instances
services = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan events."""
    logger.info("Starting Alice AI Backend...")
    
    try:
        # Check and install AI dependencies if needed
        logger.info("Checking AI dependencies...")
        
        # Try to install all AI dependencies upfront for better UX
        try:
            if not any([
                runtime_installer.is_package_installed('faster-whisper'),
                runtime_installer.is_package_installed('sentence-transformers'),
                runtime_installer.is_package_installed('kokoro')
            ]):
                logger.info("Installing AI dependencies for first-time setup...")
                await runtime_installer.install_ai_dependencies()
        except Exception as e:
            logger.warning(f"Bulk dependency installation failed: {e}")
            logger.info("Will install dependencies individually as needed")
        
        # Initialize services
        logger.info("Initializing AI services...")
        
        # Initialize STT service
        if settings.enable_stt:
            logger.info("Initializing STT service...")
            success = await stt_service.initialize()
            if success:
                services["stt"] = stt_service
                logger.info("STT service ready")
            else:
                logger.error("Failed to initialize STT service")
        
        # Initialize TTS service
        if settings.enable_tts:
            logger.info("Initializing TTS service...")
            success = await tts_service.initialize()
            if success:
                services["tts"] = tts_service
                logger.info("TTS service ready")
            else:
                logger.error("Failed to initialize TTS service")
        
        # Initialize Embeddings service
        if settings.enable_embeddings:
            logger.info("Initializing Embeddings service...")
            success = await embeddings_service.initialize()
            if success:
                services["embeddings"] = embeddings_service
                logger.info("Embeddings service ready")
            else:
                logger.error("Failed to initialize Embeddings service")
        
        logger.info("All AI services initialized successfully")
        
        yield
        
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise
    finally:
        # Cleanup services
        logger.info("Cleaning up AI services...")
        
        for name, service in services.items():
            try:
                if hasattr(service, 'cleanup'):
                    await service.cleanup()
                logger.info(f"{name.upper()} service cleaned up")
            except Exception as e:
                logger.error(f"Failed to cleanup {name} service: {e}")
        
        services.clear()
        logger.info("Alice AI Backend shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Alice AI Backend",
    description="AI services backend for Alice Electron app",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://127.0.0.1:5173", 
        "http://localhost:3000",  # Alternative dev port
        "http://127.0.0.1:3000",
        "http://localhost:8080",  # Another common dev port
        "http://127.0.0.1:8080"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint - indicates server is running and responding."""
    service_status = {}
    
    for name, service in services.items():
        try:
            if hasattr(service, 'is_ready'):
                service_status[name] = await service.is_ready()
            else:
                service_status[name] = True
        except Exception as e:
            logger.error(f"Health check failed for {name}: {e}")
            service_status[name] = False
    
    # Server is healthy if it's responding, regardless of AI service status
    return {
        "status": "healthy",
        "services": service_status,
        "version": "1.0.0"
    }


# Model status endpoint
@app.get("/api/models/status")
async def model_status():
    """Get status of all AI models."""
    model_status = {}
    
    for name, service in services.items():
        try:
            if hasattr(service, 'get_model_info'):
                model_status[name] = await service.get_model_info()
            else:
                model_status[name] = {"status": "ready"}
        except Exception as e:
            logger.error(f"Failed to get model status for {name}: {e}")
            model_status[name] = {"status": "error", "error": str(e)}
    
    return model_status


# Model download status and control endpoints
@app.get("/api/models/download-status")
async def model_download_status():
    """Get current model download status."""
    return {
        "stt": {
            "installed": runtime_installer.is_package_installed('faster-whisper'),
            "downloading": getattr(runtime_installer, '_downloading_stt', False)
        },
        "tts": {
            "installed": runtime_installer.is_package_installed('kokoro'),
            "downloading": getattr(runtime_installer, '_downloading_tts', False)
        },
        "embeddings": {
            "installed": runtime_installer.is_package_installed('sentence-transformers'),
            "downloading": getattr(runtime_installer, '_downloading_embeddings', False)
        }
    }


@app.post("/api/models/download/{service}")
async def download_model(service: str):
    """Download and install a specific AI model service."""
    if service not in ['stt', 'tts', 'embeddings']:
        return {"error": "Invalid service. Must be 'stt', 'tts', or 'embeddings'"}
    
    try:
        if service == 'stt':
            runtime_installer._downloading_stt = True
            success = await runtime_installer.ensure_package_installed(
                'faster-whisper', 
                lambda: __import__('faster_whisper')
            )
            runtime_installer._downloading_stt = False
            
            if success and settings.enable_stt and 'stt' not in services:
                # Initialize STT service after download
                await stt_service.initialize()
                services["stt"] = stt_service
                
        elif service == 'tts':
            runtime_installer._downloading_tts = True
            success = await runtime_installer.ensure_package_installed(
                'kokoro',
                lambda: __import__('kokoro')
            )
            runtime_installer._downloading_tts = False
            
            if success and settings.enable_tts and 'tts' not in services:
                # Initialize TTS service after download
                await tts_service.initialize()
                services["tts"] = tts_service
                
        elif service == 'embeddings':
            runtime_installer._downloading_embeddings = True
            success = await runtime_installer.ensure_package_installed(
                'sentence-transformers',
                lambda: __import__('sentence_transformers')
            )
            runtime_installer._downloading_embeddings = False
            
            if success and settings.enable_embeddings and 'embeddings' not in services:
                # Initialize Embeddings service after download
                await embeddings_service.initialize()
                services["embeddings"] = embeddings_service
                
        return {"success": success, "message": f"Model {service} {'installed successfully' if success else 'installation failed'}"}
        
    except Exception as e:
        # Reset downloading flags on error
        if service == 'stt':
            runtime_installer._downloading_stt = False
        elif service == 'tts':
            runtime_installer._downloading_tts = False
        elif service == 'embeddings':
            runtime_installer._downloading_embeddings = False
            
        logger.error(f"Failed to download {service} model: {e}")
        return {"success": False, "error": str(e)}


# Import API routes (always import for PyInstaller, conditionally register)
from api.stt import router as stt_router
from api.tts import router as tts_router  
from api.embeddings import router as embeddings_router

if settings.enable_stt:
    app.include_router(stt_router, prefix="/api/stt", tags=["STT"])

if settings.enable_tts:
    app.include_router(tts_router, prefix="/api/tts", tags=["TTS"])

if settings.enable_embeddings:
    app.include_router(embeddings_router, prefix="/api/embeddings", tags=["Embeddings"])


def main():
    """Main entry point."""
    try:
        # Configure console encoding for Windows to handle Unicode
        if sys.platform.startswith('win'):
            os.environ['PYTHONIOENCODING'] = 'utf-8'
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        
        logger.info(f"Starting Alice AI Backend on {settings.host}:{settings.port}")
        
        uvicorn.run(
            "main:app",
            host=settings.host,
            port=settings.port,
            reload=False,  # No reload in production
            log_level=settings.log_level.lower(),
            access_log=False,  # We handle our own logging
        )
    
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()