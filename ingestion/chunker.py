"""
chunker.py — Text chunking from scratch.

WHY DO WE CHUNK?
================
A research paper can be 20-50 pages = ~20,000 tokens.
Problems with using the whole document:
  1. LLMs have context limits (even large ones get confused with too much text)
  2. Bad retrieval: if you store whole papers, every query returns the whole paper
     — you lose precision. You want to retrieve the EXACT section that answers
     the question, not the whole document.

So we split papers into small, overlapping chunks. Then:
  - Each chunk is stored as a vector in the DB
  - A query retrieves only the 5 most relevant chunks
  - The LLM gets ~4000 tokens of focused context instead of 20,000 tokens of noise

CHUNKING STRATEGIES:
====================
1. Fixed-size: just split every N chars. Simple but breaks sentences mid-way.
2. Sentence-based: split on sentence boundaries. Cleaner but variable size.
3. Recursive: try to split on paragraphs first, then sentences, then words.
   This is what we implement — it preserves semantic units as much as possible.
4. Semantic: embed sentences and split where meaning changes most. Advanced.

We implement strategy 3 (recursive) — the standard approach used in
production RAG systems.

OVERLAP EXPLAINED:
==================
Without overlap:
  Chunk 1: "...the attention mechanism computes a weighted sum of values."
  Chunk 2: "This allows the model to focus on relevant tokens..."

"This" in chunk 2 refers to something in chunk 1 — broken context!

With overlap=150:
  Chunk 1: "...the attention mechanism computes a weighted sum of values."
  Chunk 2: "...weighted sum of values. This allows the model to focus..."
             ← shared 150 chars →

Now chunk 2 has context for what "This" refers to.
"""


class RecursiveChunker:
    """
    Splits text into overlapping chunks using a hierarchy of separators.

    The "recursive" part means: try to split on the best separator first.
    If a resulting piece is still too big, split it further with the next separator.

    Separator hierarchy (best to worst for preserving meaning):
      \n\n  → paragraph breaks (best: keeps paragraphs together)
      \n    → line breaks
      ". "  → sentence ends
      " "   → word boundaries
      ""    → character level (last resort, only if word is huge)
    """

    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 150):
        """
        Args:
            chunk_size: Target max characters per chunk.
                        800 chars ≈ 150-200 tokens for English text.
            chunk_overlap: How many chars overlap between adjacent chunks.
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        # Try these separators in order — paragraph > line > sentence > word > char
        self.separators = ["\n\n", "\n", ". ", " ", ""]

    def split(self, text: str) -> list[str]:
        """
        Main entry point. Splits text into overlapping chunks.

        Returns:
            List of text chunks, each <= chunk_size chars,
            with chunk_overlap chars shared between adjacent chunks.
        """
        # Step 1: Recursively split into pieces using the separator hierarchy
        pieces = self._recursive_split(text, self.separators)

        # Step 2: Merge small pieces into chunks of target size
        # (recursive split can produce many tiny pieces — we reassemble them)
        chunks = self._merge_pieces(pieces)

        return chunks

    def _recursive_split(self, text: str, separators: list[str]) -> list[str]:
        """
        Try to split text using the first separator. If a resulting piece
        is still larger than chunk_size, recursively split it with the
        next separator in the list.
        """
        if not text:
            return []

        # Find the first separator that actually exists in the text
        separator = ""
        remaining_separators = []
        for i, sep in enumerate(separators):
            if sep == "" or sep in text:
                separator = sep
                remaining_separators = separators[i + 1:]
                break

        # Split on the chosen separator
        if separator:
            splits = text.split(separator)
        else:
            splits = list(text)  # character-level (last resort)

        pieces = []
        for split in splits:
            if not split.strip():
                continue
            if len(split) <= self.chunk_size:
                # Small enough — keep as-is
                pieces.append(split)
            elif remaining_separators:
                # Too big — try the next (finer) separator recursively
                sub_pieces = self._recursive_split(split, remaining_separators)
                pieces.extend(sub_pieces)
            else:
                # No more separators and still too big — hard split
                for i in range(0, len(split), self.chunk_size):
                    pieces.append(split[i:i + self.chunk_size])

        return pieces

    def _merge_pieces(self, pieces: list[str]) -> list[str]:
        """
        Merge small pieces into chunks of approximately chunk_size,
        with chunk_overlap chars of overlap between adjacent chunks.

        Algorithm:
          - Maintain a "current chunk" buffer
          - Add pieces until the buffer exceeds chunk_size
          - When full: save the chunk, then start a new buffer
            that BEGINS with the last `chunk_overlap` chars of the previous chunk
            (this is how overlap is implemented)
        """
        if not pieces:
            return []

        chunks = []
        current_pieces = []
        current_len = 0

        for piece in pieces:
            piece_len = len(piece)

            # If adding this piece would exceed chunk_size AND we already have content:
            # Save the current chunk and start fresh with overlap
            if current_len + piece_len > self.chunk_size and current_pieces:
                # Save current chunk
                chunk_text = " ".join(current_pieces)
                chunks.append(chunk_text)

                # Calculate overlap: keep pieces from the end that fit within chunk_overlap
                # This is the sliding window that creates the overlap
                overlap_pieces = []
                overlap_len = 0
                for p in reversed(current_pieces):
                    if overlap_len + len(p) <= self.chunk_overlap:
                        overlap_pieces.insert(0, p)
                        overlap_len += len(p)
                    else:
                        break

                current_pieces = overlap_pieces
                current_len = overlap_len

            current_pieces.append(piece)
            current_len += piece_len

        # Don't forget the last chunk
        if current_pieces:
            chunks.append(" ".join(current_pieces))

        return chunks


if __name__ == "__main__":
    # Quick test to see chunking in action
    sample = """
    Attention mechanisms have become an integral part of compelling sequence
    modeling and transduction models in various tasks.

    The Transformer model relies entirely on attention mechanisms, dispensing
    with recurrence and convolutions entirely.

    This allows for significantly more parallelization and can reach a new
    state of the art in translation quality after being trained for as little
    as twelve hours on eight P100 GPUs.
    """

    chunker = RecursiveChunker(chunk_size=200, chunk_overlap=50)
    chunks = chunker.split(sample)

    print(f"Created {len(chunks)} chunks:\n")
    for i, chunk in enumerate(chunks):
        print(f"--- Chunk {i+1} ({len(chunk)} chars) ---")
        print(chunk)
        print()
