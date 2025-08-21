"""
Embeddings service using sentence-transformers
"""

import asyncio
import logging
import os
from typing import Optional, Dict, Any, List, Union
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
    import torch
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    SentenceTransformer = None
    torch = None

from config import settings, get_models_cache_dir
from utils.logger import get_logger

logger = get_logger(__name__)


class EmbeddingsService:
    """Embeddings service using sentence-transformers."""
    
    def __init__(self):
        self.model: Optional[SentenceTransformer] = None
        self.model_name = settings.embeddings_model
        self.device = settings.embeddings_device
        self.cache_dir = get_models_cache_dir()
        self._lock = asyncio.Lock()
        self._initialized = False
        
        # Model information
        self.embedding_dimension: Optional[int] = None
        self.max_sequence_length: Optional[int] = None
    
    async def initialize(self) -> bool:
        """Initialize the Embeddings service."""
        if not SENTENCE_TRANSFORMERS_AVAILABLE:
            logger.error("sentence-transformers is not available. Please install it: pip install sentence-transformers")
            return False
        
        async with self._lock:
            if self._initialized:
                return True
            
            try:
                logger.info(f"Initializing Embeddings service with model: {self.model_name}")
                logger.info(f"Device: {self.device}")
                
                # Set cache directory for models
                os.environ["TRANSFORMERS_CACHE"] = self.cache_dir
                os.environ["SENTENCE_TRANSFORMERS_HOME"] = self.cache_dir
                
                # Determine device
                device = self._determine_device()
                
                # Create model in a separate thread to avoid blocking
                self.model = await asyncio.get_event_loop().run_in_executor(
                    None,
                    self._create_model,
                    device
                )
                
                # Get model information
                self.embedding_dimension = self.model.get_sentence_embedding_dimension()
                self.max_sequence_length = getattr(self.model, 'max_seq_length', 512)
                
                self._initialized = True
                logger.info(f"Embeddings service initialized successfully")
                logger.info(f"Model dimensions: {self.embedding_dimension}")
                logger.info(f"Max sequence length: {self.max_sequence_length}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to initialize Embeddings service: {e}")
                return False
    
    def _create_model(self, device: str) -> SentenceTransformer:
        """Create SentenceTransformer instance (runs in thread pool)."""
        return SentenceTransformer(
            self.model_name,
            device=device,
            cache_folder=self.cache_dir
        )
    
    def _determine_device(self) -> str:
        """Determine the appropriate device to use."""
        if self.device == "auto":
            try:
                if torch.cuda.is_available():
                    logger.info("CUDA detected, using GPU")
                    return "cuda"
                elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                    logger.info("MPS detected, using Apple Silicon GPU")
                    return "mps"
                else:
                    logger.info("Using CPU")
                    return "cpu"
            except Exception:
                logger.info("Error detecting device, using CPU")
                return "cpu"
        return self.device
    
    async def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate embedding for a single text.
        
        Args:
            text: Text to embed
        
        Returns:
            Embedding as a list of floats, or None if generation failed
        """
        if not self._initialized or not self.model:
            raise RuntimeError("Embeddings service not initialized")
        
        try:
            # Clean text
            cleaned_text = self._clean_text(text)
            if not cleaned_text.strip():
                logger.warning("Empty text after cleaning, returning None")
                return None
            
            # Generate embedding in thread pool to avoid blocking
            embedding = await asyncio.get_event_loop().run_in_executor(
                None,
                self._encode_single,
                cleaned_text
            )
            
            return embedding.tolist() if embedding is not None else None
            
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise
    
    async def generate_embeddings(self, texts: List[str]) -> Optional[List[List[float]]]:
        """
        Generate embeddings for multiple texts.
        
        Args:
            texts: List of texts to embed
        
        Returns:
            List of embeddings as lists of floats, or None if generation failed
        """
        if not self._initialized or not self.model:
            raise RuntimeError("Embeddings service not initialized")
        
        try:
            # Clean texts
            cleaned_texts = [self._clean_text(text) for text in texts]
            
            # Filter out empty texts
            valid_texts = [text for text in cleaned_texts if text.strip()]
            if not valid_texts:
                logger.warning("No valid texts after cleaning")
                return []
            
            # Generate embeddings in thread pool to avoid blocking
            embeddings = await asyncio.get_event_loop().run_in_executor(
                None,
                self._encode_batch,
                valid_texts
            )
            
            return embeddings.tolist() if embeddings is not None else None
            
        except Exception as e:
            logger.error(f"Batch embedding generation failed: {e}")
            raise
    
    def _encode_single(self, text: str) -> Optional[np.ndarray]:
        """Encode single text (runs in thread pool)."""
        try:
            embedding = self.model.encode([text], convert_to_numpy=True, normalize_embeddings=True)
            return embedding[0] if len(embedding) > 0 else None
        except Exception as e:
            logger.error(f"Error encoding single text: {e}")
            return None
    
    def _encode_batch(self, texts: List[str]) -> Optional[np.ndarray]:
        """Encode batch of texts (runs in thread pool)."""
        try:
            embeddings = self.model.encode(
                texts,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
                batch_size=32
            )
            return embeddings
        except Exception as e:
            logger.error(f"Error encoding batch: {e}")
            return None
    
    def _clean_text(self, text: str) -> str:
        """Clean and prepare text for embedding."""
        # Basic text cleaning
        cleaned = text.strip()
        
        # Remove excessive whitespace
        import re
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        # Truncate if too long (rough character-based estimate)
        # Most models have a token limit around 512, roughly 2000-3000 characters
        max_chars = self.max_sequence_length * 4 if self.max_sequence_length else 2000
        if len(cleaned) > max_chars:
            cleaned = cleaned[:max_chars] + "..."
            logger.debug(f"Text truncated to {max_chars} characters")
        
        return cleaned
    
    async def compute_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """
        Compute cosine similarity between two embeddings.
        
        Args:
            embedding1: First embedding
            embedding2: Second embedding
        
        Returns:
            Similarity score between -1 and 1
        """
        try:
            # Convert to numpy arrays
            vec1 = np.array(embedding1, dtype=np.float32)
            vec2 = np.array(embedding2, dtype=np.float32)
            
            # Compute cosine similarity
            similarity = await asyncio.get_event_loop().run_in_executor(
                None,
                self._cosine_similarity,
                vec1,
                vec2
            )
            
            return float(similarity)
            
        except Exception as e:
            logger.error(f"Similarity computation failed: {e}")
            raise
    
    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Compute cosine similarity (runs in thread pool)."""
        # Normalize vectors
        vec1_norm = vec1 / (np.linalg.norm(vec1) + 1e-8)
        vec2_norm = vec2 / (np.linalg.norm(vec2) + 1e-8)
        
        # Compute dot product
        return np.dot(vec1_norm, vec2_norm)
    
    async def find_most_similar(self, query_embedding: List[float], candidate_embeddings: List[List[float]], top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Find the most similar embeddings to a query embedding.
        
        Args:
            query_embedding: Query embedding
            candidate_embeddings: List of candidate embeddings
            top_k: Number of top results to return
        
        Returns:
            List of dictionaries with 'index' and 'similarity' keys
        """
        if not candidate_embeddings:
            return []
        
        try:
            # Compute similarities
            similarities = []
            for i, candidate in enumerate(candidate_embeddings):
                similarity = await self.compute_similarity(query_embedding, candidate)
                similarities.append({"index": i, "similarity": similarity})
            
            # Sort by similarity (descending)
            similarities.sort(key=lambda x: x["similarity"], reverse=True)
            
            # Return top_k results
            return similarities[:top_k]
            
        except Exception as e:
            logger.error(f"Similarity search failed: {e}")
            raise
    
    async def is_ready(self) -> bool:
        """Check if the service is ready."""
        return self._initialized and self.model is not None
    
    async def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model."""
        if not self._initialized:
            return {"status": "not_initialized"}
        
        return {
            "status": "ready",
            "model_name": self.model_name,
            "device": self.device,
            "cache_dir": self.cache_dir,
            "embedding_dimension": self.embedding_dimension,
            "max_sequence_length": self.max_sequence_length,
        }
    
    async def test_embedding(self) -> Dict[str, Any]:
        """Test the embeddings service with a simple text."""
        test_text = "This is a test sentence for embedding generation."
        
        try:
            embedding = await self.generate_embedding(test_text)
            
            if embedding:
                return {
                    "success": True,
                    "embedding_dimension": len(embedding),
                    "sample_values": embedding[:5],  # First 5 values
                    "test_text": test_text
                }
            else:
                return {
                    "success": False,
                    "error": "No embedding generated"
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    async def cleanup(self):
        """Clean up resources."""
        async with self._lock:
            if self.model:
                # Move model to CPU to free GPU memory
                try:
                    if hasattr(self.model, 'device') and 'cuda' in str(self.model.device):
                        self.model.to('cpu')
                except Exception as e:
                    logger.warning(f"Could not move model to CPU: {e}")
                
                self.model = None
            
            self._initialized = False
            self.embedding_dimension = None
            self.max_sequence_length = None
            logger.info("Embeddings service cleaned up")


# Global Embeddings service instance
embeddings_service = EmbeddingsService()