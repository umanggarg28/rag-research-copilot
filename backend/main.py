"""
main.py — FastAPI application entry point.

FastAPI is an async web framework. Compared to Flask:
  - Async: can handle many requests concurrently (important for RAG — LLM calls are slow)
  - Automatic validation via Pydantic schemas
  - Auto-generated interactive docs at /docs

To run:
  cd backend
  uvicorn main:app --reload

  --reload: auto-restarts when you change code (dev only)

Visit http://localhost:8000/docs to see the interactive API documentation.
You can test every endpoint directly from the browser — no curl or Postman needed.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
from pathlib import Path

# Make sure backend package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.routers import ingest, query

# ─── App setup ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Research Copilot",
    description="""
A RAG (Retrieval Augmented Generation) system for querying research papers.

## How to use

1. **Ingest papers**: `POST /ingest/upload` — upload PDF files
2. **Search**: `POST /search` — find relevant chunks (no LLM)
3. **Ask questions**: `POST /query` — get grounded answers with citations

## Architecture

```
PDF → chunks → embeddings → ChromaDB
                                ↓
Query → embed → vector search ─┤
      → tokenize → BM25 search ─┤ → RRF fusion → top-K chunks → LLM → Answer
```
    """,
    version="0.1.0",
)

# ─── CORS ───────────────────────────────────────────────────────────────────
# CORS (Cross-Origin Resource Sharing) allows the React frontend (on port 3000)
# to call this API (on port 8000). Browsers block cross-origin requests by default.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ────────────────────────────────────────────────────────────────
# Routers group related endpoints. This keeps main.py small.
app.include_router(ingest.router)
app.include_router(query.router)


# ─── Root endpoint ──────────────────────────────────────────────────────────
@app.get("/")
def root():
    """Health check and API info."""
    return {
        "status": "ok",
        "message": "AI Research Copilot API",
        "docs": "/docs",
        "endpoints": {
            "ingest_pdf": "POST /ingest/upload",
            "list_docs": "GET /ingest/list",
            "search": "POST /search",
            "query": "POST /query",
        },
    }


@app.get("/health")
def health():
    """Kubernetes/deployment health check."""
    return {"status": "healthy"}
