"""
config.py — Central configuration using environment variables.

Why: Hard-coding values (chunk size, model names, paths) makes the system
inflexible and hard to tune. Centralizing config means you can change
behavior without touching logic code.

Pydantic's BaseSettings automatically reads from .env files.
"""

from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # LLM — set either key; Groq takes priority (it's free)
    groq_api_key: str = ""        # Free: https://console.groq.com
    anthropic_api_key: str = ""   # Paid: https://console.anthropic.com

    # Embeddings — sentence-transformers model name.
    # all-MiniLM-L6-v2 produces 384-dim vectors, runs on CPU, ~80MB download.
    embedding_model: str = "all-MiniLM-L6-v2"

    # ChromaDB — where vectors are persisted on disk
    chroma_persist_dir: str = "./data/chroma"

    # Chunking strategy:
    # chunk_size: max tokens per chunk. Larger = more context per chunk but
    #   less precise retrieval. 800 is a good balance for research papers.
    # chunk_overlap: how many tokens overlap between adjacent chunks.
    #   Overlap prevents losing context that falls at a chunk boundary.
    chunk_size: int = 800
    chunk_overlap: int = 150

    # Retrieval: how many chunks to return per query
    top_k: int = 5

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Singleton — import this anywhere in the app
settings = Settings()
