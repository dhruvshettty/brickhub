from __future__ import annotations

import logging

import anthropic
from app.core.config import settings

logger = logging.getLogger("uvicorn.error")

_COST_PER_MTOK: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6":         {"input": 3.00, "output": 15.00, "cache_write": 3.75, "cache_read": 0.30},
    "claude-haiku-4-5-20251001": {"input": 0.80, "output":  4.00, "cache_write": 1.00, "cache_read": 0.08},
}


def _estimate_cost(model: str, input_tokens: int, output_tokens: int, cache_write: int, cache_read: int) -> float | None:
    rates = _COST_PER_MTOK.get(model)
    if not rates:
        return None
    return (
        input_tokens * rates["input"]
        + output_tokens * rates["output"]
        + cache_write * rates["cache_write"]
        + cache_read * rates["cache_read"]
    ) / 1_000_000


def _log_usage(model: str, call_type: str, usage: anthropic.types.Usage) -> None:
    input_tokens = usage.input_tokens
    output_tokens = usage.output_tokens
    cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cost = _estimate_cost(model, input_tokens, output_tokens, cache_write, cache_read)
    cost_str = f"${cost:.5f}" if cost is not None else "unknown"
    logger.info(
        "claude_usage call_type=%s model=%s input=%d output=%d cache_write=%d cache_read=%d est_cost=%s",
        call_type, model, input_tokens, output_tokens, cache_write, cache_read, cost_str,
    )


class ClaudeUnavailableError(Exception):
    pass


class ClaudeService:
    def __init__(self):
        if not settings.anthropic_api_key or settings.anthropic_api_key.startswith("sk-ant-..."):
            raise EnvironmentError(
                "ANTHROPIC_API_KEY is not set. "
                "Add it to your .env file (get one at console.anthropic.com)."
            )
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def generate(self, system: str, user: str, model: str = "claude-sonnet-4-6", call_type: str = "unknown") -> str:
        """Single-shot generation with no prompt caching."""
        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            _log_usage(model, call_type, response.usage)
            return response.content[0].text
        except anthropic.APIError as e:
            raise ClaudeUnavailableError(f"Claude API error: {e}") from e

    def generate_with_cache(
        self,
        system_parts: list[dict],
        user: str,
        model: str = "claude-sonnet-4-6",
        call_type: str = "unknown",
        max_tokens: int = 4096,
    ) -> str:
        """Generation with prompt caching on stable system context.

        system_parts: list of {"text": "...", "cache": bool} dicts.
        Parts with cache=True get cache_control applied (stable context like user profile).
        """
        try:
            system_content = []
            for part in system_parts:
                block = {"type": "text", "text": part["text"]}
                if part.get("cache"):
                    block["cache_control"] = {"type": "ephemeral"}
                system_content.append(block)

            response = self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system_content,
                messages=[{"role": "user", "content": user}],
            )
            _log_usage(model, call_type, response.usage)
            return response.content[0].text
        except anthropic.APIError as e:
            raise ClaudeUnavailableError(f"Claude API error: {e}") from e

    def chat(self, messages: list[dict], system: str, model: str = "claude-haiku-4-5-20251001", call_type: str = "coach_chat") -> str:
        """Multi-turn chat. Used for AI coach. Haiku for speed."""
        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=1024,
                system=system,
                messages=messages,
            )
            _log_usage(model, call_type, response.usage)
            return response.content[0].text
        except anthropic.APIError as e:
            raise ClaudeUnavailableError(f"Claude API error: {e}") from e


_claude_service: ClaudeService | None = None


def get_claude_service() -> ClaudeService:
    global _claude_service
    if _claude_service is None:
        _claude_service = ClaudeService()
    return _claude_service
