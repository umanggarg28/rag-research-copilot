"""
embedder.py — Converting text to vectors (embeddings).

WHAT IS AN EMBEDDING?
======================
An embedding is a dense numerical vector that captures the MEANING of text.

Example:
  "dog"     → [0.2, -0.5, 0.8, ...]  (384 numbers)
  "puppy"   → [0.19, -0.48, 0.79, ...] (very similar!)
  "car"     → [-0.6, 0.3, -0.1, ...]  (very different)

The magic: semantically similar text → numerically similar vectors.
This is how we do semantic search — it's just geometry in 384-dimensional space.

HOW EMBEDDINGS ARE CREATED:
=============================
We use a pre-trained model: all-MiniLM-L6-v2
  - It's a BERT-style transformer, fine-tuned on 1 billion sentence pairs
  - Fine-tuned for "semantic textual similarity" tasks
  - 384-dimensional output (smaller than OpenAI's 1536-dim, still great quality)
  - Runs on CPU — no GPU needed, no API cost

The model learned: if two sentences are paraphrases of each other,
their vectors should be close. If they're about different topics, they should be far.

COSINE SIMILARITY:
==================
We measure "closeness" using cosine similarity:

  cos(θ) = (A · B) / (|A| × |B|)

  = 1.0  → identical direction → same meaning
  = 0.0  → perpendicular → unrelated topics
  = -1.0 → opposite direction → opposite meaning

Why cosine instead of Euclidean distance?
  Cosine is direction-only (ignores magnitude/length of vector).
  This matters because a longer document produces a larger vector,
  but we want to compare meaning, not document length.

ChromaDB uses cosine distance = 1 - cosine_similarity.
So: distance=0 is perfect match, distance=2 is opposite meaning.
"""

from sentence_transformers import SentenceTransformer
import numpy as np


class Embedder:
    """
    Wraps sentence-transformers to provide text → vector conversion.

    Why a wrapper class?
    If you later want to swap to OpenAI embeddings or another model,
    you only change this class — nothing else in the codebase changes.
    This is the Strategy design pattern.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Load the embedding model. This downloads ~80MB on first run,
        then caches it at ~/.cache/torch/sentence_transformers/

        Args:
            model_name: Any model from https://huggingface.co/sentence-transformers
        """
        print(f"Loading embedding model: {model_name}")
        self.model = SentenceTransformer(model_name)
        self.model_name = model_name
        # Check what dimension vectors this model produces
        self.embedding_dim = self.model.get_sentence_embedding_dimension()
        print(f"Embedding dimension: {self.embedding_dim}")

    def embed_text(self, text: str) -> list[float]:
        """
        Embed a single string.
        Used for: embedding a user's query at search time.

        Returns:
            List of floats (length = embedding_dim)
        """
        vector = self.model.encode(text, normalize_embeddings=True)
        return vector.tolist()

    def embed_batch(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
        """
        Embed many texts efficiently using batching.
        Used for: embedding all chunks during ingestion.

        Why batching?
        The model can process multiple texts in parallel on CPU.
        Batching avoids the overhead of model initialization per text.
        batch_size=32 is a good balance of speed vs memory.

        Args:
            texts: List of strings to embed
            batch_size: How many texts to process at once

        Returns:
            List of vectors, one per input text
        """
        vectors = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=True,   # tqdm progress bar for large batches
            normalize_embeddings=True, # unit-normalize so cosine sim = dot product
        )
        return vectors.tolist()

    def cosine_similarity(self, vec_a: list[float], vec_b: list[float]) -> float:
        """
        Compute cosine similarity between two vectors manually.
        (For demonstration — ChromaDB does this internally.)

        Since we normalize_embeddings=True above, both vectors have length=1.
        So cosine similarity = just the dot product. Fast!
        """
        a = np.array(vec_a)
        b = np.array(vec_b)
        # Since vectors are unit-normalized: cos(θ) = a · b
        return float(np.dot(a, b))
