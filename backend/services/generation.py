"""
generation.py — LLM integration for answer generation.

Supports two LLM providers, switchable via .env:
  - Groq (FREE tier) — llama-3.3-70b, very fast, 14,400 req/day free
  - Anthropic (paid)  — Claude Haiku/Sonnet

The system prompt uses "closed-book" prompting to prevent hallucination:
  - Hard constraint: answer ONLY from the provided context
  - Explicit fallback: say "I don't know" if context is insufficient
  - Citation instruction: always cite source + page

Why does this prevent hallucination?
  Without context: LLM must recall facts from training → can confabulate
  With context:    LLM reads provided text and extracts → grounded in reality
  The instruction "ONLY from context" plus the fallback instruction together
  force the model to stay honest about what it does and doesn't know.
"""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import settings

_SYSTEM_BASE = """You are a research assistant that answers questions about scientific papers.

You have been provided with excerpts from research papers as context.
Answer the user's question using ONLY the information in the provided context.

Rules:
- If the context contains the answer, provide a clear, accurate answer with citations.
- If the context does NOT contain enough information to answer, say:
  "I don't have enough information in the provided papers to answer this question."
- Never fabricate information or draw on knowledge outside the provided context.
- Always cite your sources using the format: (Source: <paper name>, Page <N>)
"""

# Technical queries: precise, numbers, no fluff
_SYSTEM_TECHNICAL = _SYSTEM_BASE + (
    "- Be concise and exact. Preserve numbers, formulas, and technical terms verbatim.\n"
    "- Use bullet points to structure multi-part answers.\n"
)

# Creative queries: engaging, explanatory, intuition-building
_SYSTEM_CREATIVE = _SYSTEM_BASE + (
    "- Explain clearly and engagingly. Use analogies or simple language where it helps intuition.\n"
    "- Write in flowing prose rather than bullet points unless listing is genuinely clearer.\n"
    "- Focus on building understanding, not just reciting facts.\n"
)

# LLM parameters per query type
_PARAMS = {
    "technical": {"temperature": 0.1, "max_tokens": 1024},
    "creative":  {"temperature": 0.7, "max_tokens": 1536},
}

# Weighted signals for query classification.
# Higher weight = stronger indicator of that type.
# Weighting prevents weak signals ("explain") from overriding strong ones ("BLEU score").
#
# Creative: queries asking for understanding, analogies, or high-level narrative
# Technical: queries asking for precise facts, numbers, or specific terms
_CREATIVE_SIGNALS = {
    # Strong — unambiguously asking for intuition/narrative
    "intuitively": 3, "analogy": 3, "eli5": 3, "layman": 3,
    "in simple terms": 3, "easy way": 3,
    # Medium — likely creative but could appear in technical queries
    "big picture": 2, "summarize": 2, "summarise": 2, "summary": 2,
    "overview": 2, "help me understand": 2, "walk me through": 2,
    # Weak — common words that also appear in technical queries
    "explain": 1, "describe": 1, "tell me about": 1, "intuition": 1,
}
_TECHNICAL_SIGNALS = {
    # Strong — specific metric names or math terms
    "bleu": 3, "rouge": 3, "perplexity": 3, "formula": 3,
    "equation": 3, "calculate": 3, "benchmark": 3,
    # Medium — clearly asking for precise values or specs
    "score": 2, "metric": 2, "accuracy": 2, "loss": 2,
    "parameter": 2, "hyperparameter": 2, "how many": 2, "how much": 2,
    "result": 2, "performance": 2, "value": 2,
    # Weak — common question patterns
    "what is the": 1, "what are the": 1, "define": 1, "definition": 1,
    "algorithm": 1, "architecture": 1, "implementation": 1,
    "layer": 1, "dimension": 1,
}


