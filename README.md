# AI Research Copilot — RAG System

A production-grade Retrieval Augmented Generation (RAG) system for querying research papers.
Built from scratch with hybrid search, citation tracking, and a clean React UI.

---

## What is RAG?

LLMs hallucinate because they generate plausible text from patterns — they don't *know* facts.
RAG fixes this by grounding answers in your actual documents:

```
User Query
    ↓
[Retriever] — searches your document store (ChromaDB)
    ↓
Relevant Chunks (with page numbers)
    ↓
[LLM] — reasons only over the retrieved context
    ↓
Grounded Answer with Citations
```

---

## Architecture

```
rag-research-copilot/
├── backend/
│   ├── main.py           # FastAPI app — wires everything together
│   ├── config.py         # Centralized settings (reads from .env)
│   ├── routers/
│   │   ├── ingest.py     # POST /ingest/upload, GET /ingest/list
│   │   └── query.py      # POST /query, POST /search
│   ├── services/
│   │   ├── ingestion.py  # PDF → chunks → embeddings → ChromaDB
│   │   ├── retrieval.py  # Semantic + keyword + hybrid search
│   │   └── generation.py # LLM answer generation (Claude)
│   └── models/
│       └── schemas.py    # Pydantic request/response contracts
├── ingestion/
│   └── chunker.py        # RecursiveChunker (built from scratch, no LangChain)
├── retrieval/
│   ├── embedder.py       # sentence-transformers wrapper
│   └── bm25_search.py    # BM25 keyword search + RRF hybrid fusion
├── evaluation/           # RAG quality metrics (TODO)
├── ui/                   # React frontend (TODO)
├── data/
│   ├── papers/           # Drop PDFs here
│   └── chroma/           # ChromaDB vector store (auto-created)
├── demo_concepts.py      # Interactive demos for every RAG concept
└── requirements.txt
```

---

## Technology Stack

| Component | Choice | Why |
|---|---|---|
| LLM | Claude (Anthropic) | Best instruction-following, large context |
| Embeddings | `all-MiniLM-L6-v2` | Free, local, 384-dim, strong quality |
| Vector DB | ChromaDB | Local persistent store, no Docker needed |
| Keyword search | BM25 (rank-bm25) | Battle-tested probabilistic ranking function |
| Hybrid fusion | RRF (from scratch) | Rank-based, handles different score scales |
| API | FastAPI | Async, auto-docs at `/docs` |

---

## Key Concepts (with demos)

Run `python demo_concepts.py` to see all concepts in action interactively.

### 1. Chunking
PDFs are split into overlapping chunks (~800 chars, 150 char overlap).
- **Why chunk?** Precise retrieval — find the exact section, not a 20-page paper
- **Why overlap?** Prevents losing meaning that straddles chunk boundaries
- **Algorithm:** RecursiveCharacterTextSplitter — tries paragraph → sentence → word splits

### 2. Embeddings
Each chunk → 384-dimensional vector via `all-MiniLM-L6-v2`:
- Semantically similar text → numerically similar vectors
- Cosine similarity measures directional closeness
- "attention mechanism" and "self-attention" score ~0.76 similarity

### 3. BM25 Keyword Search
- Best for: exact numbers, acronyms, author names, dataset names
- Algorithm: TF-IDF with saturation + length normalization
- "What BLEU score on WMT 2014?" → finds "28.4 BLEU on WMT 2014" exactly

### 4. Hybrid Search (RRF)
- Combines semantic + BM25 using Reciprocal Rank Fusion
- RRF formula: `score = 1/(60 + rank_semantic) + 1/(60 + rank_bm25)`
- Rank-based (not score-based) → handles scale mismatch between systems

### 5. Augmented Generation
- Retrieved chunks injected into Claude's context
- System prompt: "Answer ONLY from the provided context"
- Response includes citations: `(Source: paper, Page 4)`

---

## Setup

```bash
# Use existing venv
source /path/to/.venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add: ANTHROPIC_API_KEY=sk-ant-...

# Run the API server
cd rag-research-copilot
uvicorn backend.main:app --reload

# Visit interactive docs
open http://localhost:8000/docs
```

---

## Usage

### Ingest a paper
```bash
curl -X POST http://localhost:8000/ingest/upload \
  -F "file=@paper.pdf" \
  -F "source_name=attention_2017"
```

### Search (no LLM, just retrieval)
```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "multi-head attention", "top_k": 5, "mode": "hybrid"}'
```
`mode` options: `"semantic"`, `"keyword"`, `"hybrid"` (default)

### Ask a question (full RAG)
```bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "How does multi-head attention work?", "top_k": 5}'
```

Response includes:
- `answer` — LLM-generated, grounded in retrieved context
- `citations` — which papers + pages the answer came from
- `retrieved_chunks` — raw chunks for transparency
- `tokens_used` — for cost tracking

---

## Build Status

- [x] Architecture, project skeleton, core concepts
- [x] Ingestion pipeline (PDF → chunks → embeddings → ChromaDB)
- [x] Retriever API (semantic, keyword, hybrid search)
- [x] LLM integration (augmented generation with citations)
- [x] React UI (upload, chat, citations, search mode controls)
- [ ] Production features (evaluation, monitoring, reranking)

---

## Running the Concept Demos

```bash
python demo_concepts.py
# Choose: 1 (chunking), 2 (embeddings), 3 (BM25), 4 (hybrid), or "all"
```

These show intermediate outputs at every stage — great for understanding
what the pipeline actually does before and after each transformation.
