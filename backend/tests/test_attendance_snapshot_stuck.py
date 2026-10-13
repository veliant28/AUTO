"""Снимок правил в сессии + залипшие сессии (ручное закрытие, идемпотентность)."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import SiteSettings
from app.models.attendance import AttendanceSession

KYIV = ZoneInfo("Europe/Kiev")
UTC = ZoneInfo("UTC")


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


def _local(y, m, d, hh, mm) -> datetime:
    """Местное (Киев) время → naive UTC, как хранит бэкенд."""
    return datetime(y, m, d, hh, mm, tzinfo=KYIV).astimezone(UTC).replace(tzinfo=None)


def _yesterday_kiev() -> str:
    return (datetime.now(KYIV) - timedelta(days=1)).strftime("%Y-%m-%d")


def _today_kiev() -> str:
    return datetime.now(KYIV).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Снимок правил на момент входа
# ---------------------------------------------------------------------------

def test_clock_in_snapshots_rules_and_settings_change_does_not_affect_hours(
    client, db: Session, admin_user, admin_headers
):
    """Смена настроек после входа не меняет ни часы прошлой сессии, ни новые входы."""
    _settings(db)

    r = client.post("/api/v1/admin/attendance/clock-in", headers=admin_headers)
    assert r.status_code == 200, r.text

    sess = (
        db.query(AttendanceSession)
        .filter(AttendanceSession.user_id == admin_user.id)
        .order_by(AttendanceSession.id)
        .first()
    )
    y, m, d = (int(x) for x in sess.work_date.split("-"))
    # Снимок: окно 09:00–18:00 и дедлайн «конец + 15 мин» на дату сессии
    assert sess.work_start_at == _local(y, m, d, 9, 0)
    assert sess.work_end_at == _local(y, m, d, 18, 0)
    assert sess.auto_close_at == _local(y, m, d, 18, 15)

    # Отработанный день: вход 09:30 местного, выход — конец окна
    sess.clock_in_at = _local(y, m, d, 9, 30)
    sess.clock_out_at = sess.work_end_at
    db.commit()

    # Меняем конец смены: окно 09:00–17:00 — на расчёт старой сессии не влияет
    r = client.put(
        "/api/v1/admin/settings",
        headers=admin_headers,
        json={"work_end_time": "17:00"},
    )
    assert r.status_code == 200, r.text

    r = client.get(
        "/api/v1/admin/attendance/timesheet",
        headers=admin_headers,
        params={"month": sess.work_date[:7]},
    )
    assert r.status_code == 200, r.text
    row = next(u for u in r.json()["users"] if u["user_id"] == admin_user.id)
    # 09:30–18:00 по СТАРОМУ окну = 8.5 ч = 510 мин (по новому было бы 450)
    assert row["days"].get(sess.work_date) == 510

    # Новый вход после смены настроек — по новым правилам (17:00 → 14:00 UTC)
    r = client.post("/api/v1/admin/attendance/clock-in", headers=admin_headers)
    assert r.status_code == 200, r.text
    new_sess = (
        db.query(AttendanceSession)
        .filter(AttendanceSession.user_id == admin_user.id)
        .order_by(AttendanceSession.id.desc())
        .first()
    )
    assert new_sess.id != sess.id
    assert new_sess.work_end_at == _local(y, m, d, 17, 0)


def test_session_without_snapshot_falls_back_to_current_settings(
    client, db: Session, admin_user, admin_headers
):
    """Строка без снимка (старые записи) считается по текущим настройкам."""
    _settings(db)
    yest = _yesterday_kiev()
    y, m, d = (int(x) for x in yest.split("-"))

    sess = AttendanceSession(
        user_id=admin_user.id,
        work_date=yest,
        clock_in_at=_local(y, m, d, 10, 0),
        clock_out_at=_local(y, m, d, 16, 0),
        # снимок не задан — NULL
    )
    db.add(sess)
    db.commit()

    r = client.get(
        "/api/v1/admin/attendance/timesheet",
        headers=admin_headers,
        params={"month": yest[:7]},
    )
    row = next(u for u in r.json()["users"] if u["user_id"] == admin_user.id)
    # окно 09:00–18:00: 10:00–16:00 = 6 ч = 360 мин
    assert row["days"].get(yest) == 360

    # Меняем окно — строка без снимка пересчитывается по НОВЫМ настройкам
    client.put(
        "/api/v1/admin/settings",
        headers=admin_headers,
        json={"work_end_time": "15:00"},
    )
    r = client.get(
        "/api/v1/admin/attendance/timesheet",
        headers=admin_headers,
        params={"month": yest[:7]},
    )
    row = next(u for u in r.json()["users"] if u["user_id"] == admin_user.id)
    # окно 09:00–15:00: 10:00–15:00 = 5 ч = 300 мин
    assert row["days"].get(yest) == 300


def test_auto_close_uses_snapshot_deadline(
    client, db: Session, admin_user, admin_headers
):
    """Дедлайн авто-закрытия берётся из снимка, а не из текущих настроек."""
    # Текущие настройки: дедлайн в прошлом (23:59 вчера) — закрыть «всё открытое»
    _settings(db, work_auto_clockout_time="23:59")
    yest = _yesterday_kiev()
    y, m, d = (int(x) for x in yest.split("-"))
    now = datetime.now(UTC).replace(tzinfo=None)

    future = AttendanceSession(
        user_id=admin_user.id,
        work_date=yest,
        clock_in_at=_local(y, m, d, 10, 0),
        auto_close_at=now + timedelta(days=1),  # снимок: ещё рано закрывать
    )
    past = AttendanceSession(
        user_id=admin_user.id,
        work_date=yest,
        clock_in_at=_local(y, m, d, 11, 0),
        auto_close_at=now - timedelta(hours=1),  # снимок: уже можно закрывать
    )
    db.add_all([future, past])
    db.commit()
    db.refresh(future)
    db.refresh(past)

    r = client.get(
        "/api/v1/admin/attendance/timesheet",
        headers=admin_headers,
        params={"month": yest[:7]},
    )
    assert r.status_code == 200, r.text

    db.refresh(future)
    db.refresh(past)
    assert future.clock_out_at is None  # снимок в будущем — не трогаем
    assert past.clock_out_at is not None  # снимок в прошлом — закрыта
    assert past.auto_clock_out is True


# ---------------------------------------------------------------------------
# Залипшая сессия: /today показывает, clock-out закрывает вручную
# ---------------------------------------------------------------------------

def test_stuck_session_visible_and_manual_close(
    client, db: Session, admin_user, admin_headers
):
    """Залипшую сессию видно в /today; clock-out закрывает её; повтор — без ошибки."""
    _settings(db, work_auto_clockout_time="23:59")
    yest = _yesterday_kiev()
    today = _today_kiev()
    y, m, d = (int(x) for x in yest.split("-"))

    stuck = AttendanceSession(
        user_id=admin_user.id,
        work_date=yest,
        clock_in_at=_local(y, m, d, 10, 0),
    )
    db.add(stuck)
    db.commit()
    db.refresh(stuck)

    # /today отдаёт залипшую, но НЕ закрывает её (должен быть возможен ручной выход)
    r = client.get("/api/v1/admin/attendance/today", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert [s["work_date"] for s in body["stuck_sessions"]] == [yest]
    assert body["open_session"] is None
    db.refresh(stuck)
    assert stuck.clock_out_at is None

    # Сегодняшняя открытая сессия рядом
    ty, tm, td = (int(x) for x in today.split("-"))
    today_sess = AttendanceSession(
        user_id=admin_user.id,
        work_date=today,
        clock_in_at=_local(ty, tm, td, 10, 0),
    )
    db.add(today_sess)
    db.commit()
    db.refresh(today_sess)

    r = client.post("/api/v1/admin/attendance/clock-out", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert {c["work_date"] for c in body["closed_sessions"]} == {yest, today}
    assert body["stuck_sessions"] == []
    assert body["open_session"] is None

    db.refresh(stuck)
    db.refresh(today_sess)
    assert stuck.clock_out_at is not None
    assert stuck.auto_clock_out is True  # залипшая закрыта не в момент ухода
    assert today_sess.clock_out_at is not None
    assert today_sess.auto_clock_out is False  # обычный ручной выход

    # Повторное нажатие «Выход»: не ошибка, просто нечего закрывать
    r = client.post("/api/v1/admin/attendance/clock-out", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["closed_sessions"] == []
