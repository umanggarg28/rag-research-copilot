"""
retrieval.py — The semantic + hybrid search engine.

This service answers: "Given a query, what chunks are most relevant?"

Three search modes:
  1. Semantic search  — embedding similarity (cosine distance)
  2. Keyword search   — BM25 exact token matching
  3. Hybrid search    — RRF fusion of both (best quality)

Production RAG systems almost always use hybrid search because neither
semantic nor keyword search alone is sufficient.

Example where each mode wins:
  Query: "What is the BLEU score on WMT 2014?"
    → BM25 wins: "BLEU", "WMT", "2014" are exact keywords
    → Semantic might retrieve unrelated evaluation discussion

  Query: "How does the model handle long-range dependencies?"
    → Semantic wins: no exact keywords, but meaning is clear
    → BM25 fails: "long-range dependencies" might not appear verbatim
"""

from pathlib import Path
from typing import Optional, Literal
import sys

import chromadb

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import settings

sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from retrieval.embedder import Embedder
from retrieval.bm25_search import BM25Index, reciprocal_rank_fusion


class RetrievalService:
    """
    Unified retrieval service supporting semantic, keyword, and hybrid search.

    Important: uses the SAME embedding model as IngestionService.
    If you embed queries with one model but indexed with another,
    the vectors are in incompatible spaces — results are meaningless.
    """

    def __init__(self, bm25_index: BM25Index = None):
        """
        Args:
            bm25_index: Optional pre-built BM25 index (passed from IngestionService
                        to avoid maintaining two separate copies)
        """
        self.embedder = Embedder(settings.embedding_model)
        self.chroma = chromadb.PersistentClient(path=settings.chroma_persist_dir)
        self.collection = self.chroma.get_or_create_collection(
            name="research_papers",
            metadata={"hnsw:space": "cosine"},
        )

        # Use shared BM25 index or create a new one
        self.bm25_index = bm25_index or BM25Index()

    def search(
        self,
        query: str,
        top_k: int = None,
        source_filter: Optional[str] = None,
        mode: Literal["semantic", "keyword", "hybrid"] = "hybrid",
        relevance_threshold: float = 0.0,
    ) -> list[dict]:
        """
        Main search method. Dispatches to the appropriate search mode.

        Args:
            query: Natural language question or keywords
            top_k: Number of results to return
            source_filter: Restrict search to a specific paper by source name
            mode: Search strategy to use
                  "semantic" — pure vector similarity (catches paraphrases)
                  "keyword"  — pure BM25 (catches exact terms, numbers)
                  "hybrid"   — RRF fusion of both (best overall quality)

        Returns:
            List of result dicts, sorted by relevance (best first):
            [{text, source, filename, page, chunk_index, score}, ...]
        """
        top_k = top_k or settings.top_k

        if mode == "semantic":
            return self._semantic_search(query, top_k, source_filter, relevance_threshold=relevance_threshold)
        elif mode == "keyword":
            return self._keyword_search(query, top_k, source_filter)
        else:  # hybrid
            return self._hybrid_search(query, top_k, source_filter, relevance_threshold)

    def _semantic_search(
        self,
        query: str,
        top_k: int,
        source_filter: Optional[str],
        relevance_threshold: float = 0.0,
    ) -> list[dict]:
        """
        Pure vector similarity search.

        Steps:
          1. Embed the query to get a 384-dim vector
          2. ChromaDB finds the top_k chunk vectors closest to query vector
             (using cosine distance internally — HNSW approximate nearest neighbor)
          3. Return chunks with their similarity scores

        HNSW (Hierarchical Navigable Small World) is the index structure
        ChromaDB uses — it's approximate nearest neighbor, much faster than
        brute-force comparison against all stored vectors.
        """
        if self.collection.count() == 0:
            return []

        # Embed the query — MUST use same model as ingestion
        query_vector = self.embedder.embed_text(query)

        # Metadata filter (optional): restrict to specific paper
        where = {"source": source_filter} if source_filter else None

        # Query ChromaDB — returns top_k nearest vectors
        n = min(top_k, self.collection.count())
        results = self.collection.query(
            query_embeddings=[query_vector],
            n_results=n,
            where=where,
            include=["documents", "metadatas", "distances"],
        )

        if not results["documents"][0]:
            return []

        # ChromaDB returns distances (for cosine space: distance = 1 - similarity)
        # Convert to similarity score: score = 1 - distance
        output = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            similarity = round(1 - dist, 4)
            output.append({
                "text": doc,
                "source": meta.get("source", ""),
                "filename": meta.get("filename", ""),
                "page": meta.get("page", 0),
                "chunk_index": meta.get("chunk_index", 0),
                "score": similarity,
            })

        # If the best match doesn't clear the threshold, the query is out-of-domain
        if relevance_threshold > 0 and output:
            if output[0]["score"] < relevance_threshold:
                return []

        return output

    def _keyword_search(
        self,
        query: str,
        top_k: int,
        source_filter: Optional[str],
    ) -> list[dict]:
        """
        Pure BM25 keyword search.

        If source_filter is set, we filter results after BM25 scoring.
        (BM25 doesn't support metadata filters natively — that's a Weaviate advantage.)
        """
        results = self.bm25_index.search(query, top_k=top_k * 2)  # over-fetch for filtering

        if source_filter:
            results = [r for r in results if r.get("source") == source_filter]

        # Normalize BM25 score to 0-1 range for consistency with semantic scores
        if results:
            max_score = max(r["bm25_score"] for r in results)
            for r in results:
                r["score"] = round(r["bm25_score"] / max_score, 4) if max_score > 0 else 0

        return results[:top_k]

    def _hybrid_search(
        self,
        query: str,
        top_k: int,
        source_filter: Optional[str],
        relevance_threshold: float = 0.0,
    ) -> list[dict]:
        """
        Hybrid search: semantic + BM25 combined via Reciprocal Rank Fusion.

        We retrieve more candidates from each system (top_k * 2) and let
        RRF re-rank them. The final top_k are returned.

        Why over-fetch? If you only get top_k from each system, you might miss
        a relevant document that ranked 6th in both (but would be 1st combined).
        Getting 2×top_k from each gives more candidates for RRF to work with.
        """
        # First, check relevance via raw semantic similarity.
        # Cosine similarity is the most reliable out-of-domain signal — BM25 can
        # return spurious matches for common words (e.g. "US", "conflict") even in
        # completely unrelated documents, so we must gate on semantic score first.
        semantic = self._semantic_search(query, top_k=top_k * 2, source_filter=source_filter)
        if relevance_threshold > 0:
            if not semantic or semantic[0]["score"] < relevance_threshold:
                return []

        keyword = self._keyword_search(query, top_k=top_k * 2, source_filter=source_filter)

        if not semantic and not keyword:
            return []

        # Fuse with RRF
        fused = reciprocal_rank_fusion(semantic, keyword)

        # Add rrf_score as the main score for display
        for r in fused:
            r["score"] = r.get("rrf_score", 0)

        return fused[:top_k]

    def format_context(self, results: list[dict]) -> str:
        """
        Format retrieved chunks into an LLM-ready context string.

        The format matters for citation quality:
          - Number each source so the LLM can reference them
          - Include paper name and page for traceable citations
          - Separate chunks clearly so the LLM doesn't mix up sources

        This is injected directly into the prompt in generation.py.
        """
        if not results:
            return "No relevant documents found in the knowledge base."

        parts = []
        for i, r in enumerate(results, 1):
            parts.append(
                f"[Source {i} | {r['source']} | Page {r['page']}]\n{r['text']}"
            )

        return "\n\n" + "─" * 40 + "\n\n".join(parts)
