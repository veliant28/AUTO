"""Attendance maintenance: auto clock-out for forgotten exits."""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.db import SessionLocal
from app.models import SiteSettings
from app.models.attendance import AttendanceSession
from app.services.attendance_rules import session_auto_close_at
from app.workers import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="auto_clockout")
def auto_clockout():
    """Авто-выход: сотрудник забыл зафиксировать выход.

    Если есть открытая сессия (вход без выхода) и её дедлайн автофиксации
    (work_auto_clockout_time; пусто — «конец смены + 15 минут») уже наступил —
    закрываем её фактическим временем закрытия (auto_clock_out=True). Дедлайн
    берётся из снимка сессии (зафиксирован на входе) — правки настроек позже
    не сдвигают авто-закрытие. Часы в табеле всё равно обрезаются до окна
    смены из снимка/настроек.
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
                close_at = session_auto_close_at(sess, tz, s)
            except ValueError:
                continue
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
