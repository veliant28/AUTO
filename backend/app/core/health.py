from fastapi import APIRouter
from app.core.logger import logger

router = APIRouter()

@router.get("/health")
async def health_check():
    logger.info("Health check called")
    return {"status": "ok", "service": "autoparts-backend"}

@router.get("/health/detailed")
async def health_check_detailed():
    import os
    import psycopg2
    from redis import Redis

    checks = {
        "status": "ok",
        "services": {}
    }

    try:
        from app.core.config import settings
        psycopg2.connect(
            host=settings.POSTGRES_SERVER,
            port=settings.POSTGRES_PORT,
            user=settings.POSTGRES_USER,
            password=settings.POSTGRES_PASSWORD,
            database=settings.POSTGRES_DB
        )
        checks["services"]["postgres"] = "ok"
    except Exception as e:
        checks["services"]["postgres"] = f"error: {str(e)}"
        checks["status"] = "degraded"

    try:
        redis_client = Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            decode_responses=True
        )
        redis_client.ping()
        checks["services"]["redis"] = "ok"
    except Exception as e:
        checks["services"]["redis"] = f"error: {str(e)}"
        checks["status"] = "degraded"

    return checks
