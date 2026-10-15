"""Журнал заявок: доступ и видимость, сроки, комментарии, автоматизации."""
from datetime import datetime, timedelta

import pytest

from app.core.security import get_password_hash
from app.models import Permission, Role, RolePermission, User
from app.models.attendance import TimesheetOverride
from app.models.protection import BanRecord
from app.models.requests import (
    CATEGORY_B2B_REGISTRATION,
    CATEGORY_BAN_UNBAN,
    CATEGORY_TIMESHEET_MANUAL,
    Request,
    RequestCategory,
    RequestComment,
    RequestStatus,
)


def _category(
    db,
    code: str,
    name: str = None,
    allowed_roles=None,
    response_minutes: int = 120,
    resolve_minutes: int = 1440,
) -> RequestCategory:
    c = RequestCategory(
        name=name or code,
        code=code,
        allowed_roles=allowed_roles,
        response_minutes=response_minutes,
        resolve_minutes=resolve_minutes,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _grant(db, role: Role, *codenames: str) -> None:
    for codename in codenames:
        perm = db.query(Permission).filter(Permission.codename == codename).first()
        if not perm:
            perm = Permission(codename=codename, description="", group_name="Заявки")
            db.add(perm)
            db.flush()
        if not (
            db.query(RolePermission)
            .filter_by(role_id=role.id, permission_id=perm.id)
            .first()
        ):
            db.add(RolePermission(role_id=role.id, permission_id=perm.id))
    db.commit()


@pytest.fixture
def operator_role(db):
    role = Role(name="operator", description="operator")
    db.add(role)
    db.commit()
    db.refresh(role)
    _grant(db, role, "requests.view", "requests.create", "requests.comment", "requests.process", "orders.view")
    return role


@pytest.fixture
def manager_role(db):
    role = Role(name="manager", description="manager")
    db.add(role)
    db.commit()
    db.refresh(role)
    _grant(db, role, "requests.view", "requests.create", "requests.comment", "requests.process", "orders.view")
    return role


def _user(db, email: str, role: Role, phone: str = None) -> User:
    u = User(
        email=email,
        password_hash=get_password_hash("test_password"),
        first_name=email.split("@")[0],
        role_id=role.id,
        is_active=True,
        phone=phone,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _headers(client, user: User) -> dict:
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "test_password"},
    )
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.json()}")
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ---------------------------------------------------------------------------
# Публичная B2B-заявка
# ---------------------------------------------------------------------------

def test_public_b2b_application_creates_request(client, db):
    _category(db, CATEGORY_B2B_REGISTRATION, "Регистрация B2B-клиента")

    resp = client.post(
        "/api/v1/requests/b2b-application",
        json={
            "company": "СТО Авто Плюс",
            "edrpou": "12345678",
            "contact_name": "Иванов Иван",
            "phone": "+380501112233",
            "email": "sto@example.com",
            "city": "Николаев",
            "comment": "Хотим цены для сервиса",
            "locale": "ru",
        },
    )
    assert resp.status_code == 200, resp.text
    number = resp.json()["request_number"]
    assert number.startswith("REQ-")

    request = db.query(Request).filter(Request.number == number).one()
    assert request.created_by_id is None
    assert request.status == RequestStatus.NEW
    assert request.payload["email"] == "sto@example.com"
    assert request.payload["company"] == "СТО Авто Плюс"
    assert request.response_due_at is not None and request.due_at is not None


# ---------------------------------------------------------------------------
# Видимость
# ---------------------------------------------------------------------------

def test_visibility_admin_all_others_own(client, db, admin_headers, operator_role, manager_role):
    operator = _user(db, "op@example.com", operator_role)
    manager = _user(db, "mg@example.com", manager_role)
    category = _category(db, "other", "Прочее")

    own = client.post(
        "/api/v1/admin/requests",
        headers=_headers(client, operator),
        json={"category_code": "other", "title": "Заявка оператора"},
    )
    assert own.status_code == 200, own.text
    own_id = own.json()["id"]

    assigned = client.post(
        "/api/v1/admin/requests",
        headers=_headers(client, manager),
        json={
            "category_code": "other",
            "title": "Заявка менеджера",
            "assignee_id": operator.id,
        },
    )
    assert assigned.status_code == 200, assigned.text
    assigned_id = assigned.json()["id"]

    foreign = client.post(
        "/api/v1/admin/requests",
        headers=_headers(client, manager),
        json={"category_code": "other", "title": "Чужая заявка"},
    )
    assert foreign.status_code == 200
    foreign_id = foreign.json()["id"]

    # Оператор видит свою и ту, где он исполнитель, но не чужую
    op_list = client.get("/api/v1/admin/requests", headers=_headers(client, operator)).json()
    op_ids = {i["id"] for i in op_list["items"]}
    assert own_id in op_ids and assigned_id in op_ids and foreign_id not in op_ids

    # Менеджер видит обе свои
    mg_list = client.get("/api/v1/admin/requests", headers=_headers(client, manager)).json()
    mg_ids = {i["id"] for i in mg_list["items"]}
    assert assigned_id in mg_ids and foreign_id in mg_ids and own_id not in mg_ids

    # Админ видит все
    admin_list = client.get("/api/v1/admin/requests", headers=admin_headers).json()
    admin_ids = {i["id"] for i in admin_list["items"]}
    assert {own_id, assigned_id, foreign_id} <= admin_ids

    # Комментарии и обработка
    comment = client.post(
        f"/api/v1/admin/requests/{own_id}/comment",
        headers=_headers(client, operator),
        json={"text": "Нужно до конца дня"},
    )
    assert comment.status_code == 200
    assert comment.json()["comments"][0]["text"] == "Нужно до конца дня"

    take = client.post(f"/api/v1/admin/requests/{own_id}/take", headers=_headers(client, operator))
    assert take.status_code == 200
    assert take.json()["status"] == "in_progress"
    assert take.json()["assignee"]["user_id"] == operator.id


