from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from app.models import TecDocRateLog

TECDOC_HOURLY_LIMIT = 3332


class RateLimiter:
    @staticmethod
    def current_hour_usage(db: Session) -> int:
        now = datetime.utcnow()
        start_of_hour = now.replace(minute=0, second=0, microsecond=0)
        return db.query(func.count(TecDocRateLog.id)).filter(
            TecDocRateLog.called_at >= start_of_hour
        ).scalar() or 0

    @staticmethod
    def remaining(db: Session) -> int:
        return max(0, TECDOC_HOURLY_LIMIT - RateLimiter.current_hour_usage(db))

    @staticmethod
    def is_exhausted(db: Session) -> bool:
        return RateLimiter.remaining(db) <= 0

    @staticmethod
    def log(db: Session, endpoint: str, article: str = None, brand_id: int = None,
            success: bool = True, response_ms: int = None):
        entry = TecDocRateLog(
            endpoint=endpoint,
            article=article,
            brand_id=brand_id,
            success=success,
            response_ms=response_ms,
        )
        db.add(entry)
        db.commit()

    @staticmethod
    def hourly_stats(db: Session, hours: int = 24):
        now = datetime.utcnow()
        since = now.replace(minute=0, second=0, microsecond=0)
        from datetime import timedelta
        rows = []
        for i in range(hours):
            h = since - timedelta(hours=i)
            next_h = h + timedelta(hours=1)
            count = db.query(func.count(TecDocRateLog.id)).filter(
                TecDocRateLog.called_at >= h,
                TecDocRateLog.called_at < next_h,
            ).scalar() or 0
            rows.append({"hour": h.strftime("%H:00"), "count": count})
        return list(reversed(rows))


rate_limiter = RateLimiter()