class GenerationService:
    """
    Handles LLM-based answer generation from retrieved context.

    Automatically picks the provider based on which API key is set in .env:
      GROQ_API_KEY    → uses Groq (free, Llama 3.3 70B)
      ANTHROPIC_API_KEY → uses Claude Haiku

    If both are set, Groq takes priority (it's free).
    """

    def __init__(self):
        self.provider, self.client, self.model = self._init_client()
        print(f"GenerationService using: {self.provider} ({self.model})")

    def _init_client(self):
        # Try Groq first (free)
        if settings.groq_api_key:
            from groq import Groq
            client = Groq(api_key=settings.groq_api_key)
            # llama-3.3-70b: excellent quality, fast, free tier
            return "groq", client, "llama-3.3-70b-versatile"

        # Fall back to Anthropic
        if settings.anthropic_api_key:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            return "anthropic", client, "claude-haiku-4-5-20251001"

        raise ValueError(
            "No LLM API key found. Add either GROQ_API_KEY (free) or "
            "ANTHROPIC_API_KEY to your .env file.\n"
            "Get a free Groq key at: https://console.groq.com"
        )

    def _classify_query(self, question: str) -> str:
        """
        Classify a query as 'technical' or 'creative' using weighted signals.

        Each signal has a weight reflecting how strongly it indicates its type.
        Weighted sums are compared — technical wins ties, since precision
        matters more for factual queries than warmth does for creative ones.

        Examples:
          "What BLEU score was achieved?"    → technical (bleu=3, score=2, what is the=1 → 6 vs 0)
          "Explain attention intuitively"    → creative  (intuitively=3, explain=1 → 4 vs 0)
          "Explain what BLEU score was used" → technical (bleu=3, score=2 vs explain=1 → 5 vs 1)
          "Describe the algorithm"           → technical (algorithm=1 vs describe=1 → tie → technical)
          "Summarize the paper"              → creative  (summarize=2 vs 0)
        """
        q = question.lower()
        creative_score  = sum(w for s, w in _CREATIVE_SIGNALS.items()  if s in q)
        technical_score = sum(w for s, w in _TECHNICAL_SIGNALS.items() if s in q)
        query_type = "creative" if creative_score > technical_score else "technical"
        print(f"[generation] query_type={query_type} "
              f"(creative={creative_score}, technical={technical_score})")
        return query_type

    def generate_stream(self, question: str, context: str, retrieved_sources: list[dict]):
        """
        Generator that streams text tokens then yields a final 'done' event.

        Yields dicts:
          {"type": "text",  "content": "<token>"}   — one per streamed token
          {"type": "done",  "citations": [...], ...} — final metadata event
          {"type": "error", "content": "<msg>"}      — on failure
        """
        query_type = self._classify_query(question)
        params = _PARAMS[query_type]
        system_prompt = _SYSTEM_CREATIVE if query_type == "creative" else _SYSTEM_TECHNICAL

        user_message = (
            f"Context from research papers:\n\n{context}\n\n---\n\nQuestion: {question}"
        )
        citations = self._build_citations(retrieved_sources)
        retrieved_chunks = [
            {"text": r["text"], "source": r["source"],
             "filename": r["filename"], "page": r["page"], "score": r["score"]}
            for r in retrieved_sources
        ]

        if self.provider == "groq":
            yield from self._stream_groq(user_message, citations, retrieved_chunks, system_prompt, params)
        else:
            yield from self._stream_anthropic(user_message, citations, retrieved_chunks, system_prompt, params)

    def _stream_groq(self, user_message, citations, retrieved_chunks, system_prompt, params):
        input_tokens = output_tokens = 0
        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                max_tokens=params["max_tokens"],
                temperature=params["temperature"],
                stream=True,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_message},
                ],
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield {"type": "text", "content": delta}
                if getattr(chunk, "usage", None):
                    input_tokens  = chunk.usage.prompt_tokens     or 0
                    output_tokens = chunk.usage.completion_tokens or 0
        except Exception as e:
            yield {"type": "error", "content": str(e)}
            return
        yield {
            "type": "done",
            "citations": citations,
            "model": f"groq/{self.model}",
            "tokens_used": {"input": input_tokens, "output": output_tokens},
            "retrieved_chunks": retrieved_chunks,
        }

    def _stream_anthropic(self, user_message, citations, retrieved_chunks, system_prompt, params):
        input_tokens = output_tokens = 0
        try:
            with self.client.messages.stream(
                model=self.model,
                max_tokens=params["max_tokens"],
                temperature=params["temperature"],
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            ) as stream:
                for text in stream.text_stream:
                    yield {"type": "text", "content": text}
                final = stream.get_final_message()
                input_tokens  = final.usage.input_tokens
                output_tokens = final.usage.output_tokens
        except Exception as e:
            yield {"type": "error", "content": str(e)}
            return
        yield {
            "type": "done",
            "citations": citations,
            "model": f"anthropic/{self.model}",
            "tokens_used": {"input": input_tokens, "output": output_tokens},
            "retrieved_chunks": retrieved_chunks,
        }

    def generate(self, question: str, context: str, retrieved_sources: list[dict]) -> dict:
        """
        Generate a grounded answer from retrieved context.

        Args:
            question: The user's natural language question
            context: Formatted string of retrieved chunks (from retrieval.format_context)
            retrieved_sources: Raw retrieval results — used to build structured citations

        Returns:
            dict: {answer, citations, model, tokens_used}

        The user message puts context BEFORE the question — this is intentional.
        The LLM reads the context first so it has the information when it
        encounters the question. Like reading a passage before being quizzed on it.
        """
        user_message = f"""Context from research papers:

{context}

---

Question: {question}"""

        query_type = self._classify_query(question)
        params = _PARAMS[query_type]
        system_prompt = _SYSTEM_CREATIVE if query_type == "creative" else _SYSTEM_TECHNICAL

        if self.provider == "groq":
            return self._generate_groq(user_message, retrieved_sources, system_prompt, params)
        else:
            return self._generate_anthropic(user_message, retrieved_sources, system_prompt, params)

    def _generate_groq(self, user_message: str, retrieved_sources: list[dict], system_prompt: str, params: dict) -> dict:
        """Call Groq API (OpenAI-compatible format)."""
        response = self.client.chat.completions.create(
            model=self.model,
            max_tokens=params["max_tokens"],
            temperature=params["temperature"],
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
        return {
            "answer": response.choices[0].message.content,
            "citations": self._build_citations(retrieved_sources),
            "model": f"groq/{self.model}",
            "tokens_used": {
                "input": response.usage.prompt_tokens,
                "output": response.usage.completion_tokens,
            },
        }

    def _generate_anthropic(self, user_message: str, retrieved_sources: list[dict], system_prompt: str, params: dict) -> dict:
        """Call Anthropic API."""
        response = self.client.messages.create(
            model=self.model,
            max_tokens=params["max_tokens"],
            temperature=params["temperature"],
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return {
            "answer": response.content[0].text,
            "citations": self._build_citations(retrieved_sources),
            "model": f"anthropic/{self.model}",
            "tokens_used": {
                "input": response.usage.input_tokens,
                "output": response.usage.output_tokens,
            },
        }

    def _build_citations(self, sources: list[dict]) -> list[dict]:
        """Deduplicate and format source citations."""
        seen = set()
        citations = []
        for s in sources:
            key = (s["source"], s["page"])
            if key not in seen:
                seen.add(key)
                citations.append({
                    "source": s["source"],
                    "filename": s["filename"],
                    "page": s["page"],
                    "score": s["score"],
                })
        return citations
