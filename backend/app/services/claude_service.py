from __future__ import annotations

import anthropic
from app.core.config import settings


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

    def generate(self, system: str, user: str, model: str = "claude-sonnet-4-6") -> str:
        """Single-shot generation. Used for plan generation."""
        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return response.content[0].text
        except anthropic.APIError as e:
            raise ClaudeUnavailableError(f"Claude API error: {e}") from e

    def generate_with_cache(self, system_parts: list[dict], user: str, model: str = "claude-sonnet-4-6") -> str:
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
                max_tokens=4096,
                system=system_content,
                messages=[{"role": "user", "content": user}],
            )
            return response.content[0].text
        except anthropic.APIError as e:
            raise ClaudeUnavailableError(f"Claude API error: {e}") from e

    def chat(self, messages: list[dict], system: str, model: str = "claude-haiku-4-5-20251001") -> str:
        """Multi-turn chat. Used for AI coach. Haiku for speed."""
        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=1024,
                system=system,
                messages=messages,
            )
            return response.content[0].text
        except anthropic.APIError as e:
            raise ClaudeUnavailableError(f"Claude API error: {e}") from e


_claude_service: ClaudeService | None = None


def get_claude_service() -> ClaudeService:
    global _claude_service
    if _claude_service is None:
        _claude_service = ClaudeService()
    return _claude_service
