"""Автофиксация выхода: настройка времени + закрытие сессий и попадание часов в табель."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import SiteSettings, User
from app.models.attendance import AttendanceSession
from app.api.v1.endpoints.admin.attendance import _auto_close_moment

KYIV = ZoneInfo("Europe/Kiev")


def _settings(db: Session, **overrides) -> SiteSettings:
    defaults = dict(
        timezone="Europe/Kiev",
        work_start_time="09:00",
        work_end_time="18:00",
        work_auto_clockout_time=None,
    )
    defaults.update(overrides)
    s = SiteSettings(**defaults)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _yesterday_kiev() -> str:
    return (datetime.now(KYIV) - timedelta(days=1)).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Настройка: PUT / GET
# ---------------------------------------------------------------------------

def test_settings_persist_auto_clockout_time(client, admin_headers):
    r = client.put(
        "/api/v1/admin/settings",
        headers=admin_headers,
        json={"work_auto_clockout_time": "19:30"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["work_auto_clockout_time"] == "19:30"

    g = client.get("/api/v1/admin/settings", headers=admin_headers)
    assert g.json()["work_auto_clockout_time"] == "19:30"

    # пустая строка = сброс к легаси «конец смены + 15 минут» (NULL)
    r = client.put(
        "/api/v1/admin/settings",
        headers=admin_headers,
        json={"work_auto_clockout_time": "  "},
    )
    assert r.status_code == 200
    assert r.json()["work_auto_clockout_time"] is None


def test_settings_rejects_invalid_auto_clockout_time(client, admin_headers):
    for bad in ("25:00", "9:60", "abc", "18:30:00"):
        r = client.put(
            "/api/v1/admin/settings",
            headers=admin_headers,
            json={"work_auto_clockout_time": bad},
        )
        assert r.status_code == 400, bad


def test_settings_response_default_null(db: Session):
    """Без значения поле отсутствует (None) — фронт понимает это как «конец + 15»."""
    s = _settings(db)
    assert s.work_auto_clockout_time is None


# ---------------------------------------------------------------------------
# Вычисление момента авто-выхода
# ---------------------------------------------------------------------------

def test_moment_legacy_fallback_is_end_plus_15(db: Session):
    s = _settings(db)  # авто не задано
    # 2026-09-02: конец 18:00 в Киеве (лето, UTC+3) = 15:00 UTC + 15 мин
    assert _auto_close_moment("2026-09-02", KYIV, s) == datetime(
        2026, 9, 2, 15, 15
    )


def test_moment_explicit_time_same_day(db: Session):
    s = _settings(db, work_auto_clockout_time="18:30")
    # 18:30 Киев = 15:30 UTC
    assert _auto_close_moment("2026-09-02", KYIV, s) == datetime(
        2026, 9, 2, 15, 30
    )


def test_moment_crosses_midnight(db: Session):
    # Конец смены 23:50, автофиксация 00:05 → момент наступит в следующий день
    s = _settings(
        db, work_start_time="09:00", work_end_time="23:50",
        work_auto_clockout_time="00:05",
    )
    # 2026-09-03 00:05 Киев = 2026-09-02 21:05 UTC
    assert _auto_close_moment("2026-09-02", KYIV, s) == datetime(
        2026, 9, 2, 21, 5
    )


def test_moment_night_shift(db: Session):
    # Ночная смена 23:00 → 00:30; авто 00:45 — следующий день после начала смены
    s = _settings(
        db, work_start_time="23:00", work_end_time="00:30",
        work_auto_clockout_time="00:45",
    )
    # 2026-09-03 00:45 Киев = 2026-09-02 21:45 UTC
    assert _auto_close_moment("2026-09-02", KYIV, s) == datetime(
        2026, 9, 2, 21, 45
    )


def test_moment_garbage_stored_falls_back_to_legacy(db: Session):
    s = _settings(db, work_auto_clockout_time="не-время")
    assert _auto_close_moment("2026-09-02", KYIV, s) == datetime(
        2026, 9, 2, 15, 15
    )


# ---------------------------------------------------------------------------
# Ленивое авто-закрытие + часы в табеле
# ---------------------------------------------------------------------------

def test_open_session_is_auto_closed_and_hours_land_in_timesheet(
    client, db: Session, admin_user, admin_headers
):
    """Сессия без выхода закрывается после времени автофиксации, часы попадают в табель."""
    yest = _yesterday_kiev()
    _settings(db, work_start_time="09:00", work_end_time="18:00",
              work_auto_clockout_time="23:59")

    y, m, d = (int(x) for x in yest.split("-"))
    # вход 10:00 местного = 07:00 UTC; выхода нет
    clock_in = datetime(y, m, d, 7, 0)
    sess = AttendanceSession(
        user_id=admin_user.id,
        work_date=yest,
        clock_in_at=clock_in,
    )
    db.add(sess)
    db.commit()

    month = yest[:7]
    r = client.get(
        "/api/v1/admin/attendance/timesheet",
        headers=admin_headers,
        params={"month": month},
    )
    assert r.status_code == 200, r.text

    db.refresh(sess)
    assert sess.clock_out_at is not None
    assert sess.auto_clock_out is True

    # часы: 10:00–18:00 местного = 8 часов (окно обрезает даже позднее закрытие)
    row = next(u for u in r.json()["users"] if u["user_id"] == admin_user.id)
    assert row["days"].get(yest) == 480
    assert row["total_minutes"] == 480
