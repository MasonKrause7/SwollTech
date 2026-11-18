"""Fixed-window rate limits.

On Vercel each request may land on a different function instance, so counts live in
Upstash Redis (REST API, set up through the Vercel Marketplace: KV_REST_API_URL and
KV_REST_API_TOKEN). Without Redis (local runs and tests) counts are kept in memory.
If Redis is unreachable the request is allowed rather than failing the whole API.
"""

import logging
import time

import httpx

from swolltech.config import get_settings
from swolltech.errors import DomainError

logger = logging.getLogger("swolltech.rate_limit")


class MemoryBackend:
    def __init__(self) -> None:
        self.events: dict[str, list[float]] = {}

    async def count(self, key: str, window_seconds: float) -> int:
        current = time.monotonic()
        recent = [stamp for stamp in self.events.get(key, []) if current - stamp < window_seconds]
        recent.append(current)
        self.events[key] = recent
        return len(recent)


class UpstashBackend:
    def __init__(self, url: str, token: str) -> None:
        self.url = url.rstrip("/")
        self.token = token
        self.client: httpx.AsyncClient | None = None

    async def count(self, key: str, window_seconds: float) -> int:
        window = int(window_seconds)
        bucket = f"rl:{key}:{int(time.time()) // window}"
        if self.client is None:
            self.client = httpx.AsyncClient(timeout=2.0)
        response = await self.client.post(
            f"{self.url}/pipeline",
            headers={"Authorization": f"Bearer {self.token}"},
            json=[["INCR", bucket], ["EXPIRE", bucket, str(window + 1)]],
        )
        response.raise_for_status()
        return int(response.json()[0]["result"])


class Limiter:
    def __init__(self) -> None:
        self.backend: MemoryBackend | UpstashBackend | None = None

    def _backend(self):
        if self.backend is None:
            settings = get_settings()
            if settings.redis_rest_url and settings.redis_rest_token:
                self.backend = UpstashBackend(settings.redis_rest_url, settings.redis_rest_token)
            else:
                self.backend = MemoryBackend()
        return self.backend

    def use_memory(self) -> None:
        self.backend = MemoryBackend()

    async def hit(self, key: str, limit: int, window_seconds: float) -> None:
        try:
            used = await self._backend().count(key, window_seconds)
        except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
            logger.warning("Rate limit store unavailable, allowing request: %s", type(exc).__name__)
            return
        if used > limit:
            raise DomainError(429, "Too many requests")


limiter = Limiter()
