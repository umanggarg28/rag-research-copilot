"""
demo_concepts.py — Interactive walkthrough of every RAG building block.

Run this to see what each component actually does:
  python demo_concepts.py

This mirrors the hands-on notebooks in the DeepLearning.ai course —
you can see the intermediate outputs at every step of the pipeline.
"""

import sys
import os
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: CHUNKING
# ─────────────────────────────────────────────────────────────────────────────

def demo_chunking():
    print("\n" + "="*60)
    print("STEP 1: CHUNKING — splitting text into pieces")
    print("="*60)

    from ingestion.chunker import RecursiveChunker

    # Sample text from the famous "Attention Is All You Need" abstract
    sample_text = """
    The dominant sequence transduction models are based on complex recurrent or
    convolutional neural networks that include an encoder and a decoder. The best
    performing models also connect the encoder and decoder through an attention mechanism.

    We propose a new simple network architecture, the Transformer, based solely on
    attention mechanisms, dispensing with recurrence and convolutions entirely.
    Experiments on two machine translation tasks show these models to be superior in
    quality while being more parallelizable and requiring significantly less time to train.

    Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task,
    improving over the existing best results, including ensembles by over 2 BLEU.
    On the WMT 2014 English-to-French translation task, our model establishes a new
    single-model state-of-the-art BLEU score of 41.0 after training for 3.5 days on
    eight GPUs, a small fraction of the training costs of the best models from the literature.
    """

    print(f"\nOriginal text: {len(sample_text)} characters")
    print(f"Original text:\n{sample_text}")

    # Try different chunk sizes to see the effect
    for chunk_size, overlap in [(300, 50), (200, 50), (150, 30)]:
        chunker = RecursiveChunker(chunk_size=chunk_size, chunk_overlap=overlap)
        chunks = chunker.split(sample_text)

        print(f"\n{'─'*50}")
        print(f"chunk_size={chunk_size}, overlap={overlap} → {len(chunks)} chunks:")
        for i, chunk in enumerate(chunks):
            print(f"\n  Chunk {i+1} ({len(chunk)} chars):")
            print(f"  '{chunk[:100]}{'...' if len(chunk) > 100 else ''}'")

    print("\n✅ Key insight: Larger chunk_size = fewer, bigger chunks (less precise retrieval)")
    print("   Overlap = shared context at boundaries prevents losing meaning")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: EMBEDDINGS
# ─────────────────────────────────────────────────────────────────────────────

def demo_embeddings():
    print("\n" + "="*60)
    print("STEP 2: EMBEDDINGS — text → vectors")
    print("="*60)

    from retrieval.embedder import Embedder

    embedder = Embedder("all-MiniLM-L6-v2")

    # Show what a vector looks like
    text = "The Transformer uses self-attention mechanisms."
    vector = embedder.embed_text(text)

    print(f"\nText: '{text}'")
    print(f"Vector shape: {len(vector)} dimensions")
    print(f"First 10 values: {[round(v, 4) for v in vector[:10]]}")
    print(f"Vector magnitude: {round(np.linalg.norm(vector), 4)} (should be ~1.0 — normalized)")

    # The key demo: semantic similarity
    print("\n--- Semantic Similarity Demo ---")
    sentences = [
        ("The Transformer uses self-attention mechanisms.", "query"),
        ("Attention is the key building block of the Transformer model.", "HIGH similarity"),
        ("Neural networks learn representations from data.", "MEDIUM similarity"),
        ("Photosynthesis converts light into chemical energy.", "LOW similarity"),
        ("I enjoy eating pizza on Friday evenings.", "ZERO similarity"),
    ]

    query_vec = embedder.embed_text(sentences[0][0])

    print(f"\nQuery: '{sentences[0][0]}'\n")
    print(f"{'Text':<60} {'Expected':<20} {'Cosine Similarity'}")
    print("─" * 90)

    for text, label in sentences[1:]:
        vec = embedder.embed_text(text)
        sim = embedder.cosine_similarity(query_vec, vec)
        bar = "█" * int(sim * 20)
        print(f"{text:<60} {label:<20} {sim:.4f} {bar}")

    print("\n✅ Key insight: Semantically similar sentences have high cosine similarity")
    print("   This is why semantic search finds relevant chunks even without exact keyword matches")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: BM25 KEYWORD SEARCH
# ─────────────────────────────────────────────────────────────────────────────

