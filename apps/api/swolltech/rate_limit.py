import time

from swolltech.errors import DomainError


class Limiter:
    def __init__(self) -> None:
        self.events: dict[str, list[float]] = {}

    def hit(self, key: str, limit: int, window_seconds: float) -> None:
        current = time.monotonic()
        recent = [stamp for stamp in self.events.get(key, []) if current - stamp < window_seconds]
        if len(recent) >= limit:
            raise DomainError(429, "Too many requests")
        recent.append(current)
        self.events[key] = recent


limiter = Limiter()
