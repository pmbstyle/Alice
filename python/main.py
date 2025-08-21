#!/usr/bin/env python3
"""
Alice AI Backend - FastAPI Server
Provides AI services: STT, TTS, and Embeddings
"""

import asyncio
import logging
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

# Set up logging
logger = setup_logger(__name__)

# Global service instances
services = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan events."""
    logger.info("Starting Alice AI Backend...")
    
    try:
        # Initialize services
        logger.info("Initializing AI services...")
        
        # Initialize STT service
        if settings.enable_stt:
            logger.info("Initializing STT service...")
            await stt_service.initialize()
            services["stt"] = stt_service
            logger.info("STT service ready")
        
        # Initialize TTS service  
        if settings.enable_tts:
            logger.info("Initializing TTS service...")
            await tts_service.initialize()
            services["tts"] = tts_service
            logger.info("TTS service ready")
        
        # Initialize Embeddings service
        if settings.enable_embeddings:
            logger.info("Initializing Embeddings service...")
            await embeddings_service.initialize()
            services["embeddings"] = embeddings_service
            logger.info("Embeddings service ready")
        
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
    allow_origins=["http://localhost:*", "http://127.0.0.1:*"],
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


# Import API routes
if settings.enable_stt:
    from api.stt import router as stt_router
    app.include_router(stt_router, prefix="/api/stt", tags=["STT"])

if settings.enable_tts:
    from api.tts import router as tts_router
    app.include_router(tts_router, prefix="/api/tts", tags=["TTS"])

if settings.enable_embeddings:
    from api.embeddings import router as embeddings_router
    app.include_router(embeddings_router, prefix="/api/embeddings", tags=["Embeddings"])


def main():
    """Main entry point."""
    try:
        # Configure console encoding for Windows to handle Unicode
        if sys.platform.startswith('win'):
            import os
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