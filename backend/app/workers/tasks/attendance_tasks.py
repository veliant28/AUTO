"""Attendance maintenance: auto clock-out for forgotten exits."""
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.db import SessionLocal
from app.models import SiteSettings
from app.models.attendance import AttendanceSession
from app.workers import celery_app

logger = logging.getLogger(__name__)

AUTO_CLOCKOUT_GRACE_MINUTES = 15


@celery_app.task(name="auto_clockout")
def auto_clockout():
    """Авто-выход: сотрудник забыл зафиксировать выход.

    Если есть открытая сессия (вход без выхода) и время автофиксации выхода
    из настроек (work_auto_clockout_time; пусто — «конец смены + 15 минут»)
    уже наступило — закрываем её фактическим временем закрытия
    (auto_clock_out=True). Часы в табеле всё равно обрезаются до окна из настроек.
    """
    db = SessionLocal()
    try:
        s = db.query(SiteSettings).first()
        if not s:
            return
        tz_name = s.timezone or "Europe/Kiev"
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("Europe/Kiev")

        start_h, start_m = _parse_hm(s.work_start_time, "09:00")
        end_h, end_m = _parse_hm(s.work_end_time, "18:00")

        # Явно выбранное время автофиксации (HH:MM); None = легаси «конец + 15»
        auto_h = auto_m = None
        auto_raw = (s.work_auto_clockout_time or "").strip()
        if auto_raw:
            try:
                ah, am = (int(x) for x in auto_raw.split(":"))
                if not (0 <= ah < 24 and 0 <= am < 60):
                    raise ValueError
                auto_h, auto_m = ah, am
            except (ValueError, TypeError):
                auto_h = auto_m = None

        now_utc = datetime.now(ZoneInfo("UTC")).replace(tzinfo=None)
        today_str = datetime.now(tz).strftime("%Y-%m-%d")

        sessions = (
            db.query(AttendanceSession)
            .filter(
                AttendanceSession.clock_out_at.is_(None),
                AttendanceSession.work_date <= today_str,
            )
            .all()
        )

        closed = 0
        for sess in sessions:
            try:
                y, m, d = (int(x) for x in sess.work_date.split("-"))
            except (ValueError, TypeError):
                continue
            start_local = datetime(y, m, d, start_h, start_m, tzinfo=tz)
            end_local = datetime(y, m, d, end_h, end_m, tzinfo=tz)
            if end_local <= start_local:
                end_local += timedelta(days=1)
            if auto_h is not None:
                # Ближайшее наступление выбранного времени после начала смены
                deadline_local = datetime(y, m, d, auto_h, auto_m, tzinfo=tz)
                while deadline_local <= start_local:
                    deadline_local += timedelta(days=1)
                close_at = (
                    deadline_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
                )
            else:
                end_utc = end_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
                close_at = end_utc + timedelta(minutes=AUTO_CLOCKOUT_GRACE_MINUTES)
            if now_utc >= close_at:
                # Время выхода — по факту (момент закрытия)
                sess.clock_out_at = now_utc
                sess.auto_clock_out = True
                closed += 1

        db.commit()
        if closed:
            logger.info(f"Auto clock-out: closed {closed} attendance sessions")
    except Exception as e:
        db.rollback()
        logger.error(f"Auto clock-out failed: {e}")
        raise
    finally:
        db.close()


def _parse_hm(value: str, default: str) -> tuple[int, int]:
    try:
        h, m = (int(x) for x in str(value or default).split(":"))
        if not (0 <= h < 24 and 0 <= m < 60):
            raise ValueError
        return h, m
    except (ValueError, TypeError):
        h, m = (int(x) for x in default.split(":"))
        return h, m
