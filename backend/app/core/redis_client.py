"""Async Redis client singleton for protection rate limiting."""
import redis.asyncio as redis
from app.core.config import settings


class RedisClient:
    """Async Redis client singleton."""

    def __init__(self):
        self._client: redis.Redis | None = None

    async def get_client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                decode_responses=True,
            )
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None


redis_client = RedisClient()