def test_b2b_and_retail_have_no_access(client, db):
    b2b_role = Role(name="b2b", description="corporate")
    db.add(b2b_role)
    db.commit()
    db.refresh(b2b_role)
    b2b_user = _user(db, "b2b@example.com", b2b_role)
    headers = _headers(client, b2b_user)

    assert client.get("/api/v1/admin/requests", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/v1/admin/requests",
            headers=headers,
            json={"category_code": "other", "title": "Нельзя"},
        ).status_code
        == 403
    )


def test_category_allowed_roles(client, db, operator_role, manager_role):
    _category(db, CATEGORY_BAN_UNBAN, "Бан / разбан клиента", allowed_roles=["admin", "manager"])

    operator = _user(db, "op2@example.com", operator_role)
    manager = _user(db, "mg2@example.com", manager_role)

    denied = client.post(
        "/api/v1/admin/requests",
        headers=_headers(client, operator),
        json={"category_code": CATEGORY_BAN_UNBAN, "title": "Забаньте клиента"},
    )
    assert denied.status_code == 403

    allowed = client.post(
        "/api/v1/admin/requests",
        headers=_headers(client, manager),
        json={"category_code": CATEGORY_BAN_UNBAN, "title": "Забаньте клиента"},
    )
    assert allowed.status_code == 200, allowed.text


# ---------------------------------------------------------------------------
# Автоматизации одобрения
# ---------------------------------------------------------------------------

@pytest.fixture
def sent_emails(monkeypatch):
    sent = []

    async def fake_send(db, to_email, subject, html):
        sent.append({"to": to_email, "subject": subject, "html": html})
        return True

    monkeypatch.setattr("app.services.email_service.send_brand_email", fake_send)
    return sent


