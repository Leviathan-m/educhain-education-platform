"""
Configuration settings for AI Evaluation Service
"""

import os
from typing import List
try:
    from pydantic_settings import BaseSettings
except ImportError:
    # Fallback for older pydantic versions
    from pydantic import BaseSettings

class Settings(BaseSettings):
    """Application settings"""

    # API Settings
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = True

    # Model Settings
    MODEL_CACHE_DIR: str = "./models/cache"
    SENTENCE_TRANSFORMER_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    TEXT_CLASSIFICATION_MODEL: str = "microsoft/DialoGPT-medium"
    NER_MODEL: str = "dbmdz/bert-large-cased-finetuned-conll03-english"

    # Evaluation Settings
    SIMILARITY_THRESHOLD: float = 0.7
    CONFIDENCE_THRESHOLD: float = 0.8
    MAX_TOKENS: int = 512
    BATCH_SIZE: int = 16

    # Database Settings (for caching)
    REDIS_URL: str = "redis://localhost:6379"
    CACHE_TTL: int = 3600  # 1 hour

    # External API Settings
    BACKEND_API_URL: str = "http://backend:3000"

    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    API_KEY: str = "your-api-key"

    class Config:
        env_file = ".env"
        case_sensitive = True

# Create settings instance
settings = Settings()
