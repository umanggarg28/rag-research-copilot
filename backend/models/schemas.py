"""
schemas.py — Pydantic models: API contracts.

WHY PYDANTIC SCHEMAS?
======================
FastAPI uses Pydantic to:
  1. Validate incoming requests — wrong type = clear error message, not crash
  2. Serialize responses to JSON automatically
  3. Auto-generate interactive API docs at /docs (Swagger UI)

Think of each class here as a PROMISE:
  - Request schemas: "I promise the frontend sends this shape of data"
  - Response schemas: "I promise the backend returns this shape of data"

This makes debugging easy — if the API contract is violated, Pydantic
raises a clear ValidationError telling you exactly what's wrong.
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal


# ─── Request schemas (what the client sends) ────────────────────────────────

class QueryRequest(BaseModel):
    """Full RAG query: retrieve + generate."""
    question: str = Field(..., min_length=1, description="Natural language question")
    top_k: int = Field(5, ge=1, le=20, description="Chunks to retrieve (1-20)")
    source_filter: Optional[str] = Field(
        None,
        description="If set, only search within this paper (use the 'source' name from /ingest/list)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "question": "How does multi-head attention work?",
                "top_k": 5,
            }
        }


class SearchRequest(BaseModel):
    """Pure retrieval, no LLM generation."""
    query: str = Field(..., min_length=1)
    top_k: int = Field(5, ge=1, le=20)
    source_filter: Optional[str] = None
    mode: Literal["semantic", "keyword", "hybrid"] = Field(
        "hybrid",
        description="Search mode: 'semantic' (embeddings), 'keyword' (BM25), 'hybrid' (RRF)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "query": "attention mechanism transformer",
                "top_k": 5,
                "mode": "hybrid"
            }
        }


# ─── Response schemas (what the server returns) ─────────────────────────────

class Citation(BaseModel):
    """A source citation — where the answer came from."""
    source: str = Field(..., description="Paper identifier")
    filename: str = Field(..., description="Original PDF filename")
    page: int = Field(..., description="Page number in the paper")
    score: float = Field(..., description="Retrieval relevance score (0-1, higher = more relevant)")


class SearchResult(BaseModel):
    """A single retrieved document chunk."""
    text: str = Field(..., description="The chunk text")
    source: str
    filename: str
    page: int
    score: float = Field(..., description="Relevance score")


class QueryResponse(BaseModel):
    """Full RAG response: answer + where it came from + what was retrieved."""
    answer: str = Field(..., description="LLM-generated answer grounded in retrieved context")
    citations: list[Citation] = Field(..., description="Sources used to generate the answer")
    retrieved_chunks: list[SearchResult] = Field(..., description="Raw chunks retrieved (for transparency)")
    model: str = Field(..., description="LLM model used for generation")
    tokens_used: dict = Field(..., description="{'input': N, 'output': N} — for cost tracking")


class SearchResponse(BaseModel):
    """Pure retrieval response — no LLM generation."""
    results: list[SearchResult]
    total: int


class IngestResponse(BaseModel):
    """Response after successfully ingesting a document."""
    success: bool
    source: str = Field(..., description="Internal identifier for this document")
    filename: str
    pages: int
    chunks: int
    message: str


class DocumentInfo(BaseModel):
    """Summary info about an ingested document."""
    source: str
    filename: str
    chunks: int
