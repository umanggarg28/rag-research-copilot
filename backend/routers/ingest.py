"""
ingest.py — HTTP endpoints for document ingestion.

POST /ingest/upload   — Upload a PDF file and ingest it
GET  /ingest/list     — List all ingested documents
DELETE /ingest/{source} — Remove a document from the index

These are the endpoints you'd call to "load" your knowledge base.
In a real system, you might trigger ingestion automatically when a
new paper is added to an S3 bucket — but for our local version, you
upload manually through the API or UI.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from pathlib import Path
from typing import Optional
import tempfile
import sys
import os

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from backend.models.schemas import IngestResponse, DocumentInfo
from backend.services.ingestion import IngestionService

router = APIRouter(prefix="/ingest", tags=["Ingestion"])

# Module-level service instance (loaded once at startup)
# We use a simple global here for simplicity. In larger apps you'd use
# FastAPI's dependency injection with lifespan events.
_ingestion_service: IngestionService = None


def get_ingestion_service() -> IngestionService:
    """
    FastAPI dependency: returns (or lazily creates) the shared IngestionService.

    Why lazy initialization? Loading the embedding model takes ~2 seconds.
    We don't want that at import time — only when the first request comes in.
    """
    global _ingestion_service
    if _ingestion_service is None:
        _ingestion_service = IngestionService()
    return _ingestion_service


@router.post("/upload", response_model=IngestResponse)
async def upload_pdf(
    file: UploadFile = File(..., description="PDF file to ingest"),
    source_name: Optional[str] = Form(None, description="Human-readable name (e.g. 'attention_2017')"),
    service: IngestionService = Depends(get_ingestion_service),
):
    """
    Upload and ingest a PDF research paper.

    The file is:
      1. Saved to a temp file (UploadFile is a stream, not a path)
      2. Passed to IngestionService for the full pipeline
      3. Temp file deleted after ingestion

    Why a temp file? pypdf needs a file path, not a bytes stream.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Save uploaded bytes to a temporary file
    # tempfile.NamedTemporaryFile with delete=False lets us pass the path to pypdf
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    # If no source_name provided, derive it from the original filename
    effective_source = source_name or Path(file.filename).stem.replace(" ", "_")

    try:
        result = service.ingest_pdf(tmp_path, source_name=effective_source)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")
    finally:
        os.unlink(tmp_path)  # always clean up temp file

    return IngestResponse(
        success=True,
        message=f"Successfully ingested {result['chunks']} chunks from {result['pages']} pages",
        **result,
    )


@router.get("/list", response_model=list[DocumentInfo])
def list_documents(service: IngestionService = Depends(get_ingestion_service)):
    """List all ingested documents in the knowledge base."""
    return service.list_documents()


@router.delete("/{source_name}")
def delete_document(
    source_name: str,
    service: IngestionService = Depends(get_ingestion_service),
):
    """Remove a document and all its chunks from the index."""
    deleted = service.delete_document(source_name)
    if deleted == 0:
        raise HTTPException(status_code=404, detail=f"Document '{source_name}' not found")
    return {"deleted_chunks": deleted, "source": source_name}
