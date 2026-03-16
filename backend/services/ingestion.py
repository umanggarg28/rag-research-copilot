"""
ingestion.py — Full PDF → chunks → embeddings → ChromaDB pipeline.

This is the MODULE 2 component: Information Retrieval setup.
Before you can answer any questions, you must build your index.

The pipeline has 4 stages:
  PDF → Extract text → Chunk text → Embed chunks → Store in ChromaDB

Think of ChromaDB as your vector database:
  - Like a regular database, but rows are stored as mathematical vectors
  - Instead of SQL WHERE clauses, you search by semantic similarity
  - Weaviate (used in the course) works exactly the same way — ChromaDB is
    just a simpler local alternative (no Docker, no config)

Data stored per chunk in ChromaDB:
  - The text itself (document)
  - The embedding vector (embedding) ← used for similarity search
  - Metadata: source, filename, page number, chunk index ← used for citations
"""

import hashlib
from pathlib import Path
from typing import Optional
import sys

import chromadb
from pypdf import PdfReader

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import settings

# Import our from-scratch components (no LangChain)
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from ingestion.chunker import RecursiveChunker
from retrieval.embedder import Embedder
from retrieval.bm25_search import BM25Index


class IngestionService:
    """
    Manages the full pipeline from raw PDF to searchable vector index.

    Why a class (not just functions)?
    The embedder (~80MB) and ChromaDB client should be loaded ONCE and reused.
    A class holds them as instance attributes, avoiding expensive reloads on
    each API call.
    """

    def __init__(self):
        print(f"Initializing IngestionService...")

        # Our from-scratch chunker — no LangChain dependency
        self.chunker = RecursiveChunker(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

        # Embedding model — loaded once, reused for every document
        self.embedder = Embedder(settings.embedding_model)

        # ChromaDB persistent client — data survives restarts
        # PersistentClient saves to disk at chroma_persist_dir
        # Equivalent to Weaviate's persistent storage mode
        self.chroma = chromadb.PersistentClient(path=settings.chroma_persist_dir)

        # A "collection" = a namespace for related vectors (like a DB table)
        # We use one collection for all papers — metadata filtering lets us
        # search within specific papers
        self.collection = self.chroma.get_or_create_collection(
            name="research_papers",
            metadata={"hnsw:space": "cosine"},  # use cosine distance for text
        )

        # BM25 index — maintained in memory, rebuilt from ChromaDB on startup
        self.bm25_index = BM25Index()
        self._rebuild_bm25_index()

    def _rebuild_bm25_index(self):
        """
        Load all stored chunks from ChromaDB into the BM25 in-memory index.

        Why rebuild? BM25 is purely in-memory (no persistence needed — it's fast
        to rebuild from the stored text). This is called on startup to sync
        the BM25 index with whatever is stored in ChromaDB.
        """
        results = self.collection.get(include=["documents", "metadatas"])
        if results["documents"]:
            chunks = [
                {"text": doc, **meta}
                for doc, meta in zip(results["documents"], results["metadatas"])
            ]
            self.bm25_index.add_documents(chunks)
            print(f"BM25 index rebuilt with {len(chunks)} chunks")

    def ingest_pdf(self, pdf_path: str, source_name: Optional[str] = None) -> dict:
        """
        The main ingestion pipeline: PDF file → searchable index.

        Args:
            pdf_path: Absolute or relative path to the PDF
            source_name: Human-readable name (e.g. "attention_2017").
                         Defaults to filename stem.

        Returns:
            Stats dict: {source, filename, pages, chunks}

        Stages:
            1. PdfReader extracts text page by page
            2. RecursiveChunker splits into overlapping chunks
            3. Embedder converts each chunk to a 384-dim vector
            4. ChromaDB stores text + vector + metadata
            5. BM25 index is updated with new chunks
        """
        path = Path(pdf_path)
        if not path.exists():
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        source_name = source_name or path.stem.replace(" ", "_")

        # ── Stage 1: Extract text ────────────────────────────────────────────
        print(f"\n[1/4] Extracting text from '{path.name}'...")
        pages = self._extract_pdf_text(path)
        non_empty_pages = [p for p in pages if p.strip()]

        if not non_empty_pages:
            raise ValueError(
                f"No text extracted from {path.name}. "
                "The PDF may be image-based (scanned). "
                "Try an OCR tool like tesseract first."
            )

        # We embed page numbers into the text so we can track them through chunks
        # [Page 3] markers survive the chunking process and let us attribute
        # each chunk back to a specific page (for citations)
        full_text = "\n\n".join(
            f"[Page {i+1}]\n{text}"
            for i, text in enumerate(pages)
            if text.strip()
        )
        print(f"          → Extracted {len(non_empty_pages)} pages, "
              f"{len(full_text):,} characters")

        # ── Stage 2: Chunk ───────────────────────────────────────────────────
        print(f"[2/4] Splitting into chunks...")
        chunks = self.chunker.split(full_text)
        print(f"          → {len(chunks)} chunks "
              f"(target size: {settings.chunk_size} chars, "
              f"overlap: {settings.chunk_overlap} chars)")

        # ── Stage 3: Embed ───────────────────────────────────────────────────
        print(f"[3/4] Computing embeddings for {len(chunks)} chunks...")
        # This is the slow step for large PDFs — 384-dim vectors for each chunk
        embeddings = self.embedder.embed_batch(chunks)
        print(f"          → {len(embeddings)} vectors, "
              f"{self.embedder.embedding_dim} dims each")

        # ── Stage 4: Store in ChromaDB ───────────────────────────────────────
        print(f"[4/4] Storing in ChromaDB...")
        new_chunks = self._store_in_chroma(chunks, embeddings, source_name, path.name)
        print(f"          → Stored {len(new_chunks)} chunks")

        # ── Update BM25 index ────────────────────────────────────────────────
        self.bm25_index.add_documents(new_chunks)

        return {
            "source": source_name,
            "filename": path.name,
            "pages": len(non_empty_pages),
            "chunks": len(chunks),
        }

    def _extract_pdf_text(self, path: Path) -> list[str]:
        """
        Extract text from each page using pypdf.

        pypdf is pure Python — no system dependencies. It handles most
        text-based PDFs. For scanned PDFs (images), you'd need OCR.
        """
        reader = PdfReader(str(path))
        return [page.extract_text() or "" for page in reader.pages]

    def _store_in_chroma(
        self,
        chunks: list[str],
        embeddings: list[list[float]],
        source_name: str,
        filename: str,
    ) -> list[dict]:
        """
        Upsert chunks and their vectors into ChromaDB with metadata.

        Metadata is what makes RAG trustworthy:
          - source: which paper this came from → for filtering + citations
          - page: which page → for "paper X, page 4" style citations
          - chunk_index: position in document → for context ordering

        We use upsert (not insert) so re-ingesting the same paper is safe.
        The ID is a hash of source + chunk index, so same paper = same IDs.
        """
        import re
        ids, metadatas, stored_chunks = [], [], []

        for i, chunk in enumerate(chunks):
            chunk_id = hashlib.md5(f"{source_name}::{i}".encode()).hexdigest()

            # Extract [Page N] marker if present in chunk
            match = re.search(r"\[Page (\d+)\]", chunk)
            page_num = int(match.group(1)) if match else 0

            ids.append(chunk_id)
            metadatas.append({
                "source": source_name,
                "filename": filename,
                "chunk_index": i,
                "page": page_num,
            })
            stored_chunks.append({
                "text": chunk,
                "source": source_name,
                "filename": filename,
                "chunk_index": i,
                "page": page_num,
            })

        self.collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )

        return stored_chunks

    def list_documents(self) -> list[dict]:
        """List all ingested documents and their chunk counts."""
        results = self.collection.get(include=["metadatas"])
        if not results["metadatas"]:
            return []

        sources: dict[str, dict] = {}
        for meta in results["metadatas"]:
            src = meta["source"]
            if src not in sources:
                sources[src] = {
                    "source": src,
                    "filename": meta["filename"],
                    "chunks": 0,
                }
            sources[src]["chunks"] += 1

        return list(sources.values())

    def delete_document(self, source_name: str) -> int:
        """Remove all chunks for a document. Returns number of chunks deleted."""
        results = self.collection.get(
            where={"source": source_name},
            include=["metadatas"],
        )
        if not results["ids"]:
            return 0
        self.collection.delete(ids=results["ids"])
        # Rebuild BM25 after deletion
        self._rebuild_bm25_index()
        return len(results["ids"])