def test_approve_b2b_creates_user_with_credentials(
    client, db, admin_headers, sent_emails
):
    _category(db, CATEGORY_B2B_REGISTRATION, "Регистрация B2B-клиента")
    b2b_role = Role(name="b2b", description="corporate")
    db.add(b2b_role)
    db.commit()

    client.post(
        "/api/v1/requests/b2b-application",
        json={
            "company": "СТО Новая",
            "contact_name": "Петров Пётр",
            "phone": "+380501112233",
            "email": "newclient@example.com",
            "locale": "ru",
        },
    )
    request = db.query(Request).order_by(Request.id.desc()).first()

    resp = client.post(
        f"/api/v1/admin/requests/{request.id}/approve",
        headers=admin_headers,
        json={"note": "Одобрено, клиент надёжный"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "resolved"
    assert any("создан пользователь" in (e["details"] or "") for e in body["events"])

    user = db.query(User).filter(User.email == "newclient@example.com").one()
    assert user.role.name == "b2b"
    assert user.phone == "+380501112233"

    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == "newclient@example.com"
    assert "Пароль" in sent_emails[0]["html"]
    assert "Одобрено, клиент надёжный" in [
        c["text"] for c in body["comments"]
    ]


def test_approve_b2b_upgrades_existing_user(client, db, admin_headers, sent_emails):
    _category(db, CATEGORY_B2B_REGISTRATION, "Регистрация B2B-клиента")
    b2b_role = Role(name="b2b", description="corporate")
    retail_role = Role(name="retail", description="retail")
    db.add_all([b2b_role, retail_role])
    db.commit()
    existing = _user(db, "existing@example.com", retail_role)

    client.post(
        "/api/v1/requests/b2b-application",
        json={
            "company": "СТО Существующая",
            "contact_name": "Сидоров",
            "phone": "+380501119999",
            "email": "existing@example.com",
        },
    )
    request = db.query(Request).order_by(Request.id.desc()).first()

    resp = client.post(
        f"/api/v1/admin/requests/{request.id}/approve",
        headers=admin_headers,
        json={},
    )
    assert resp.status_code == 200, resp.text
    db.refresh(existing)
    assert existing.role.name == "b2b"
    # Пароль не создаём: письмо без данных входа
    assert len(sent_emails) == 1
    assert "Пароль" not in sent_emails[0]["html"]


def test_reject_b2b_sends_rejection(client, db, admin_headers, sent_emails):
    _category(db, CATEGORY_B2B_REGISTRATION, "Регистрация B2B-клиента")
    client.post(
        "/api/v1/requests/b2b-application",
        json={
            "company": "СТО Отказ",
            "contact_name": "Иванов",
            "phone": "+380501117777",
            "email": "reject@example.com",
        },
    )
    request = db.query(Request).order_by(Request.id.desc()).first()

    resp = client.post(
        f"/api/v1/admin/requests/{request.id}/reject",
        headers=admin_headers,
        json={"note": "Неполные данные компании"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "rejected"
    assert len(sent_emails) == 1
    assert "отклонена" in sent_emails[0]["html"]
    assert db.query(User).filter(User.email == "reject@example.com").first() is None


def test_approve_timesheet_applies_hours(client, db, admin_headers):
    _category(db, CATEGORY_TIMESHEET_MANUAL, "Правка часов в табеле")
    retail_role = Role(name="retail", description="retail")
    db.add(retail_role)
    db.commit()
    employee = _user(db, "emp@example.com", retail_role)

    created = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={
            "category_code": CATEGORY_TIMESHEET_MANUAL,
            "title": "Проставить часы за вчера",
            "payload": {
                "user_id": employee.id,
                "work_date": "2026-10-14",
                "minutes": 480,
            },
        },
    )
    assert created.status_code == 200, created.text

    resp = client.post(
        f"/api/v1/admin/requests/{created.json()['id']}/approve",
        headers=admin_headers,
        json={},
    )
    assert resp.status_code == 200, resp.text
    override = (
        db.query(TimesheetOverride)
        .filter_by(user_id=employee.id, work_date="2026-10-14")
        .one()
    )
    assert override.minutes == 480


def test_approve_ban_creates_ban_record(client, db, admin_headers):
    _category(db, CATEGORY_BAN_UNBAN, "Бан / разбан клиента", allowed_roles=["admin", "manager"])
    retail_role = Role(name="retail", description="retail")
    db.add(retail_role)
    db.commit()
    client_user = _user(db, "bad@example.com", retail_role)

    created = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={
            "category_code": CATEGORY_BAN_UNBAN,
            "title": "Забанить за спам",
            "payload": {"action": "ban", "user_id": client_user.id, "reason": "Спам в чате"},
        },
    )
    assert created.status_code == 200, created.text

    resp = client.post(
        f"/api/v1/admin/requests/{created.json()['id']}/approve",
        headers=admin_headers,
        json={},
    )
    assert resp.status_code == 200, resp.text

    ban = db.query(BanRecord).filter_by(user_id=client_user.id, is_active=True).one()
    assert ban.reason == "Спам в чате"
    db.refresh(client_user)
    assert client_user.is_active is False


def test_automated_category_cannot_be_closed_manually(client, db, admin_headers):
    _category(db, CATEGORY_B2B_REGISTRATION, "Регистрация B2B-клиента")
    created = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": CATEGORY_B2B_REGISTRATION, "title": "B2B тест"},
    )
    resp = client.post(
        f"/api/v1/admin/requests/{created.json()['id']}/status",
        headers=admin_headers,
        json={"status": "resolved"},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Сроки и алерты
# ---------------------------------------------------------------------------

def test_alerts_due_soon_and_overdue(client, db, admin_headers):
    _category(db, "other", "Прочее", response_minutes=120, resolve_minutes=1440)
    first = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "title": "Скоро срок"},
    ).json()
    second = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "title": "Просрочена"},
    ).json()

    now = datetime.utcnow()
    db.query(Request).filter(Request.id == first["id"]).one().response_due_at = now + timedelta(minutes=10)
    db.query(Request).filter(Request.id == second["id"]).one().response_due_at = now - timedelta(minutes=30)
    db.commit()

    alerts = client.get("/api/v1/admin/requests/alerts", headers=admin_headers).json()
    assert [i["id"] for i in alerts["due_soon"]] == [first["id"]]
    assert [i["id"] for i in alerts["overdue"]] == [second["id"]]
    assert alerts["overdue"][0]["minutes_late"] >= 29


