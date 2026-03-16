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

SYSTEM_PROMPT = """You are a research assistant that answers questions about scientific papers.

You have been provided with excerpts from research papers as context.
Answer the user's question using ONLY the information in the provided context.

Rules:
- If the context contains the answer, provide a clear, accurate answer with citations.
- If the context does NOT contain enough information to answer, say:
  "I don't have enough information in the provided papers to answer this question."
- Never fabricate information or draw on knowledge outside the provided context.
- Always cite your sources using the format: (Source: <paper name>, Page <N>)
- Be concise but complete. Use bullet points for complex answers.
"""


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

        if self.provider == "groq":
            return self._generate_groq(user_message, retrieved_sources)
        else:
            return self._generate_anthropic(user_message, retrieved_sources)

    def _generate_groq(self, user_message: str, retrieved_sources: list[dict]) -> dict:
        """Call Groq API (OpenAI-compatible format)."""
        response = self.client.chat.completions.create(
            model=self.model,
            max_tokens=1024,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
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

    def _generate_anthropic(self, user_message: str, retrieved_sources: list[dict]) -> dict:
        """Call Anthropic API."""
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
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
