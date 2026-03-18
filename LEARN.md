# Understanding RAG — A Complete Guide to What We Built

This document explains every concept and every file in the project, from first principles.
Read it alongside the code. Run `python demo_concepts.py` to see the outputs live.

---

# Table of Contents

1. [Why RAG Exists — The Problem](#1-why-rag-exists)
2. [The Big Picture — Full System Architecture](#2-the-big-picture)
3. [Stage 1 — Chunking](#3-stage-1-chunking)
4. [Stage 2 — Embeddings](#4-stage-2-embeddings)
5. [Stage 3 — Vector Database (ChromaDB)](#5-stage-3-vector-database)
6. [Stage 4 — Search at Query Time](#6-stage-4-search-at-query-time)
   - 6a. Semantic Search
   - 6b. BM25 Keyword Search
   - 6c. Hybrid Search with RRF
7. [Stage 5 — LLM Generation](#7-stage-5-llm-generation)
8. [The API Layer — FastAPI](#8-the-api-layer)
9. [How Every File Fits Together](#9-how-every-file-fits-together)
10. [End-to-End Walkthrough](#10-end-to-end-walkthrough)
11. [The Frontend — React UI](#11-the-frontend)
    - 11a. Streaming with Server-Sent Events
    - 11b. Component Architecture
    - 11c. Session Persistence
    - 11d. Relevance Filtering
    - 11e. Conditional LLM Parameters

---

# 1. Why RAG Exists

## The Problem with LLMs Alone

Imagine you have a brilliant friend who has read every book published before 2024.
You ask them: *"What did the 2025 Nature paper on protein folding conclude?"*

They have two options:
- Say "I don't know" — honest but useless
- Make something up — confident but dangerous

This is what LLMs do. They are trained on a static snapshot of the internet.
After training, they have **no access to new information**. When you ask about
something outside their training data, they don't fail gracefully — they hallucinate
a plausible-sounding answer.

```
┌─────────────────────────────────────────────────────┐
│                    THE PROBLEM                      │
│                                                     │
│   User: "What does paper X conclude?"               │
│                                                     │
│   LLM: "Paper X concludes that..." ← HALLUCINATED  │
│         (it has no idea — it's guessing)            │
└─────────────────────────────────────────────────────┘
```

## Why LLMs Hallucinate

An LLM is a **next-token predictor**. Given "The Eiffel Tower is located in",
it predicts the most likely next token: "Paris". It doesn't "know" Paris —
it learned that this sequence of tokens appears together frequently in training data.

When you ask about something rare or absent from training data, it still predicts
the most likely continuation — it just has no reliable pattern to draw from.
The result looks like a real answer but is statistically confabulated.

## The RAG Solution

RAG = **Retrieval Augmented Generation**

Instead of relying on the LLM's memory, we:
1. Store your documents in a searchable database
2. When a question arrives, **retrieve** the relevant passages
3. Give those passages to the LLM as **context** in the prompt
4. The LLM's job is now **reasoning over provided text**, not recall

```
┌─────────────────────────────────────────────────────┐
│                   THE SOLUTION                      │
│                                                     │
│   User: "What does paper X conclude?"               │
│              │                                      │
│              ▼                                      │
│   [Retrieve relevant passages from paper X]         │
│              │                                      │
│              ▼                                      │
│   LLM: "Based on the provided text,                 │
│          paper X concludes that..."  ← GROUNDED     │
│         (it's summarizing real text you gave it)    │
└─────────────────────────────────────────────────────┘
```

The LLM becomes a **reasoning engine** over your documents,
not a free-form hallucinator.

---

# 2. The Big Picture

## Full System Architecture

```
╔══════════════════════════════════════════════════════════════════╗
║                        INGESTION TIME                           ║
║              (runs once when you upload a PDF)                  ║
║                                                                  ║
║  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  ║
║  │  PDF     │───▶│ Extract  │───▶│  Chunk   │───▶│  Embed   │  ║
║  │  File    │    │  Text    │    │  Text    │    │  Chunks  │  ║
║  └──────────┘    └──────────┘    └──────────┘    └──────────┘  ║
║                                       │                │        ║
║                                       │                ▼        ║
║                                       │          ┌──────────┐  ║
║                                       │          │ChromaDB  │  ║
║                                       │          │(vectors) │  ║
║                                       ▼          └──────────┘  ║
║                                  ┌──────────┐                  ║
║                                  │ BM25     │                  ║
║                                  │ Index    │                  ║
║                                  │(in-mem)  │                  ║
║                                  └──────────┘                  ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║                         QUERY TIME                              ║
║              (runs every time a user asks a question)           ║
║                                                                  ║
║  User Question                                                   ║
║       │                                                          ║
║       ├────────────────────────────────────┐                    ║
║       ▼                                    ▼                    ║
║  ┌──────────┐                        ┌──────────┐              ║
║  │  Embed   │                        │Tokenize  │              ║
║  │  Query   │                        │  Query   │              ║
║  └──────────┘                        └──────────┘              ║
║       │                                    │                    ║
║       ▼                                    ▼                    ║
║  ┌──────────┐                        ┌──────────┐              ║
║  │ Cosine   │                        │  BM25    │              ║
║  │Similarity│                        │  Score   │              ║
║  │in Chroma │                        │  Index   │              ║
║  └──────────┘                        └──────────┘              ║
║       │                                    │                    ║
║       │         SEMANTIC     KEYWORD       │                    ║
║       │         RESULTS      RESULTS       │                    ║
║       └──────────────┬───────────┘         │                   ║
║                      ▼                                          ║
║               ┌──────────────┐                                  ║
║               │  RRF Fusion  │  ← Hybrid Search                 ║
║               │  (re-rank)   │                                  ║
║               └──────────────┘                                  ║
║                      │                                          ║
║                      ▼                                          ║
║               Top-K Chunks                                      ║
║               (most relevant)                                   ║
║                      │                                          ║
║                      ▼                                          ║
║         ┌────────────────────────────┐                          ║
║         │  PROMPT TO LLM             │                          ║
║         │  ─────────────             │                          ║
║         │  Context:                  │                          ║
║         │  [Chunk 1 — paper, page 3] │                          ║
║         │  [Chunk 2 — paper, page 7] │                          ║
║         │  ...                       │                          ║
║         │  Question: {user question} │                          ║
║         │  Answer ONLY from context. │                          ║
║         └────────────────────────────┘                          ║
║                      │                                          ║
║                      ▼                                          ║
║         ┌────────────────────────────┐                          ║
║         │  LLM RESPONSE              │                          ║
║         │  ─────────────             │                          ║
║         │  Answer: ...               │                          ║
║         │  Sources: paper, page 3    │                          ║
║         └────────────────────────────┘                          ║
╚══════════════════════════════════════════════════════════════════╝
```

## The Two Phases

Every RAG system has exactly two phases:

| Phase | When it runs | What it does | Files |
|---|---|---|---|
| **Ingestion** | Once, when you add documents | PDF → chunks → vectors → store | `ingestion.py`, `chunker.py`, `embedder.py` |
| **Query** | Every user question | embed query → search → generate | `retrieval.py`, `generation.py` |

Think of ingestion as building a library index.
Think of querying as looking up that index to answer a question.

---

# 3. Stage 1: Chunking

**File:** `ingestion/chunker.py`

## Why We Can't Use Whole Documents

A research paper is typically 15-30 pages, which is ~10,000–20,000 tokens.

**Problem 1 — Context window limits:**
Even large LLMs can't process unlimited text. But more importantly, stuffing 20,000
tokens of a whole paper as context creates noise. The LLM has to find the relevant
sentence buried in 20,000 tokens of irrelevant text.

**Problem 2 — Retrieval precision:**
If you store whole papers as single units, searching for "what BLEU score was achieved"
returns the entire 20-page paper. You want to return the *specific paragraph* that
mentions BLEU scores.

**The solution: split papers into small, overlapping chunks.**

## Chunk Size Tradeoffs

```
CHUNK SIZE SPECTRUM

Small chunks (200 chars):
┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐
│  │ │  │ │  │ │  │ │  │ │  │ │  │ │  │ │  │ │  │
└──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘
✅ Precise retrieval       ❌ Missing context
✅ Less noise for LLM      ❌ Many chunks = more storage

Large chunks (1200 chars):
┌────────────┐       ┌────────────┐       ┌────────────┐
│            │       │            │       │            │
└────────────┘       └────────────┘       └────────────┘
✅ Rich context per chunk  ❌ Less precise retrieval
✅ Fewer chunks            ❌ More noise in LLM prompt

Our choice (800 chars): balanced for research papers.
```

## The Overlap Problem

Without overlap, meaning gets lost at chunk boundaries:

```
WITHOUT OVERLAP:
┌─────────────────────────────────────┐
│ ...the attention mechanism computes │  Chunk 1
│ a weighted sum of values. The model │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ This allows the model to focus on   │  Chunk 2
│ relevant tokens while ignoring...   │  ← What does "This" refer to?
└─────────────────────────────────────┘

WITH OVERLAP (150 chars):
┌──────────────────────────────────────────────┐
│ ...the attention mechanism computes          │  Chunk 1
│ a weighted sum of values. The model          │
└──────────────────────────────────────────────┘
             ←── 150 chars overlap ──→
         ┌──────────────────────────────────────────────┐
         │ a weighted sum of values. This allows        │  Chunk 2
         │ the model to focus on relevant tokens...     │
         └──────────────────────────────────────────────┘
```

## The Recursive Strategy

Our `RecursiveChunker` tries to split on natural text boundaries, from largest to smallest:

```
SEPARATOR HIERARCHY:

  \n\n  (paragraph break) ← try this first
   │
   │  if piece still too big:
   ▼
  \n   (line break)
   │
   │  if still too big:
   ▼
  ". " (sentence end)
   │
   │  if still too big:
   ▼
  " "  (word boundary)
   │
   │  last resort:
   ▼
  ""   (character level)
```

This is smart because it tries to keep semantic units (paragraphs, sentences)
together. A naive split every N characters would cut mid-sentence.

## Code Walkthrough: `chunker.py`

```python
class RecursiveChunker:
    def split(self, text: str) -> list[str]:
        # Step 1: Split into small pieces using separator hierarchy
        pieces = self._recursive_split(text, self.separators)
        # Step 2: Merge small pieces back up to chunk_size, with overlap
        chunks = self._merge_pieces(pieces)
        return chunks
```

**`_recursive_split`** — the "divide" phase:
```
Input: "Para 1\n\nPara 2 that is very long...\n\nPara 3"
           │
           ├─ split on \n\n
           │
           ▼
["Para 1", "Para 2 that is very long...", "Para 3"]
                    │
                    ├─ too long! split on \n
                    │
                    ▼
              ["Para 2 that", "is very long..."]
```

**`_merge_pieces`** — the "recombine with overlap" phase:
```
pieces = ["word1", "word2", "word3", "word4", "word5", "word6"]
chunk_size = 20 chars, overlap = 5 chars

Buffer fills:   ["word1", "word2", "word3"]  → 18 chars, fits
Add "word4":    would be 24 chars → SAVE CHUNK

Chunk 1: "word1 word2 word3"
Overlap:  keep last 5 chars worth → "word3"
Buffer:   ["word3", "word4"]     ← starts with overlap
Buffer:   ["word3", "word4", "word5"] → save chunk

Chunk 2: "word3 word4 word5"    ← notice "word3" repeats (overlap!)
```

---

# 4. Stage 2: Embeddings

**File:** `retrieval/embedder.py`

## What Is an Embedding?

An embedding converts text into a list of numbers — a **vector** — that captures its meaning.

```
"The Transformer uses attention"  →  [-0.031, 0.025, -0.007, 0.044, ...]
                                      └──────────── 384 numbers ─────────────┘

"Self-attention is key to Transformers"  →  [-0.029, 0.023, -0.005, 0.043, ...]
                                            (very similar numbers!)

"I enjoy eating pizza"  →  [0.182, -0.391, 0.234, -0.119, ...]
                            (completely different numbers)
```

The magic: **semantically similar text → numerically similar vectors**.

## How Does the Model Learn This?

We use `all-MiniLM-L6-v2`, a BERT-style transformer fine-tuned on **1 billion sentence pairs**.
Each pair was labeled: "these two sentences are paraphrases" or "these are not related".

The model learned to map paraphrases close together in 384-dimensional space,
and unrelated sentences far apart.

```
                384-DIMENSIONAL VECTOR SPACE
                (visualized in 2D for clarity)

                    "attention"
                        ●  ← "multi-head attention paper"
                       ●●  ← "self-attention mechanism"
                      ●    ← "transformer architecture"

         Distance between these: SMALL (similar meaning)




   "pizza"
     ●   ← "I enjoy pizza on Fridays"
     ●   ← "My favorite food is pizza"

   Distance between attention cluster and pizza cluster: LARGE
```

## Cosine Similarity — The Distance Metric

We use **cosine similarity** to measure how similar two vectors are:

```
Formula:  cos(θ) = (A · B) / (|A| × |B|)

Where:
  A · B   = dot product (sum of element-wise multiplications)
  |A|, |B| = magnitudes (lengths) of the vectors

Result ranges:
  cos(θ) = 1.0  → vectors point in same direction → identical meaning
  cos(θ) = 0.0  → vectors are perpendicular → unrelated
  cos(θ) = -1.0 → vectors point in opposite directions → opposite meaning
```

**Why cosine instead of straight-line (Euclidean) distance?**

Cosine measures **direction** only, ignoring **magnitude** (length).
A long document about "attention" and a short sentence about "attention" both point
in the same direction, even though the long document's vector has larger magnitude.
We want to compare meaning, not document length.

```
EUCLIDEAN DISTANCE:           COSINE SIMILARITY:

 B (long doc)                  B
  ●──────────────              ↑
  │           \                │
  │    big     \               │ small angle = similar meaning!
  │  distance   \              │
  └──────────────● A          ─┼──────────────────────→ A
                   (short doc)  └
```

## What Happens When You Call `embed_text`?

```python
query = "How does multi-head attention work?"
vector = embedder.embed_text(query)

# 1. Tokenize: "How does multi-head attention work?" → [1045, 2515, 4800, ...]
# 2. Run through 6-layer transformer → 384-dim output
# 3. Normalize to unit length (|vector| = 1.0)
# 4. Return as Python list of 384 floats

print(vector[:5])  # [-0.031, 0.025, -0.007, 0.044, 0.008]
print(len(vector)) # 384
```

**Normalization to unit length** means `|vector| = 1.0`.
This simplifies cosine similarity: when both vectors have length 1,
cos(θ) = A · B (just a dot product — very fast).

---

# 5. Stage 3: Vector Database

**File:** `backend/services/ingestion.py` (storage part)

## What Is a Vector Database?

A regular SQL database stores rows and columns. You query it with `WHERE` clauses.

A vector database stores **vectors** (embeddings). You query it with
"find me the N vectors most similar to this query vector."

```
REGULAR DATABASE:
┌────────────────────────────────────────────────────┐
│ id │ text              │ source    │ page          │
├────┼───────────────────┼───────────┼───────────────┤
│  1 │ "attention is..." │ paper_a   │   3           │
│  2 │ "the model..."    │ paper_a   │   4           │
│  3 │ "BERT uses..."    │ paper_b   │   1           │
└────────────────────────────────────────────────────┘
Query: SELECT * WHERE text LIKE '%attention%'
       (exact keyword match only)

VECTOR DATABASE (ChromaDB):
┌────────────────────────────────────────────────────────────────┐
│ id │ vector (384 dims)          │ document       │ metadata    │
├────┼────────────────────────────┼────────────────┼─────────────┤
│  1 │ [-0.03, 0.02, 0.04, ...]   │ "attention..." │ source:a p:3│
│  2 │ [-0.01, 0.03, 0.02, ...]   │ "the model..." │ source:a p:4│
│  3 │ [ 0.12,-0.08, 0.11, ...]   │ "BERT uses..." │ source:b p:1│
└────────────────────────────────────────────────────────────────┘
Query: find 5 rows whose vectors are closest to query_vector
       (semantic similarity — no exact keyword match needed)
```

## ChromaDB Internals

ChromaDB uses **HNSW** (Hierarchical Navigable Small World) to search efficiently:

```
BRUTE FORCE SEARCH (naive):
  Compare query to EVERY stored vector.
  For 100,000 chunks: 100,000 cosine similarity computations.
  Too slow for real-time queries.

HNSW (what ChromaDB uses):
  Organizes vectors into a hierarchical graph.
  Search starts at the top layer (sparse, fast navigation).
  Drills down to denser layers as it gets closer to the query.

  Layer 2 (sparse):   ●───────────────●
                       \             /
  Layer 1 (medium):    ●───●───────●───●
                           |       |
  Layer 0 (dense):     ●───●─●─●───●───●─●

  Result: finds approximate nearest neighbors in O(log n) time
  vs O(n) for brute force. For 100,000 chunks: ~17 comparisons vs 100,000.
  It's approximate (not guaranteed to find the absolute closest) but
  in practice finds the correct result >99% of the time.
```

## What Gets Stored in ChromaDB

When we call `collection.upsert(...)`, each chunk is stored as:

```
{
  "id": "a3f91bc2d..."          ← MD5 hash of "source::chunk_index"
                                   (stable: re-ingesting same PDF = same IDs)

  "embedding": [-0.031, 0.025, ...]  ← 384-dim vector from embedder
                                        (used for similarity search)

  "document": "The Transformer uses..."  ← original text
                                           (returned with results)

  "metadata": {
    "source": "attention_2017",   ← which paper (for filtering + citations)
    "filename": "paper.pdf",      ← original filename
    "page": 4,                    ← page number (for citations)
    "chunk_index": 12             ← position in document (for ordering)
  }
}
```

**Why stable IDs?** If you upload the same PDF twice, the IDs are the same,
so ChromaDB does an **upsert** (update if exists) — no duplicates.

---

# 6. Stage 4: Search at Query Time

**File:** `backend/services/retrieval.py`, `retrieval/bm25_search.py`

## Why Three Search Modes?

No single search method is best for all queries. The three modes target different query types:

```
QUERY TYPE                    BEST MODE       WHY
─────────────────────────────────────────────────────────────────
"How does attention work?"    SEMANTIC        Conceptual question —
                                              no exact keywords to match

"What BLEU score on WMT 2014" KEYWORD (BM25)  Specific number + dataset name —
                                              exact token match beats semantic

"Who wrote this paper?"       KEYWORD (BM25)  Author names are proper nouns —
                                              semantic won't help

"Explain the loss function"   SEMANTIC        Paraphrased — might appear as
                                              "training objective" in paper

"Learning rate 0.0001"        KEYWORD (BM25)  Numbers are exact, not semantic

MOST QUERIES                  HYBRID          Get benefits of both
```

## 6a. Semantic Search

```
SEMANTIC SEARCH FLOW:

User query: "How does attention compute outputs?"
                │
                ▼
         ┌────────────┐
         │   Embed    │  →  query_vector = [-0.031, 0.025, ...]
         │   query    │     (same model as ingestion — CRITICAL)
         └────────────┘
                │
                ▼
         ┌────────────┐
         │  Cosine    │  Compare query_vector to every stored vector.
         │ similarity │  ChromaDB returns top-K closest (HNSW search).
         │ in ChromaDB│
         └────────────┘
                │
                ▼
  ┌─────────────────────────────────────────────┐
  │  Results (sorted by cosine similarity):      │
  │                                             │
  │  1. score=0.82  "attention computes..."      │
  │  2. score=0.79  "the output is a weighted..." │
  │  3. score=0.74  "multi-head attention..."    │
  └─────────────────────────────────────────────┘
```

The critical constraint: **the query must be embedded with the exact same model used at ingestion**.
If you embed queries with model A but stored chunks with model B, the vectors are in
incompatible spaces — like measuring distance in miles vs kilometers — results are garbage.

## 6b. BM25 Keyword Search

BM25 (Best Match 25) is the gold standard keyword search algorithm.
It improves on basic word counting in two ways:

**Improvement 1 — Term Frequency Saturation:**
```
NAIVE TERM COUNT:
  Doc A: contains "attention" 1 time → score 1
  Doc B: contains "attention" 10 times → score 10
  Doc C: contains "attention" 100 times → score 100

  Is Doc C really 100x more relevant? No!
  The 1st mention is very informative. The 100th barely adds value.

BM25 SATURATION:
  Doc A: score ≈ 1.0
  Doc B: score ≈ 2.1  (not 10 — diminishing returns)
  Doc C: score ≈ 2.4  (not 100 — almost same as Doc B)

  Formula: TF_bm25 = tf × (k1 + 1) / (tf + k1 × (1 - b + b × len/avglen))
  k1=1.5 controls how fast the curve flattens.
```

**Improvement 2 — Document Length Normalization:**
```
"attention" in a 2-page abstract: highly relevant
"attention" in a 50-page survey: might just be passing mention

BM25 normalizes by document length:
  b=0.75: 75% length normalization
  b=0.0: no normalization (every document treated as same length)
  b=1.0: full normalization
```

**IDF — Rewarding Rare Terms:**
```
"the" appears in every chunk → IDF ≈ 0 → ignored
"BLEU" appears in 5/100 chunks → IDF = log(100/5) = 3.0 → important signal
"transformer" appears in 30/100 chunks → IDF = log(100/30) = 1.2 → moderate

IDF = log( (N - df + 0.5) / (df + 0.5) )
  N = total documents
  df = documents containing the term
```

```
BM25 FLOW:

User query: "What BLEU score on WMT 2014?"
                │
                ▼
         ┌────────────┐
         │ Tokenize   │  →  ["what", "bleu", "score", "on", "wmt", "2014"]
         └────────────┘
                │
                ▼
         ┌────────────┐
         │ BM25 score │  For each stored chunk:
         │ each chunk │  score = Σ IDF(term) × TF_bm25(term, chunk)
         └────────────┘    for each query term
                │
                ▼
  ┌─────────────────────────────────────────────┐
  │  Results (sorted by BM25 score):            │
  │                                             │
  │  1. score=2.29  "28.4 BLEU on WMT 2014..."  │  ← exact match!
  │  2. score=0.32  "...trained on WMT data..."  │
  │  3. score=0.0   (no matching tokens)         │
  └─────────────────────────────────────────────┘
```

## 6c. Hybrid Search — Reciprocal Rank Fusion (RRF)

The problem with combining semantic and BM25 scores directly:

```
NAIVE SCORE COMBINATION (BAD):

  Semantic score for chunk A: 0.82  (cosine similarity, range 0-1)
  BM25 score for chunk A: 12.4  (BM25, range 0-∞)

  Adding them: 0.82 + 12.4 = 13.22  ← BM25 dominates!
  The scales are incompatible.
```

RRF solves this by using **rank position** instead of raw scores:

```
RECIPROCAL RANK FUSION:

  Formula: RRF_score(doc) = 1/(k + rank_semantic) + 1/(k + rank_bm25)
  k = 60 (smoothing constant from the original 2009 paper)

Example:
  "28.4 BLEU chunk":
    Semantic rank: 1  →  1/(60+1) = 0.01639
    BM25 rank: 1      →  1/(60+1) = 0.01639
    RRF score:  0.03278  ← appears at top of both → very high combined

  "attention mechanism chunk":
    Semantic rank: 2  →  1/(60+2) = 0.01613
    BM25 rank: 8      →  1/(60+8) = 0.01471
    RRF score:  0.03084

WHY k=60?
  Without k: rank 1 = 1/1 = 1.0, rank 2 = 1/2 = 0.5 (huge gap)
  With k=60: rank 1 = 1/61 = 0.0164, rank 2 = 1/62 = 0.0161 (small gap)
  This makes the combination more balanced — a rank 2 in both systems
  can beat a rank 1 in only one system.
```

```
HYBRID SEARCH VISUAL:

Semantic results:          BM25 results:
rank 1: chunk A            rank 1: chunk C
rank 2: chunk B            rank 2: chunk A
rank 3: chunk D            rank 3: chunk B
rank 4: chunk C            (chunk D not found)
rank 5: chunk E

RRF scores:
  chunk A: 1/(60+1) + 1/(60+2) = 0.0164 + 0.0161 = 0.0325  ← appears in both!
  chunk B: 1/(60+2) + 1/(60+3) = 0.0161 + 0.0159 = 0.0320
  chunk C: 1/(60+4) + 1/(60+1) = 0.0156 + 0.0164 = 0.0320
  chunk D: 1/(60+3) + 0        = 0.0159
  chunk E: 1/(60+5) + 0        = 0.0154

Final hybrid ranking:
  rank 1: chunk A  (strong in BOTH systems)
  rank 2: chunk B
  rank 3: chunk C
  rank 4: chunk D
  rank 5: chunk E
```

---

# 7. Stage 5: LLM Generation

**File:** `backend/services/generation.py`

## The Augmented Prompt Pattern

The core idea is simple: give the LLM the answer and tell it to rephrase it.
Of course we're simplifying — the LLM also synthesizes, resolves conflicts,
and formats — but fundamentally it's reasoning over provided text.

```
┌──────────────────────────────────────────────────────────────────┐
│                        PROMPT STRUCTURE                         │
│                                                                  │
│  SYSTEM:                                                         │
│  "You are a research assistant. Answer ONLY from the            │
│   provided context. If the context doesn't contain the          │
│   answer, say so. Cite sources as (Source: paper, Page N)."     │
│                                                                  │
│  USER:                                                           │
│  "Context from research papers:                                  │
│                                                                  │
│   [Source 1 | attention_2017 | Page 4]                          │
│   The Transformer model uses multi-head attention with          │
│   h=8 heads. Each head operates with dk=dv=64 dimensions...     │
│                                                                  │
│   ────────────────────────────                                   │
│                                                                  │
│   [Source 2 | attention_2017 | Page 5]                          │
│   MultiHead(Q,K,V) = Concat(head1,...,headh) × W^O              │
│   where headi = Attention(Q×Wi^Q, K×Wi^K, V×Wi^V)...            │
│                                                                  │
│   Question: How does multi-head attention work?"                 │
│                                                                  │
│  CLAUDE:                                                         │
│  "Multi-head attention works by running h=8 parallel            │
│   attention computations (heads), each with reduced             │
│   dimension dk=64. The outputs are concatenated and             │
│   projected back. This allows the model to attend to            │
│   different representation subspaces simultaneously.            │
│   (Source: attention_2017, Page 4-5)"                           │
└──────────────────────────────────────────────────────────────────┘
```

## Why "Closed-Book" Prompting Prevents Hallucination

```
OPEN-BOOK (without RAG):
  "What is the BLEU score in the paper?"
  → LLM must recall from training data
  → If training data is incomplete/incorrect → hallucination

CLOSED-BOOK (with RAG context):
  "Given this context [actual paper excerpt], what is the BLEU score?"
  → LLM only needs to READ the provided text
  → If context contains "28.4 BLEU" → LLM extracts it correctly
  → If context DOESN'T contain the answer → LLM is instructed to say so

The system prompt's key instruction:
  "If the context does NOT contain enough information, say:
   'I don't have enough information in the provided papers.'"

This is the fallback that prevents hallucination when retrieval fails.
```

## Token Costs and Why We Track Them

```python
return {
    "tokens_used": {
        "input": response.usage.input_tokens,   # prompt tokens
        "output": response.usage.output_tokens,  # answer tokens
    }
}
```

LLM APIs charge by token. For Claude Haiku (~$0.25/1M input tokens):
- A typical query: ~2,000 input tokens (context + question) + ~300 output
- 1,000 queries/day = 2.3M tokens = ~$0.58/day

Tracking this lets you make cost vs quality tradeoffs:
- More context (higher top_k) = better answers, higher cost
- Longer chunks = more context per chunk, fewer API calls
- Haiku vs Sonnet = cost vs quality tradeoff

---

# 8. The API Layer

**Files:** `backend/main.py`, `backend/routers/ingest.py`, `backend/routers/query.py`

## FastAPI and Why We Use It

FastAPI is a modern Python web framework built on Pydantic + Starlette.

```
REQUEST LIFECYCLE:

HTTP Request
     │
     ▼
┌─────────────┐
│   FastAPI   │  1. Parses URL and HTTP method
│   Router    │  2. Finds matching endpoint function
└─────────────┘
     │
     ▼
┌─────────────┐
│  Pydantic   │  3. Validates request body against schema
│ Validation  │  4. Returns 422 error if types don't match
└─────────────┘
     │
     ▼
┌─────────────┐
│  Endpoint   │  5. Runs your Python function
│  Function   │
└─────────────┘
     │
     ▼
┌─────────────┐
│  Pydantic   │  6. Serializes return value to JSON
│  Response   │
└─────────────┘
     │
     ▼
HTTP Response (JSON)
```

## Our API Endpoints

```
GET  /              → health check, lists all endpoints
GET  /health        → for deployment health probes

POST /ingest/upload  → upload PDF file → runs ingestion pipeline
GET  /ingest/list    → list all ingested documents
DELETE /ingest/{src} → remove a document from the index

POST /search         → pure retrieval (no LLM)
                       body: {query, top_k, mode: "semantic"|"keyword"|"hybrid"}
                       → returns matching chunks with scores

POST /query          → full RAG: retrieval + LLM generation
                       body: {question, top_k, source_filter?}
                       → returns {answer, citations, retrieved_chunks, tokens_used}
```

## Why Separate `/search` and `/query`?

```
/search endpoint (retrieval only):
  ✅ No API cost (no LLM call)
  ✅ Fast (just vector search)
  ✅ Use for: debugging retrieval quality
              building "show similar sections" UI feature
              evaluating whether right content is indexed

/query endpoint (full RAG):
  ✅ Complete answer with citations
  ❌ LLM API cost
  ❌ Slower (LLM call adds ~1-3 seconds)
  ✅ Use for: the main chat interface

This separation is a key architectural principle:
  Evaluate RETRIEVAL and GENERATION independently.
  If the answer is wrong, was retrieval bad? Or was generation bad?
  /search lets you check retrieval in isolation.
```

## Dependency Injection Pattern

```python
# Instead of creating services on every request (expensive):
@router.post("/query")
def query(request: QueryRequest):
    service = IngestionService()  # ❌ loads 80MB model every request!
    ...

# We use FastAPI's Depends() for lazy singleton:
_service = None

def get_service():
    global _service
    if _service is None:
        _service = IngestionService()  # ✅ loads ONCE, reused for all requests
    return _service

@router.post("/query")
def query(request: QueryRequest, service = Depends(get_service)):
    ...
```

---

# 9. How Every File Fits Together

```
rag-research-copilot/
│
├── backend/
│   │
│   ├── main.py              ← FastAPI app + CORS + router registration
│   │                          Entry point: uvicorn backend.main:app
│   │
│   ├── config.py            ← Reads .env, provides Settings singleton
│   │                          settings.chunk_size, settings.top_k, etc.
│   │
│   ├── routers/
│   │   ├── ingest.py        ← HTTP layer for ingestion
│   │   │                      POST /ingest/upload → calls IngestionService
│   │   │                      GET  /ingest/list   → calls IngestionService
│   │   │
│   │   └── query.py         ← HTTP layer for search/query
│   │                          POST /search → calls RetrievalService
│   │                          POST /query  → calls RetrievalService + GenerationService
│   │
│   ├── services/
│   │   ├── ingestion.py     ← Business logic: PDF → chunks → vectors → ChromaDB
│   │   │                      Uses: RecursiveChunker, Embedder, ChromaDB
│   │   │
│   │   ├── retrieval.py     ← Business logic: query → search → top-K chunks
│   │   │                      Uses: Embedder, BM25Index, ChromaDB, RRF
│   │   │
│   │   └── generation.py   ← Business logic: context + question → answer
│   │                          Uses: Anthropic API (Claude)
│   │
│   └── models/
│       └── schemas.py       ← Pydantic schemas (request/response contracts)
│                              QueryRequest, QueryResponse, Citation, etc.
│
├── ingestion/
│   └── chunker.py           ← RecursiveChunker built from scratch
│                              No LangChain dependency
│
├── retrieval/
│   ├── embedder.py          ← Wraps sentence-transformers
│   │                          embed_text(), embed_batch(), cosine_similarity()
│   │
│   └── bm25_search.py       ← BM25Index + reciprocal_rank_fusion()
│                              Built from scratch using rank-bm25 library
│
└── demo_concepts.py         ← Interactive demos for every concept
                               Run: python demo_concepts.py
```

**Dependency graph (what calls what):**

```
main.py
  └── routers/ingest.py  ──▶  services/ingestion.py
  │                               ├──▶  ingestion/chunker.py
  │                               ├──▶  retrieval/embedder.py
  │                               └──▶  chromadb
  │
  └── routers/query.py   ──▶  services/retrieval.py
  │                               ├──▶  retrieval/embedder.py
  │                               ├──▶  retrieval/bm25_search.py
  │                               └──▶  chromadb
  │
  └── routers/query.py   ──▶  services/generation.py
                                  └──▶  anthropic (Claude API)
```

---

# 10. End-to-End Walkthrough

Let's trace a complete example from PDF upload to answered question.

## Step 1: Upload a PDF

```
User: POST /ingest/upload  with file=attention_paper.pdf

ingest.py router:
  1. Validates file is .pdf
  2. Saves to temp file /tmp/abc123.pdf
  3. Calls ingestion_service.ingest_pdf("/tmp/abc123.pdf", "attention_2017")
  4. Deletes temp file
  5. Returns: {success: true, chunks: 60, pages: 15}
```

## Step 2: Inside `ingest_pdf()`

```
ingestion.py service:
  1. PdfReader extracts text from each page:
     page 1: "Abstract\nThe dominant sequence..."
     page 2: "1. Introduction\nRecurrent neural..."
     ...
     (15 pages total)

  2. Wraps pages with markers:
     "[Page 1]\nAbstract\nThe dominant sequence..."
     "[Page 2]\n1. Introduction\nRecurrent neural..."

  3. Joins into full_text (one big string, ~45,000 chars)

  4. RecursiveChunker.split(full_text):
     → tries paragraph splits first (\n\n)
     → 60 chunks, each ~800 chars

  5. Embedder.embed_batch(chunks):
     → 60 chunks → 60 × 384-dim vectors
     → batch_size=32: runs in 2 batches

  6. collection.upsert():
     → stores 60 (id, vector, text, metadata) records in ChromaDB
     → metadata includes source="attention_2017", page=N

  7. bm25_index.add_documents():
     → tokenizes all 60 chunks
     → builds BM25Okapi index (precomputes IDF for all terms)
```

## Step 3: Ask a Question

```
User: POST /query
      {"question": "What BLEU score did the Transformer achieve?", "top_k": 5}
```

## Step 4: Inside `retrieval.search()`

```
retrieval.py (hybrid mode):

  A. Semantic search:
     1. embed("What BLEU score did the Transformer achieve?")
        → query_vector = [-0.021, 0.034, ...]
     2. ChromaDB.query(query_vector, n_results=10)
        → finds 10 nearest vectors
        → returns chunks about evaluation, results, translation tasks
        → scores: [0.71, 0.68, 0.65, ...]

  B. BM25 search:
     1. tokenize → ["what", "bleu", "score", "transformer", "achieve"]
     2. BM25Okapi.get_scores(tokens)
        → chunk containing "28.4 BLEU on WMT 2014": score=2.29 ← high!
        → chunk about training: score=0.3
        → chunk about architecture: score=0.1
     3. Returns top chunks by BM25 score

  C. RRF fusion:
     1. Rank semantic results: [chunk_A(1), chunk_B(2), chunk_C(3), ...]
     2. Rank BM25 results: [chunk_A(1), chunk_D(2), ...]
     3. RRF score for chunk_A: 1/(60+1) + 1/(60+1) = 0.033
     4. Sort by RRF score → final top-5 chunks
```

## Step 5: Inside `generation.generate()`

```
generation.py:

  Context string (formatted from top-5 chunks):
  "[Source 1 | attention_2017 | Page 9]
   On the WMT 2014 English-to-German task, the big Transformer
   model achieves 28.4 BLEU, establishing new state-of-the-art..."

  "[Source 2 | attention_2017 | Page 9]
   On WMT 2014 English-to-French, our model establishes 41.8 BLEU
   after training for 3.5 days on 8 P100 GPUs..."

  Prompt to Claude:
  System: "You are a research assistant. Answer ONLY from the provided context..."
  User: "Context: [the chunks above]\n\nQuestion: What BLEU score did the Transformer achieve?"

  Claude's response:
  "The Transformer achieved 28.4 BLEU on the WMT 2014 English-to-German
   translation task and 41.8 BLEU on the English-to-French task,
   establishing new state-of-the-art results in both.
   (Source: attention_2017, Page 9)"
```

## Step 6: API Response

```json
{
  "answer": "The Transformer achieved 28.4 BLEU on WMT 2014 English-to-German
             and 41.8 BLEU on English-to-French, establishing new state-of-the-art.
             (Source: attention_2017, Page 9)",

  "citations": [
    {"source": "attention_2017", "filename": "paper.pdf", "page": 9, "score": 0.82}
  ],

  "retrieved_chunks": [
    {"text": "On the WMT 2014...", "source": "attention_2017", "page": 9, "score": 0.033},
    ...
  ],

  "model": "claude-haiku-4-5-20251001",
  "tokens_used": {"input": 1843, "output": 87}
}
```

---

# 11. The Frontend

The backend is a FastAPI server that exposes a clean REST + SSE API.
The frontend is a React single-page application in `ui/src/` that consumes it.

```
ui/src/
  App.jsx              — root state, session management, send logic
  api.js               — all fetch calls to the backend
  components/
    Sidebar.jsx        — document list, upload, recent chats
    ChatWindow.jsx     — message list, empty state, example chips
    ChatInput.jsx      — input bar, mode pills, settings panel
    Message.jsx        — renders a single message (user or assistant)
  index.css            — global CSS variables and animation keyframes
```

---

## 11a. Streaming with Server-Sent Events

The LLM generates tokens one at a time. Without streaming, the user stares at a
blank screen for 5-10 seconds until the full response is ready. With streaming,
each token appears as it is generated — feels instant.

### How SSE works

SSE (Server-Sent Events) is a one-way HTTP channel: the server keeps the
connection open and pushes data chunks as they are ready. The client reads them
as a stream rather than waiting for the full response.

```
Client                                  Server
  │                                       │
  │── POST /query/stream ────────────────>│
  │                                       │ (retrieves chunks)
  │<─ data: {"type":"text","content":"T"} │ token by token
  │<─ data: {"type":"text","content":"he"}│
  │<─ data: {"type":"text","content":" "} │
  │   ...                                 │
  │<─ data: {"type":"done", ...}          │ citations + metadata
  │                                       │
```

### Backend: Python generator

`generation.py` uses a **generator function** (`yield`) so each token is
yielded immediately without buffering the full response:

```python
def generate_stream(self, question, context, retrieved_sources):
    for chunk in self.client.chat.completions.create(
        model=self.model, messages=[...], stream=True
    ):
        token = chunk.choices[0].delta.content or ""
        if token:
            yield {"type": "text", "content": token}

    yield {"type": "done", "citations": [...], "model": "...", ...}
```

`query.py` wraps this in a FastAPI `StreamingResponse`:

```python
def event_stream():
    for event in generation.generate_stream(...):
        yield f"data: {json.dumps(event)}\n\n"  # SSE format: "data: ...\n\n"

return StreamingResponse(event_stream(), media_type="text/event-stream",
    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
```

The `X-Accel-Buffering: no` header tells any reverse proxy (nginx) not to
buffer the response — critical for streaming to actually work in production.

### Frontend: ReadableStream

`api.js` reads the SSE stream using the `fetch` API's `ReadableStream`:

```javascript
const res = await fetch(`/query/stream`, { method: 'POST', body: JSON.stringify({...}) });
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const parts = buffer.split('\n\n');   // SSE events are separated by \n\n
  buffer = parts.pop() ?? '';           // keep incomplete event in buffer

  for (const part of parts) {
    const data = JSON.parse(part.trim().slice(6)); // strip "data: " prefix
    if (data.type === 'text')  onToken(data.content);
    else if (data.type === 'done') onDone(data);
    else if (data.type === 'error') throw new Error(data.content);
  }
}
```

**Why the buffer?** Network packets don't align with SSE event boundaries.
A single `read()` call might contain half an event, or multiple events.
The buffer accumulates chunks and splits on `\n\n` (the SSE event delimiter).

### React state during streaming

`App.jsx` maintains a single messages array. During streaming, the loading
message is updated token-by-token via `setMessages`:

```javascript
// onToken — called for every streamed token
(token) => {
  setMessages(prev => prev.map(m =>
    m.id === loadingMsg.id
      ? { ...m, answer: (m.answer || '') + token }
      : m
  ));
},

// onDone — called once at the end with citations, model info, etc.
(result) => {
  setMessages(prev => prev.map(m =>
    m.id === loadingMsg.id
      ? { ...m, loading: false, ...result, elapsed, timestamp }
      : m
  ));
}
```

`Message.jsx` detects the streaming state via `msg.loading && msg.answer` and
renders partial text with a blinking cursor:

```jsx
if (msg.loading) {
  if (!msg.answer) return <LoadingDots />;          // waiting for first token
  return <ReactMarkdown>{msg.answer}</ReactMarkdown> // streaming in progress
    + <span className="streaming-cursor" />;
}
```

---

## 11b. Component Architecture

```
App.jsx  (state owner)
├── sessions[], messages[], loading, sourceFilter, sidebarCollapsed
├── handleSend(question, mode, topK)  — calls queryRAGStream
├── handleClear()                     — saves session, clears messages
├── loadSession(session)              — restores saved session
└── deleteSession(id)                 — removes from localStorage

Sidebar.jsx  (receives: docs, sessions, callbacks)
├── Upload zone — <label> wrapping <input type="file"> (reliable cross-browser)
├── Document list — click to filter, hover to delete (2-step confirm)
└── Recent chats — click to load, hover to delete (2-step confirm)

ChatWindow.jsx  (receives: messages, sourceFilter, onChipClick)
├── Empty state with example chips (shown when messages=[])
└── Message list (role="log" aria-live="polite" for screen readers)

ChatInput.jsx  (receives: onSend, onClear, disabled, pendingQuestion)
├── Mode pills: Hybrid | Semantic | Keyword  (aria-pressed)
├── Settings panel: Top-K slider  (collapsed by default)
├── Textarea with ⌘K global focus shortcut
└── pendingQuestion prop: chip clicks pass a question here,
    useEffect fires onSend then clears it

Message.jsx  (receives: msg)
├── User bubble  (role: 'user')
├── Loading state  (role: 'assistant', loading: true)
├── Error state  (role: 'assistant', error: string)
└── Answer card  (role: 'assistant', answer + citations + chunks)
    ├── ReactMarkdown renders the answer text
    ├── SOURCES: citation cards with color-coded confidence bars
    │   clicking a citation highlights the matching source passage
    ├── View source passages: collapsible chunk list
    └── Footer: model · tokens · elapsed · timestamp
```

---

## 11c. Session Persistence

Chat sessions are saved to `localStorage` under `rag-sessions`.

```javascript
// Session shape
{
  id: 1234567890,          // Date.now() assigned when first message is sent
  title: "How does att…",  // first user message, truncated to 55 chars
  messages: [...],         // full message array
  timestamp: "2025-01-01T12:00:00.000Z",
}
```

**Session ID tracking:** A `sessionIdRef` (React ref, not state) holds the
current session's ID. It's assigned when the first message is sent in a new
conversation, or set to the loaded session's ID when restoring from history.
Using a ref (not state) means it never triggers re-renders and is always
current inside async callbacks.

**Auto-save after every response:** `persistSession()` is called inside the
`onDone` callback of every completed streaming response. This means a page
refresh never loses the conversation — it's persisted to localStorage as soon
as the LLM finishes answering.

```javascript
// Inside handleSend's onDone callback:
setMessages(prev => {
  const updated = prev.map(m => m.id === loadingMsg.id ? { ...m, ...result } : m);
  persistSession(updated, sid);  // upsert to localStorage immediately
  return updated;
});
```

**Upsert, not append:** `persistSession` checks if the session ID already
exists in the list. If yes, it updates that entry. If no, it prepends a new
one. This means adding questions to a loaded session updates it in place rather
than creating a duplicate entry.

**Load:** clicking a session in the sidebar calls `loadSession(session)`,
which saves the current conversation first, then restores the selected session
and sets `sessionIdRef` to its ID (so subsequent questions update that session).

**Delete:** the trash icon removes it from state and rewrites `localStorage`.

Max 10 sessions are kept; older ones are dropped automatically.

---

## 11d. Relevance Filtering

The RAG pipeline always retrieves *something* — nearest-neighbor search has no
concept of "nothing relevant exists". Without filtering, an unrelated question
like "What happened in the Iran-US conflict?" would return the closest ML paper
chunks and display them with misleading 100% confidence bars.

### The solution: cosine similarity threshold

Cosine similarity (the raw score from ChromaDB, before RRF) is the most
reliable out-of-domain signal:

- **Same domain:** similarity typically 0.5–0.8 (the query "lives" in the same
  vector space as the documents)
- **Adjacent domain:** 0.3–0.5
- **Completely unrelated:** 0.1–0.25

We use a threshold of **0.3**. If the best semantic score is below it, we
return an empty result list immediately — no LLM call, no citations displayed.

```python
# In retrieval.py _hybrid_search():
semantic = self._semantic_search(query, top_k=top_k * 2, ...)
if relevance_threshold > 0 and not source_filter:
    if not semantic or semantic[0]["score"] < relevance_threshold:
        return []   # short-circuit before BM25 or LLM
```

**Why gate on semantic, not BM25?** BM25 matches exact tokens. Common English
words like "US", "conflict", "current" appear in almost every large document,
so BM25 would return results for any English query. Semantic similarity is
immune to this — it measures meaning, not word overlap.

**Why check semantic before BM25 in hybrid mode?** The original implementation
checked `if not semantic and not keyword: return []`. If BM25 returned *any*
results (even for common words), the pipeline would proceed — bypassing the
threshold entirely. The fix runs the semantic gate first and short-circuits
before BM25 is even consulted.

**Why skip the threshold when `source_filter` is set?** If the user has
explicitly filtered to a specific document, they want answers from it regardless
of how the query scores. "Summarize this paper" has low cosine similarity to
any specific chunk (it doesn't match any passage verbatim), but it's a
completely valid request. The threshold is a domain guard — once the user has
chosen a domain explicitly, it shouldn't apply.

**Threshold transparency:** When no results are returned, the system peeks at
the best score and includes it in the response message:

```
"No relevant content found. Best match score was 0.24 (threshold: 0.30).
Try rephrasing or switching to keyword search mode."
```

This turns an opaque failure into a debuggable one — you can see exactly how
close you were and what to try next.

---

## 11e. Conditional LLM Parameters

Not all queries need the same LLM settings. Two very different query types
flow through this app:

- **Technical:** "What BLEU score was achieved on WMT 2014?" — needs a precise,
  deterministic answer. Numbers must be exact, not paraphrased.
- **Creative:** "Explain the attention mechanism intuitively" — needs an
  engaging, clear explanation. Some variation and analogy is desirable.

The key parameter that controls this is **temperature**:

| Temperature | Effect | Best for |
|---|---|---|
| 0.0–0.2 | Near-deterministic. Model picks the highest-probability token each step. | Factual lookups, numbers, definitions |
| 0.5–0.8 | More varied. Model samples from a wider distribution. | Explanations, summaries, analogies |
| 1.0+ | Very random. Can be creative or incoherent. | Creative writing (not RAG) |

### Query Classification

The app classifies each query before calling the LLM using **weighted signal
matching**. Each signal word has a weight reflecting how strongly it indicates
its type:

```python
_CREATIVE_SIGNALS = {
    "intuitively": 3, "analogy": 3, "eli5": 3,   # strong — unambiguous
    "summarize": 2, "overview": 2,                 # medium
    "explain": 1, "describe": 1,                   # weak — also in technical queries
}
_TECHNICAL_SIGNALS = {
    "bleu": 3, "formula": 3, "equation": 3,        # strong — domain-specific
    "score": 2, "metric": 2, "accuracy": 2,        # medium
    "what is the": 1, "algorithm": 1,              # weak — generic patterns
}
```

Why weighted instead of raw counts? Because "explain" (weak creative, weight=1)
should not override "BLEU score" (strong technical, weight=3+2). Without weights,
"Explain what BLEU score was used?" would classify as creative — wrong.

Weighted sums are compared. **Technical wins ties** because precision matters
more for factual queries than warmth does for explanatory ones.

```python
creative_score  = sum(w for s, w in _CREATIVE_SIGNALS.items()  if s in query)
technical_score = sum(w for s, w in _TECHNICAL_SIGNALS.items() if s in query)
query_type = "creative" if creative_score > technical_score else "technical"
```

### What Changes Per Type

```python
_PARAMS = {
    "technical": {"temperature": 0.1, "max_tokens": 1024},
    "creative":  {"temperature": 0.7, "max_tokens": 1536},
}
```

The system prompt also shifts:
- **Technical:** "Be concise and exact. Preserve numbers, formulas, and
  technical terms verbatim."
- **Creative:** "Explain clearly and engagingly. Use analogies or simple
  language where it helps intuition. Write in flowing prose."

### Auto Top-K for Summarization

Summarization queries ("summarize", "overview", "what is this paper about")
need broad coverage — you want chunks from throughout the document, not just
the 5 most similar passages. The app auto-bumps top_k to 15 for these queries:

```python
is_summary_query = any(kw in q_lower for kw in _SUMMARY_KEYWORDS)
effective_top_k = max(request.top_k or 5, 15) if is_summary_query else request.top_k
```

This is done in the router (before retrieval) so the user's configured top_k
still applies for normal queries.

---

# Quick Reference

## Running the project

```bash
# Start the API server (from rag-research-copilot/ directory)
uvicorn backend.main:app --reload

# Interactive docs (test all endpoints in browser)
open http://localhost:8000/docs

# Run concept demos
python demo_concepts.py
```

## Key config knobs (in `.env`)

| Variable | Default | What it controls |
|---|---|---|
| `CHUNK_SIZE` | 800 | Chars per chunk. Larger = richer context, less precise retrieval |
| `CHUNK_OVERLAP` | 150 | Shared chars between chunks. More = less boundary loss |
| `TOP_K` | 5 | Chunks retrieved per query. More = richer context, higher LLM cost |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence-transformers model. Larger = better quality, slower |

## Common failure modes and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| LLM says "I don't have information" | Right content not retrieved | Increase TOP_K, check /search endpoint |
| "No relevant content — best match 0.24" | Query below relevance threshold | Rephrase, switch to keyword mode, or lower threshold |
| Irrelevant chunks retrieved | Query too vague | Try keyword mode, rephrase query |
| "Summarize paper" returns shallow answer | Top-K too low for coverage | Auto-bumped to 15 for summary queries; raise TOP_K in settings for more |
| Slow ingestion | Large PDF + CPU embedding | Reduce batch_size, use GPU if available |
| Duplicate chunks on re-ingest | Expected behavior — upsert | Safe to ignore, IDs are stable |
| Scanned / image-based PDF returns nothing | pypdf can't extract image text | Pre-process with OCR (e.g. tesseract) before uploading |

---

*Next: cross-encoder reranking, evaluation pipeline, deployment*
