"""Ручное редактирование табеля (timesheet manual overrides)."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from app.models import Role, User, Permission, RolePermission
from app.models.attendance import AttendanceSession

# Рабочее окно из настроек по умолчанию: 09:00–18:00 в Europe/Kiev (летом UTC+3)
# → 06:00–15:00 UTC. Сессии ниже заданы в naive UTC.
SHIFT_START_UTC = datetime(2026, 9, 2, 6, 0, 0)


def _session(user_id: int, start: datetime, minutes: int) -> AttendanceSession:
    return AttendanceSession(
        user_id=user_id,
        work_date="2026-09-02",
        clock_in_at=start,
        clock_out_at=start + timedelta(minutes=minutes),
    )


@pytest.fixture
def operator_role(db: Session):
    role = Role(name="operator", description="operator role")
    db.add(role)
    db.flush()
    # оператору выдаём только просмотр табеля — без права редактирования
    perm = db.query(Permission).filter_by(codename="attendance.view").first()
    if perm is None:
        # большой явный id, чтобы не конфликтовать с фикстурами conftest (ids 1..N)
        max_id = db.query(Permission).count() or 0
        perm = Permission(
            id=50000 + max_id, codename="attendance.view", description="", group_name=""
        )
        db.add(perm)
        db.flush()
    db.add(RolePermission(role_id=role.id, permission_id=perm.id))
    db.commit()
    db.refresh(role)
    return role


@pytest.fixture
def operator_user(db: Session, operator_role):
    user = User(
        email="operator@example.com",
        password_hash="$2b$12$6qW0DnNZjgNuB6GWlEGGv.DRbOeaRywnAzKoxhMnhYzfamBRSE2xG",
        first_name="Op",
        last_name="Operator",
        phone="+380501234567",
        avatar_index=0,
        role_id=operator_role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def operator_headers(client, operator_user):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": operator_user.email, "password": "test_password"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _get_timesheet(client, headers, month="2026-09"):
    r = client.get("/api/v1/admin/attendance/timesheet", headers=headers, params={"month": month})
    assert r.status_code == 200, r.text
    return r.json()


def _user_row(payload, user_id: int):
    return next(u for u in payload["users"] if u["user_id"] == user_id)


def _put_manual(client, headers, entries):
    return client.put(
        "/api/v1/admin/attendance/timesheet/manual",
        headers=headers,
        json={"entries": entries},
    )


def _get_history(client, headers, month="2026-09"):
    r = client.get(
        "/api/v1/admin/attendance/timesheet/manual-history",
        headers=headers,
        params={"month": month},
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------


def test_requires_attendance_edit_permission(
    client, operator_user, operator_headers, admin_headers
):
    """Без attendance.edit ручные правки и история недоступны (403)."""
    entry = {"user_id": operator_user.id, "work_date": "2026-09-02", "minutes": 480}
    assert _put_manual(client, operator_headers, [entry]).status_code == 403
    r = client.get(
        "/api/v1/admin/attendance/timesheet/manual-history",
        headers=operator_headers,
    )
    assert r.status_code == 403
    # у админа (есть attendance.edit) всё доступно
    assert _put_manual(client, admin_headers, [entry]).status_code == 200


def test_manual_override_wins_and_tracking_does_not_overwrite(
    client, db: Session, operator_user, admin_headers
):
    """Ручные часы перекрывают авторасчёт, и новые сессии их не затирают."""
    db.add(_session(operator_user.id, SHIFT_START_UTC, 480))  # авто 8:00
    db.commit()

    # администратор ставит 9:00 вручную
    r = _put_manual(
        client,
        admin_headers,
        [{"user_id": operator_user.id, "work_date": "2026-09-02", "minutes": 540}],
    )
    assert r.status_code == 200
    assert r.json()["changed"] == 1

    payload = _get_timesheet(client, admin_headers)
    row = _user_row(payload, operator_user.id)
    assert row["days"]["2026-09-02"] == 540
    assert row["manual_days"] == {"2026-09-02": 540}
    assert row["auto_days"] == {"2026-09-02": 480}  # авторасчёт не потерян
    assert row["total_minutes"] == 540

    # сотрудник «доработал» ещё 30 минут — авто стало бы 510, но правка (540) важнее
    db.add(_session(operator_user.id, datetime(2026, 9, 2, 14, 30), 30))
    db.commit()

    payload = _get_timesheet(client, admin_headers)
    row = _user_row(payload, operator_user.id)
    assert row["days"]["2026-09-02"] == 540
    assert row["manual_days"] == {"2026-09-02": 540}
    assert row["auto_days"] == {"2026-09-02": 510}
    assert row["total_minutes"] == 540


def test_manual_edits_are_logged_and_reset_restores_auto(
    client, db: Session, operator_user, admin_headers
):
    db.add(_session(operator_user.id, SHIFT_START_UTC, 480))
    db.add(_session(operator_user.id, datetime(2026, 9, 2, 14, 30), 30))  # авто 510
    db.commit()

    assert _put_manual(
        client,
        admin_headers,
        [{"user_id": operator_user.id, "work_date": "2026-09-02", "minutes": 540}],
    ).json()["changed"] == 1
    # повтор того же значения — no-op, лог не растёт
    assert _put_manual(
        client,
        admin_headers,
        [{"user_id": operator_user.id, "work_date": "2026-09-02", "minutes": 540}],
    ).json()["changed"] == 0
    assert _put_manual(
        client,
        admin_headers,
        [{"user_id": operator_user.id, "work_date": "2026-09-02", "minutes": 420}],
    ).json()["changed"] == 1
    # сброс → снова авторасчёт
    assert _put_manual(
        client,
        admin_headers,
        [{"user_id": operator_user.id, "work_date": "2026-09-02", "minutes": None}],
    ).json()["changed"] == 1

    payload = _get_timesheet(client, admin_headers)
    row = _user_row(payload, operator_user.id)
    assert row["days"]["2026-09-02"] == 510
    assert row["manual_days"] == {}
    assert row["total_minutes"] == 510

    history = _get_history(client, admin_headers)["items"]
    assert len(history) == 3
    # порядок: сначала последнее изменение
    assert history[0]["minutes_before"] == 420
    assert history[0]["minutes_after"] is None  # сброс
    assert history[1]["minutes_before"] == 540
    assert history[1]["minutes_after"] == 420
    assert history[2]["minutes_before"] is None  # установка поверх авторасчёта
    assert history[2]["minutes_after"] == 540

    for item in history:
        assert item["employee"]["user_id"] == operator_user.id
        assert item["employee"]["first_name"] == "Op"
        assert item["employee"]["last_name"] == "Operator"
        assert item["employee"]["phone"] == "+380501234567"
        assert item["employee"]["email"] == "operator@example.com"
        assert item["changed_by"]["email"] == "admin@example.com"
        assert item["changed_at"]


def test_history_is_scoped_by_month(
    client, db: Session, operator_user, admin_headers
):
    db.add(_session(operator_user.id, SHIFT_START_UTC, 480))
    db.commit()
    _put_manual(
        client,
        admin_headers,
        [
            {"user_id": operator_user.id, "work_date": "2026-09-02", "minutes": 540},
            {"user_id": operator_user.id, "work_date": "2026-08-05", "minutes": 300},
        ],
    )
    assert len(_get_history(client, admin_headers, month="2026-09")["items"]) == 1
    assert len(_get_history(client, admin_headers, month="2026-08")["items"]) == 1
    # месяц без изменений — пустой список (фронт скрывает таблицу)
    assert _get_history(client, admin_headers, month="2026-07")["items"] == []


def test_manual_entry_validation(
    client, db: Session, operator_user, admin_headers, retail_role
):
    # > 24 часов → 422
    r = _put_manual(
        client,
        admin_headers,
        [{"user_id": operator_user.id, "work_date": "2026-09-02", "minutes": 2000}],
    )
    assert r.status_code == 422
    # несуществующая дата → 400
    r = _put_manual(
        client,
        admin_headers,
        [{"user_id": operator_user.id, "work_date": "2026-13-45", "minutes": 60}],
    )
    assert r.status_code == 400
    # сотрудник вне видимого штата (retail) → 400
    retail_user = User(
        email="retail_staff@example.com",
        password_hash="$2b$12$6qW0DnNZjgNuB6GWlEGGv.DRbOeaRywnAzKoxhMnhYzfamBRSE2xG",
        first_name="Ret",
        avatar_index=0,
        role_id=retail_role.id,
    )
    db.add(retail_user)
    db.commit()
    db.refresh(retail_user)
    r = _put_manual(
        client,
        admin_headers,
        [{"user_id": retail_user.id, "work_date": "2026-09-02", "minutes": 60}],
    )
    assert r.status_code == 400
    # неактивный сотрудник → 400
    operator_user.is_active = False
    db.commit()
    r = _put_manual(
        client,
        admin_headers,
        [{"user_id": operator_user.id, "work_date": "2026-09-02", "minutes": 60}],
    )
    assert r.status_code == 400


def test_manual_edit_visible_for_viewers_without_highlight_data_flag(
    client, db: Session, operator_user, operator_headers, admin_headers
):
    """Сотрудник с правом просмотра видит скорректированные часы, но без правок."""
    db.add(_session(operator_user.id, SHIFT_START_UTC, 480))
    db.commit()
    # администратор правит день оператора
    assert _put_manual(
        client,
        admin_headers,
        [{"user_id": operator_user.id, "work_date": "2026-09-02", "minutes": 540}],
    ).status_code == 200
    payload = _get_timesheet(client, operator_headers)
    row = _user_row(payload, operator_user.id)
    # оператор видит только себя и скорректированное значение
    assert len(payload["users"]) == 1
    assert row["days"]["2026-09-02"] == 540
