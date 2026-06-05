import redis
from fastapi import HTTPException
from .config import settings
from .constants import TECDOC_WINDOW_SECONDS
import time

class RateLimiter:
    def __init__(self):
        self.redis = redis.Redis(
            host=settings.REDIS_HOST, 
            port=settings.REDIS_PORT, 
            decode_responses=True
        )

    async def check_limit(self):
        now = time.time()
        window_start = now - TECDOC_WINDOW_SECONDS
        key = "tecdoc_api_actions"
        
        self.redis.zremrangebyscore(key, 0, window_start)
        current_count = self.redis.zcard(key)
        
        if current_count >= settings.TECDOC_MAX_ACTIONS_PER_HOUR:
            raise HTTPException(
                status_code=429, 
                detail="TecDoc API rate limit reached. Please try again later."
            )
            
    def record_action(self):
        now = time.time()
        self.redis.zadd("tecdoc_api_actions", {str(now): now})

rate_limiter = RateLimiter()