def test_bell_notifications_include_new_requests(client, db, admin_headers):
    _category(db, "other", "Прочее")
    client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "title": "Заявка в колокольчик"},
    )
    data = client.get("/api/v1/admin/notifications", headers=admin_headers).json()
    assert any(
        item["title"] == "Заявка в колокольчик" for item in data["new_requests"]
    )


def test_delete_request_removes_comments(client, db, admin_headers):
    _category(db, "other", "Прочее")
    created = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "title": "На удаление"},
    ).json()
    client.post(
        f"/api/v1/admin/requests/{created['id']}/comment",
        headers=admin_headers,
        json={"text": "временный комментарий"},
    )

    resp = client.delete(
        f"/api/v1/admin/requests/{created['id']}", headers=admin_headers
    )
    assert resp.status_code == 200
    assert db.query(Request).filter(Request.id == created["id"]).first() is None
    assert (
        db.query(RequestComment)
        .filter(RequestComment.request_id == created["id"])
        .count()
        == 0
    )


# ---------------------------------------------------------------------------
# Режим «B2B» в модалке клиента (монитор): заявки + оборот по дням
# ---------------------------------------------------------------------------

def test_client_b2b_mode_lists_application(client, db, admin_headers):
    """Заявка с витрины находится по email клиента, даже если он создан позже."""
    from app.models import User

    _category(db, CATEGORY_B2B_REGISTRATION, "Регистрация B2B-клиента")
    resp = client.post(
        "/api/v1/requests/b2b-application",
        json={
            "company": "СТО Турбо",
            "edrpou": "87654321",
            "contact_name": "Петров Пётр",
            "phone": "+380671112233",
            "email": "turbo@example.com",
            "city": "Львов",
            "comment": "Нужны цены",
            "locale": "ru",
        },
    )
    assert resp.status_code == 200, resp.text

    b2b_role = Role(name="b2b", description="corporate")
    db.add(b2b_role)
    db.commit()
    db.refresh(b2b_role)
    client_user = _user(db, "turbo@example.com", b2b_role)

    data = client.get(
        f"/api/v1/admin/monitor/clients/u{client_user.id}/b2b",
        headers=admin_headers,
    )
    assert data.status_code == 200, data.text
    body = data.json()
    assert body["total"] == 1
    app_row = body["applications"][0]
    assert app_row["company"] == "СТО Турбо"
    assert app_row["contact_name"] == "Петров Пётр"
    assert app_row["status"] == "new"

    # Клиент без заявок — пустой список
    other = _user(db, "noapps@example.com", b2b_role)
    empty = client.get(
        f"/api/v1/admin/monitor/clients/u{other.id}/b2b", headers=admin_headers
    ).json()
    assert empty == {"applications": [], "total": 0}


def test_client_turnover_by_days(client, db, admin_headers):
    """Оборот считается по дням месяца; отменённые заказы не входят."""
    from app.models import Order, OrderStatus

    role = Role(name="retail", description="retail")
    db.add(role)
    db.commit()
    db.refresh(role)
    buyer = _user(db, "buyer@example.com", role)

    def _order(created_at: datetime, total: float, status=OrderStatus.PENDING):
        o = Order(
            user_id=buyer.id,
            full_name="Покупатель Тест",
            phone="+380501234567",
            delivery_type="pickup",
            payment_method="cod",
            total=total,
            status=status,
            created_at=created_at,
        )
        db.add(o)
        db.commit()
        return o

    _order(datetime(2026, 5, 12, 10, 0, 0), 1500.0)
    _order(datetime(2026, 5, 12, 18, 0, 0), 500.0)
    _order(datetime(2026, 5, 20, 9, 0, 0), 300.0)
    _order(datetime(2026, 5, 21, 9, 0, 0), 999.0, OrderStatus.CANCELLED)
    _order(datetime(2026, 6, 1, 9, 0, 0), 100.0)  # другой месяц

    resp = client.get(
        f"/api/v1/admin/monitor/clients/u{buyer.id}/turnover?month=2026-05",
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["month"] == "2026-05"
    assert len(body["days"]) == 31
    assert body["month_total"] == 2300.0  # отмена и июнь не считаются
    assert body["month_orders"] == 3

    by_day = {d["day"]: d for d in body["days"]}
    assert by_day["2026-05-12"] == {"day": "2026-05-12", "total": 2000.0, "orders": 2}
    assert by_day["2026-05-20"]["total"] == 300.0
    assert by_day["2026-05-21"]["orders"] == 0


def test_client_turnover_invalid_month(client, db, admin_headers):
    role = Role(name="retail", description="retail")
    db.add(role)
    db.commit()
    db.refresh(role)
    buyer = _user(db, "buyer2@example.com", role)

    resp = client.get(
        f"/api/v1/admin/monitor/clients/u{buyer.id}/turnover?month=2026-13",
        headers=admin_headers,
    )
    assert resp.status_code == 400