def demo_bm25():
    print("\n" + "="*60)
    print("STEP 3: BM25 — keyword search (TF-IDF on steroids)")
    print("="*60)

    from retrieval.bm25_search import BM25Index, tokenize

    # Simulate a collection of paper chunks
    chunks = [
        {
            "text": "The Transformer architecture uses multi-head self-attention to process sequences in parallel.",
            "source": "attention_is_all_you_need",
            "page": 2,
            "chunk_index": 0,
        },
        {
            "text": "BERT is pre-trained using masked language modeling and next sentence prediction tasks.",
            "source": "bert_paper",
            "page": 3,
            "chunk_index": 0,
        },
        {
            "text": "The learning rate was set to 0.0001 with a warmup of 4000 steps using the Adam optimizer.",
            "source": "attention_is_all_you_need",
            "page": 6,
            "chunk_index": 1,
        },
        {
            "text": "GPT models use autoregressive language modeling, predicting the next token given previous context.",
            "source": "gpt_paper",
            "page": 2,
            "chunk_index": 0,
        },
        {
            "text": "The model was trained on WMT 2014 English-German dataset with 4.5 million sentence pairs.",
            "source": "attention_is_all_you_need",
            "page": 8,
            "chunk_index": 2,
        },
    ]

    bm25 = BM25Index()
    bm25.add_documents(chunks)

    # Show tokenization
    sample = "The Transformer architecture uses multi-head self-attention"
    print(f"\nTokenization example:")
    print(f"  Input: '{sample}'")
    print(f"  Tokens: {tokenize(sample)}")

    # Test queries
    queries = [
        "What learning rate was used?",    # Exact term match → BM25 wins
        "How does attention work?",         # Conceptual → semantic wins
        "WMT 2014 training data",           # Specific dataset name → BM25 wins
    ]

    for query in queries:
        print(f"\n{'─'*50}")
        print(f"Query: '{query}'")
        print(f"Query tokens: {tokenize(query)}")
        results = bm25.search(query, top_k=3)
        print(f"Top results:")
        for i, r in enumerate(results):
            print(f"  {i+1}. [BM25={r['bm25_score']:.3f}] [{r['source']} p.{r['page']}]")
            print(f"     '{r['text'][:80]}...'")

    print("\n✅ Key insight: BM25 excels at exact term matches (numbers, names, specific terms)")
    print("   It fails at paraphrases — 'puppy' won't match 'dog' in BM25!")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: HYBRID SEARCH — RRF
# ─────────────────────────────────────────────────────────────────────────────

def demo_hybrid_search():
    print("\n" + "="*60)
    print("STEP 4: HYBRID SEARCH — combining semantic + keyword (RRF)")
    print("="*60)

    from retrieval.bm25_search import BM25Index, reciprocal_rank_fusion
    from retrieval.embedder import Embedder
    import chromadb

    print("\nLoading embedder and building indexes...")

    chunks = [
        {"text": "The Transformer uses multi-head self-attention mechanisms to process tokens.", "source": "transformer", "page": 2, "chunk_index": 0},
        {"text": "Learning rate scheduling with warmup is critical for Transformer training stability.", "source": "transformer", "page": 6, "chunk_index": 1},
        {"text": "BERT achieves state-of-the-art results on 11 NLP benchmarks using pre-training.", "source": "bert", "page": 1, "chunk_index": 0},
        {"text": "The learning rate was set to 0.0001 with Adam optimizer and beta1=0.9.", "source": "transformer", "page": 8, "chunk_index": 2},
        {"text": "Attention scores are computed as softmax(QK^T / sqrt(d_k)) V.", "source": "transformer", "page": 3, "chunk_index": 3},
    ]

    # Build BM25 index
    bm25 = BM25Index()
    bm25.add_documents(chunks)

    # Build simple in-memory vector index
    embedder = Embedder("all-MiniLM-L6-v2")
    chroma = chromadb.Client()  # in-memory for demo
    try:
        chroma.delete_collection("demo")
    except:
        pass
    collection = chroma.create_collection("demo", metadata={"hnsw:space": "cosine"})

    embeddings = embedder.embed_batch([c["text"] for c in chunks])
    collection.add(
        ids=[str(i) for i in range(len(chunks))],
        embeddings=embeddings,
        documents=[c["text"] for c in chunks],
        metadatas=chunks,
    )

    query = "What learning rate was used for training?"
    print(f"\nQuery: '{query}'")

    # Semantic search results
    query_vec = embedder.embed_text(query)
    sem_raw = collection.query(query_embeddings=[query_vec], n_results=5, include=["documents", "metadatas", "distances"])
    semantic_results = [
        {**meta, "text": doc, "score": round(1 - dist, 4)}
        for doc, meta, dist in zip(sem_raw["documents"][0], sem_raw["metadatas"][0], sem_raw["distances"][0])
    ]

    # BM25 results
    bm25_results = bm25.search(query, top_k=5)

    print("\n--- Semantic Search Results ---")
    for i, r in enumerate(semantic_results):
        print(f"  Rank {i+1} [score={r['score']:.4f}]: '{r['text'][:70]}...'")

    print("\n--- BM25 Keyword Results ---")
    for i, r in enumerate(bm25_results):
        print(f"  Rank {i+1} [score={r['bm25_score']:.3f}]: '{r['text'][:70]}...'")

    # Hybrid fusion
    hybrid = reciprocal_rank_fusion(semantic_results, bm25_results)

    print("\n--- Hybrid Results (RRF fusion) ---")
    for i, r in enumerate(hybrid):
        print(f"  Rank {i+1} [RRF={r['rrf_score']:.5f}]: '{r['text'][:70]}...'")

    print("\n✅ Key insight: Hybrid search combines the best of both worlds")
    print("   Semantic: finds 'learning rate' via meaning")
    print("   BM25: boosts exact matches like '0.0001', 'Adam'")
    print("   RRF: ranks by position, not raw score (handles scale mismatch)")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n🔬 RAG Research Copilot — Concept Demos")
    print("This script shows what happens at each stage of the RAG pipeline.\n")

    steps = {
        "1": ("Chunking", demo_chunking),
        "2": ("Embeddings", demo_embeddings),
        "3": ("BM25 Keyword Search", demo_bm25),
        "4": ("Hybrid Search (RRF)", demo_hybrid_search),
    }

    print("Which demo do you want to run?")
    for k, (name, _) in steps.items():
        print(f"  {k}. {name}")
    print("  all. Run all demos")

    choice = input("\nEnter choice (1/2/3/4/all): ").strip().lower()

    if choice == "all":
        for _, (_, fn) in steps.items():
            fn()
    elif choice in steps:
        steps[choice][1]()
    else:
        print("Invalid choice")
