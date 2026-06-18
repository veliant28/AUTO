from datetime import datetime
import pytest
from app.models import TecDocRateLog
from app.services.rate_limiter import rate_limiter, TECDOC_HOURLY_LIMIT


_seq = 0


def _add_log(db, **kw):
    global _seq
    _seq += 1
    log = TecDocRateLog(id=_seq, **kw)
    db.add(log)
    db.commit()
    return log


class TestRateLimiter:
    def test_current_hour_usage_starts_at_zero(self, db):
        assert rate_limiter.current_hour_usage(db) == 0

    def test_log_increases_usage(self, db):
        _add_log(db, endpoint="get_articles", article="BR001", success=True, response_ms=120)
        assert rate_limiter.current_hour_usage(db) == 1

    def test_remaining_after_log(self, db):
        _add_log(db, endpoint="search", article="TST001")
        assert rate_limiter.remaining(db) == TECDOC_HOURLY_LIMIT - 1

    def test_is_exhausted_false_by_default(self, db):
        assert rate_limiter.is_exhausted(db) is False

    def test_hourly_stats_returns_recent_hours(self, db):
        now = datetime.utcnow()
        for i in range(3):
            _add_log(db, endpoint="test", called_at=now)
        stats = rate_limiter.hourly_stats(db, hours=6)
        assert len(stats) == 6
        assert any(s["count"] > 0 for s in stats)

    def test_log_stores_all_fields(self, db):
        _add_log(db, endpoint="get_details", article="BR999", brand_id=42,
                  success=False, response_ms=500)
        log = db.query(TecDocRateLog).first()
        assert log.endpoint == "get_details"
        assert log.article == "BR999"
        assert log.brand_id == 42
        assert log.success is False
        assert log.response_ms == 500
