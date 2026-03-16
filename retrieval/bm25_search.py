"""
bm25_search.py — Keyword search using the BM25 algorithm.

WHY KEYWORD SEARCH IN ADDITION TO SEMANTIC?
============================================
Semantic search is powerful but has weaknesses:
  - "What is the learning rate used in experiment 3?"
    → The number "0.001" might not be semantically close to "learning rate"
  - Specific technical terms, acronyms, paper IDs, author names
  - Exact numeric values or formulas

BM25 (keyword search) excels at these cases because it looks for
EXACT WORD MATCHES, weighted by how rare/informative each word is.

The best RAG systems use BOTH — this is called Hybrid Search.
(Module 2 of the DeepLearning.ai course covers this.)

WHAT IS BM25?
=============
BM25 = "Best Match 25" — a probabilistic ranking function.
It improves on basic TF-IDF in two ways:

1. Term Frequency Saturation:
   TF-IDF rewards documents for containing a word 100 times vs 1 time.
   BM25 "saturates" — the 10th occurrence of a word adds much less than the 1st.
   Formula: TF_bm25 = tf(t,d) × (k1 + 1) / (tf(t,d) + k1 × (1 - b + b × len(d)/avglen))

   k1 (default 1.5): controls saturation speed. Higher = more reward for repetition.
   b (default 0.75): controls length normalization. 1.0 = full normalization.

2. Document Length Normalization:
   A word appearing 3 times in a short paper means more than 3 times in a long paper.
   BM25 normalizes by document length — fair comparison across differently-sized chunks.

HYBRID SEARCH — Reciprocal Rank Fusion (RRF):
==============================================
To combine semantic scores and BM25 scores, we use RRF:

  RRF_score(doc, k=60) = sum(1 / (k + rank_in_each_system))

For each document, we take its rank in semantic results AND its rank in BM25 results,
and combine them using the 1/(k+rank) formula. The constant k=60 dampens the
impact of very high rankings, making the combination more stable.

This was introduced in a 2009 paper and consistently outperforms score-based fusion.
"""

from rank_bm25 import BM25Okapi
import re


def tokenize(text: str) -> list[str]:
    """
    Simple tokenizer: lowercase and split on non-alphanumeric characters.

    Real production systems use better tokenizers (stemming, stop word removal).
    For research papers, this simple approach works well because technical
    terms are usually not common words that would be filtered out.

    Example:
      "Attention Is All You Need" → ["attention", "is", "all", "you", "need"]
    """
    text = text.lower()
    tokens = re.split(r"[^a-z0-9]+", text)
    return [t for t in tokens if t]  # remove empty strings


class BM25Index:
    """
    BM25 keyword search index over a collection of document chunks.

    This mimics what Weaviate does internally when you enable BM25 search.
    We're doing it manually to understand the mechanics.
    """

    def __init__(self):
        self.chunks: list[dict] = []  # stored chunk data with metadata
        self.bm25 = None             # BM25 index (built after adding documents)
        self._corpus_tokens: list[list[str]] = []  # tokenized version of all chunks

    def add_documents(self, chunks: list[dict]):
        """
        Build the BM25 index from chunks.

        Args:
            chunks: List of dicts, each must have:
                    {"text": str, "source": str, "page": int, ...}

        BM25 needs a "corpus" — a list of tokenized documents.
        BM25Okapi(corpus) precomputes IDF scores for all terms at index time.
        This is fast at query time (no re-computation needed).
        """
        self.chunks = chunks
        self._corpus_tokens = [tokenize(chunk["text"]) for chunk in chunks]

        # BM25Okapi is the modern variant of BM25 (fixes some edge cases in original)
        # It computes IDF = log((N - df + 0.5) / (df + 0.5)) for each term
        # where N = total docs, df = docs containing the term
        self.bm25 = BM25Okapi(self._corpus_tokens)

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        """
        Search using BM25 keyword matching.

        Args:
            query: Natural language query (will be tokenized)
            top_k: Number of results to return

        Returns:
            List of result dicts sorted by BM25 score (descending)

        How it works:
          1. Tokenize the query: "attention mechanism paper" → ["attention", "mechanism", "paper"]
          2. For each chunk, compute: sum of BM25_score(term, chunk) for each query term
          3. Return top_k chunks by total score
        """
        if self.bm25 is None or not self.chunks:
            return []

        query_tokens = tokenize(query)

        # get_scores returns an array of BM25 scores, one per document in the corpus
        scores = self.bm25.get_scores(query_tokens)

        # Pair each chunk with its score, sort descending
        scored = [
            (score, i, self.chunks[i])
            for i, score in enumerate(scores)
            if score > 0  # skip chunks with zero relevance (no query terms match)
        ]
        scored.sort(key=lambda x: x[0], reverse=True)

        results = []
        for score, idx, chunk in scored[:top_k]:
            results.append({
                **chunk,
                "bm25_score": float(score),
            })

        return results


def reciprocal_rank_fusion(
    semantic_results: list[dict],
    bm25_results: list[dict],
    k: int = 60,
) -> list[dict]:
    """
    Combine semantic search and BM25 results using Reciprocal Rank Fusion.

    RRF is a rank-based fusion method — it only cares about RANK, not raw scores.
    This is important because BM25 scores and cosine similarity scores are on
    different scales (BM25 scores can be 0-∞, cosine is 0-1).
    You can't just add them directly. RRF normalizes via rank position.

    Formula: RRF(doc) = 1/(k + rank_semantic) + 1/(k + rank_bm25)

    k=60: A "smoothing constant" from the original paper. It reduces the impact
    of very high ranks (rank 1 vs rank 2 isn't as dramatically different as
    raw 1/1 = 1.0 vs 1/2 = 0.5). With k=60: 1/61 ≈ 0.0164 vs 1/62 ≈ 0.0161.
    Much more balanced.

    Args:
        semantic_results: Ordered list from vector search (index 0 = best)
        bm25_results: Ordered list from BM25 search (index 0 = best)
        k: RRF constant (default 60 from the original paper)

    Returns:
        Combined, re-ranked list of unique results
    """
    # Use chunk_index + source as a unique key to identify duplicate results
    # (the same chunk might appear in both semantic AND BM25 results)
    scores: dict[str, float] = {}
    chunk_map: dict[str, dict] = {}

    # Rank semantic results
    for rank, result in enumerate(semantic_results):
        key = f"{result['source']}::{result.get('chunk_index', rank)}"
        scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        chunk_map[key] = result

    # Rank BM25 results
    for rank, result in enumerate(bm25_results):
        key = f"{result['source']}::{result.get('chunk_index', rank)}"
        scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        chunk_map[key] = result

    # Sort by combined RRF score
    sorted_keys = sorted(scores.keys(), key=lambda k: scores[k], reverse=True)

    results = []
    for key in sorted_keys:
        result = chunk_map[key].copy()
        result["rrf_score"] = round(scores[key], 6)
        results.append(result)

    return results
