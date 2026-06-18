from app.core.config import settings
from redis import Redis
import json

redis_client = Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    decode_responses=True,
)


def cache_get(key: str):
    cached = redis_client.get(key)
    return json.loads(cached) if cached else None


def cache_set(key: str, value, expire: int = 3600):
    redis_client.setex(key, expire, json.dumps(value, default=str))


def cache_delete(key: str):
    redis_client.delete(key)


def cache_delete_pattern(pattern: str):
    for key in redis_client.scan_iter(match=pattern):
        redis_client.delete(key)
