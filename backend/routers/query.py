"""
query.py — HTTP endpoints for RAG queries and semantic search.

POST /query    — Full RAG pipeline: retrieve + generate answer with citations
POST /search   — Retrieval only (no LLM): pure semantic/keyword/hybrid search

Why two endpoints?
  /search is useful for:
    - Debugging retrieval (is the right context being found?)
    - Building UI features that show "relevant sections" without generating text
    - Cheaper (no LLM API call)
    - Evaluating retrieval quality independently of generation quality

  /query is the full RAG experience users care about.

This separation of concerns is a key architectural principle:
evaluate retrieval and generation INDEPENDENTLY so you can debug which part is failing.
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from backend.models.schemas import (
    QueryRequest, QueryResponse,
    SearchRequest, SearchResponse,
    SearchResult, Citation,
)
from backend.services.retrieval import RetrievalService
from backend.services.generation import GenerationService
from backend.routers.ingest import get_ingestion_service
from backend.services.ingestion import IngestionService

router = APIRouter(tags=["Query"])

_retrieval_service: RetrievalService = None
_generation_service: GenerationService = None


def get_retrieval_service(
    ingestion: IngestionService = Depends(get_ingestion_service),
) -> RetrievalService:
    """
    Returns (lazily creates) the shared RetrievalService.

    We pass the ingestion service's bm25_index to avoid maintaining
    two separate BM25 indexes — they must stay in sync.
    """
    global _retrieval_service
    if _retrieval_service is None:
        _retrieval_service = RetrievalService(bm25_index=ingestion.bm25_index)
    return _retrieval_service


def get_generation_service() -> GenerationService:
    """Returns (lazily creates) the shared GenerationService."""
    global _generation_service
    if _generation_service is None:
        _generation_service = GenerationService()
    return _generation_service


@router.post("/query", response_model=QueryResponse)
async def query(
    request: QueryRequest,
    retrieval: RetrievalService = Depends(get_retrieval_service),
    generation: GenerationService = Depends(get_generation_service),
):
    """
    Full RAG pipeline: retrieval + LLM generation.

    Flow:
      1. Retrieve top_k relevant chunks (hybrid search by default)
      2. Format chunks as context string
      3. Send context + question to Claude
      4. Return answer + citations + retrieved chunks

    The response includes retrieved_chunks so the UI can show
    "here's what the system found" alongside the answer.
    This is crucial for trust — users can verify the answer themselves.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # Step 1: Retrieve relevant chunks (threshold=0.3 skips LLM for out-of-domain queries)
    results = retrieval.search(
        query=request.question,
        top_k=request.top_k,
        source_filter=request.source_filter,
        mode=request.mode,
        relevance_threshold=0.3,
    )

    if not results:
        return QueryResponse(
            answer="No relevant content found in your uploaded papers for this question.",
            citations=[],
            retrieved_chunks=[],
            model="none",
            tokens_used={"input": 0, "output": 0},
        )

    # Step 2: Format context for the LLM prompt
    context = retrieval.format_context(results)

    # Step 3: Generate answer
    gen_result = generation.generate(
        question=request.question,
        context=context,
        retrieved_sources=results,
    )

    # Step 4: Build response
    return QueryResponse(
        answer=gen_result["answer"],
        citations=[Citation(**c) for c in gen_result["citations"]],
        retrieved_chunks=[
            SearchResult(
                text=r["text"],
                source=r["source"],
                filename=r["filename"],
                page=r["page"],
                score=r["score"],
            )
            for r in results
        ],
        model=gen_result["model"],
        tokens_used=gen_result["tokens_used"],
    )


@router.post("/query/stream")
async def query_stream(
    request: QueryRequest,
    retrieval: RetrievalService = Depends(get_retrieval_service),
    generation: GenerationService = Depends(get_generation_service),
):
    """
    Streaming RAG pipeline via Server-Sent Events.

    Yields:
      data: {"type": "text",  "content": "<token>"}
      data: {"type": "done",  "citations": [...], "model": "...", ...}
      data: {"type": "error", "content": "<msg>"}
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    results = retrieval.search(
        query=request.question,
        top_k=request.top_k,
        source_filter=request.source_filter,
        mode=request.mode,
        relevance_threshold=0.3,
    )

    if not results:
        async def no_docs():
            yield f"data: {json.dumps({'type': 'text', 'content': 'No relevant content found in your uploaded papers for this question.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'citations': [], 'retrieved_chunks': [], 'model': 'none', 'tokens_used': {'input': 0, 'output': 0}})}\n\n"
        return StreamingResponse(no_docs(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    context = retrieval.format_context(results)

    def event_stream():
        for event in generation.generate_stream(
            question=request.question,
            context=context,
            retrieved_sources=results,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/search", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    retrieval: RetrievalService = Depends(get_retrieval_service),
):
    """
    Pure retrieval — no LLM generation.

    Returns the raw chunks that would be used as context for a query.
    Useful for:
      - Verifying that the right content is being indexed
      - Debugging retrieval quality before adding generation
      - Building document explorer UI features

    Supports mode parameter: "semantic", "keyword", or "hybrid".
    """
    results = retrieval.search(
        query=request.query,
        top_k=request.top_k,
        source_filter=request.source_filter,
        mode=getattr(request, 'mode', 'hybrid'),
    )

    return SearchResponse(
        results=[
            SearchResult(
                text=r["text"],
                source=r["source"],
                filename=r["filename"],
                page=r["page"],
                score=r["score"],
            )
            for r in results
        ],
        total=len(results),
    )
