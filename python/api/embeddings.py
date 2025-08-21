"""
Embeddings API endpoints
"""

import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.embeddings import embeddings_service
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


class EmbeddingRequest(BaseModel):
    """Request model for single embedding generation."""
    text: str


class EmbeddingsRequest(BaseModel):
    """Request model for batch embedding generation."""
    texts: List[str]


class EmbeddingResponse(BaseModel):
    """Response model for single embedding."""
    embedding: List[float]
    dimension: int


class EmbeddingsResponse(BaseModel):
    """Response model for batch embeddings."""
    embeddings: List[List[float]]
    dimension: int
    count: int


class SimilarityRequest(BaseModel):
    """Request model for similarity computation."""
    embedding1: List[float]
    embedding2: List[float]


class SimilarityResponse(BaseModel):
    """Response model for similarity computation."""
    similarity: float


class SimilaritySearchRequest(BaseModel):
    """Request model for similarity search."""
    query_embedding: List[float]
    candidate_embeddings: List[List[float]]
    top_k: Optional[int] = 5


class SimilaritySearchResponse(BaseModel):
    """Response model for similarity search."""
    results: List[dict]


@router.post("/generate", response_model=EmbeddingResponse)
async def generate_embedding(request: EmbeddingRequest):
    """
    Generate embedding for a single text.
    
    Args:
        request: Embedding request with text
    
    Returns:
        Generated embedding
    """
    try:
        if not await embeddings_service.is_ready():
            raise HTTPException(status_code=503, detail="Embeddings service not ready")
        
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text is required")
        
        # Generate embedding
        embedding = await embeddings_service.generate_embedding(request.text)
        
        if embedding is None:
            raise HTTPException(status_code=500, detail="Failed to generate embedding")
        
        return EmbeddingResponse(
            embedding=embedding,
            dimension=len(embedding)
        )
    
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")


@router.post("/generate-batch", response_model=EmbeddingsResponse)
async def generate_embeddings(request: EmbeddingsRequest):
    """
    Generate embeddings for multiple texts.
    
    Args:
        request: Batch embedding request with texts
    
    Returns:
        Generated embeddings
    """
    try:
        if not await embeddings_service.is_ready():
            raise HTTPException(status_code=503, detail="Embeddings service not ready")
        
        if not request.texts or not any(text.strip() for text in request.texts):
            raise HTTPException(status_code=400, detail="At least one non-empty text is required")
        
        # Generate embeddings
        embeddings = await embeddings_service.generate_embeddings(request.texts)
        
        if embeddings is None:
            raise HTTPException(status_code=500, detail="Failed to generate embeddings")
        
        dimension = len(embeddings[0]) if embeddings else 0
        
        return EmbeddingsResponse(
            embeddings=embeddings,
            dimension=dimension,
            count=len(embeddings)
        )
    
    except Exception as e:
        logger.error(f"Batch embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Batch embedding generation failed: {str(e)}")


@router.post("/similarity", response_model=SimilarityResponse)
async def compute_similarity(request: SimilarityRequest):
    """
    Compute cosine similarity between two embeddings.
    
    Args:
        request: Similarity request with two embeddings
    
    Returns:
        Similarity score
    """
    try:
        if not await embeddings_service.is_ready():
            raise HTTPException(status_code=503, detail="Embeddings service not ready")
        
        if not request.embedding1 or not request.embedding2:
            raise HTTPException(status_code=400, detail="Both embeddings are required")
        
        if len(request.embedding1) != len(request.embedding2):
            raise HTTPException(status_code=400, detail="Embeddings must have the same dimension")
        
        # Compute similarity
        similarity = await embeddings_service.compute_similarity(
            request.embedding1,
            request.embedding2
        )
        
        return SimilarityResponse(similarity=similarity)
    
    except Exception as e:
        logger.error(f"Similarity computation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Similarity computation failed: {str(e)}")


@router.post("/search", response_model=SimilaritySearchResponse)
async def similarity_search(request: SimilaritySearchRequest):
    """
    Find most similar embeddings to a query embedding.
    
    Args:
        request: Similarity search request
    
    Returns:
        Top similar embeddings with their indices and scores
    """
    try:
        if not await embeddings_service.is_ready():
            raise HTTPException(status_code=503, detail="Embeddings service not ready")
        
        if not request.query_embedding or not request.candidate_embeddings:
            raise HTTPException(status_code=400, detail="Query and candidate embeddings are required")
        
        # Check dimensions
        query_dim = len(request.query_embedding)
        for i, candidate in enumerate(request.candidate_embeddings):
            if len(candidate) != query_dim:
                raise HTTPException(
                    status_code=400,
                    detail=f"Candidate embedding {i} has different dimension than query"
                )
        
        # Perform similarity search
        results = await embeddings_service.find_most_similar(
            request.query_embedding,
            request.candidate_embeddings,
            request.top_k
        )
        
        return SimilaritySearchResponse(results=results)
    
    except Exception as e:
        logger.error(f"Similarity search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Similarity search failed: {str(e)}")


@router.post("/test")
async def test_embeddings():
    """Test embeddings service with a simple text."""
    try:
        if not await embeddings_service.is_ready():
            raise HTTPException(status_code=503, detail="Embeddings service not ready")
        
        result = await embeddings_service.test_embedding()
        return result
    except Exception as e:
        logger.error(f"Embeddings test failed: {e}")
        raise HTTPException(status_code=500, detail=f"Embeddings test failed: {str(e)}")


@router.get("/ready")
async def check_ready():
    """Check if Embeddings service is ready."""
    ready = await embeddings_service.is_ready()
    return {"ready": ready}


@router.get("/info")
async def get_info():
    """Get Embeddings service information."""
    info = await embeddings_service.get_model_info()
    return info