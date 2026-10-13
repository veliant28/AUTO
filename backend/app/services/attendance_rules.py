"""Правила учёта рабочего времени: рабочее окно и дедлайн авто-фиксации.

Единый источник логики для API-эндпоинтов и celery-таска. Настройки берутся
из SiteSettings; у сессии со снимком (work_start_at/work_end_at/auto_close_at)
используются сохранённые значения — поэтому правки настроек не меняют расчёт
и момент авто-закрытия уже зафиксированных сессий.
"""
from datetime import datetime, timedelta
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

from app.models import SiteSettings
from app.models.attendance import AttendanceSession

# Авто-выход по умолчанию: конец смены + 15 минут (когда автофиксация не задана)
AUTO_CLOCKOUT_GRACE_MINUTES = 15

DEFAULT_START_HM = "09:00"
DEFAULT_END_HM = "18:00"


def parse_hm(value, default: str = DEFAULT_START_HM) -> Tuple[int, int]:
    """HH:MM из настроек; при мусоре — значение по умолчанию."""
    try:
        h, m = (int(x) for x in str(value or default).split(":"))
        if not (0 <= h < 24 and 0 <= m < 60):
            raise ValueError
        return h, m
    except (ValueError, TypeError):
        h, m = (int(x) for x in default.split(":"))
        return h, m


def _parse_auto_hm(value) -> Optional[Tuple[int, int]]:
    """Явно заданное время авто-фиксации; None — не задано/некорректно (легаси)."""
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        h, m = (int(x) for x in raw.split(":"))
        if not (0 <= h < 24 and 0 <= m < 60):
            raise ValueError
        return h, m
    except (ValueError, TypeError):
        return None


def _parse_date(work_date: str) -> Tuple[int, int, int]:
    try:
        y, m, d = (int(x) for x in str(work_date).split("-"))
        datetime(y, m, d)
        return y, m, d
    except (ValueError, TypeError):
        raise ValueError(f"Invalid work_date: {work_date!r}")


def compute_window_utc(
    work_date: str, tz: ZoneInfo, s: SiteSettings
) -> Tuple[datetime, datetime]:
    """[start, end) смены для даты work_date, naive UTC. Конец <= начала → следующий день."""
    y, m, d = _parse_date(work_date)
    start_h, start_m = parse_hm(s.work_start_time, DEFAULT_START_HM)
    end_h, end_m = parse_hm(s.work_end_time, DEFAULT_END_HM)
    start_local = datetime(y, m, d, start_h, start_m, tzinfo=tz)
    end_local = datetime(y, m, d, end_h, end_m, tzinfo=tz)
    if end_local <= start_local:
        end_local += timedelta(days=1)
    return (
        start_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
        end_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
    )


def compute_auto_close_at_utc(
    work_date: str, tz: ZoneInfo, s: SiteSettings
) -> datetime:
    """Момент (naive UTC), после которого открытая сессия авто-закрывается.

    Если задан site_settings.work_auto_clockout_time (HH:MM) — ближайшее
    наступление этого wall-time после начала смены (корректно для смен,
    переходящих через полночь). Если поле пустое/некорректное — прежнее
    поведение: конец смены + 15 минут.
    """
    auto = _parse_auto_hm(s.work_auto_clockout_time)
    if auto is None:
        _, end_utc = compute_window_utc(work_date, tz, s)
        return end_utc + timedelta(minutes=AUTO_CLOCKOUT_GRACE_MINUTES)
    y, m, d = _parse_date(work_date)
    start_h, start_m = parse_hm(s.work_start_time, DEFAULT_START_HM)
    deadline_local = datetime(y, m, d, auto[0], auto[1], tzinfo=tz)
    start_local = datetime(y, m, d, start_h, start_m, tzinfo=tz)
    while deadline_local <= start_local:
        deadline_local += timedelta(days=1)
    return deadline_local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def snapshot_for_date(
    work_date: str, tz: ZoneInfo, s: SiteSettings
) -> Tuple[datetime, datetime, datetime]:
    """Снимок правил для новой сессии: окно смены + дедлайн авто-фиксации."""
    start_utc, end_utc = compute_window_utc(work_date, tz, s)
    return start_utc, end_utc, compute_auto_close_at_utc(work_date, tz, s)


def session_window(
    sess: AttendanceSession, tz: ZoneInfo, s: SiteSettings
) -> Tuple[datetime, datetime]:
    """Окно смены сессии: снимок, если есть; иначе — текущие настройки."""
    if sess.work_start_at is not None and sess.work_end_at is not None:
        return sess.work_start_at, sess.work_end_at
    return compute_window_utc(sess.work_date, tz, s)


def session_auto_close_at(
    sess: AttendanceSession, tz: ZoneInfo, s: SiteSettings
) -> datetime:
    """Дедлайн авто-закрытия сессии: снимок, если есть; иначе — текущие настройки."""
    if sess.auto_close_at is not None:
        return sess.auto_close_at
    return compute_auto_close_at_utc(sess.work_date, tz, s)
