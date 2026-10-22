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
from app.services.requests_service import contact_display_name


def _category(
    db,
    code: str,
    name: str = None,
    allowed_roles=None,
    take_roles=None,
    response_minutes: int = 120,
    resolve_minutes: int = 1440,
) -> RequestCategory:
    c = RequestCategory(
        name=name or code,
        code=code,
        allowed_roles=allowed_roles,
        take_roles=take_roles,
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
            "contact_last_name": "Иванов",
            "contact_first_name": "Иван",
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
    # Контакт хранится двумя полями — общей строки в заявке больше нет
    assert request.payload["contact_last_name"] == "Иванов"
    assert request.payload["contact_first_name"] == "Иван"
    assert "contact_name" not in request.payload
    assert request.response_due_at is not None and request.due_at is not None


def test_public_b2b_application_requires_contact(client, db):
    """Без фамилии и имени контакт не принимаем: заявку некому адресовать."""
    _category(db, CATEGORY_B2B_REGISTRATION, "Регистрация B2B-клиента")

    base = {
        "company": "СТО Без Контакта",
        "phone": "+380501112233",
        "email": "nobody@example.com",
    }
    assert (
        client.post("/api/v1/requests/b2b-application", json=base).status_code == 422
    )
    # Одного поля из двух тоже мало
    partial = client.post(
        "/api/v1/requests/b2b-application",
        json={**base, "contact_last_name": "Иванов"},
    )
    assert partial.status_code == 422


def test_public_b2b_application_accepts_legacy_contact(
    client, db, admin_headers, sent_emails
):
    """Старые сборки витрины присылают контакт одной строкой — заявку берём.

    Такая заявка остаётся рабочей до конца: имя для журнала и писем собирается
    из `contact_name`, а создание пользователя разбирает строку на фамилию и имя.
    """
    _category(db, CATEGORY_B2B_REGISTRATION, "Регистрация B2B-клиента")
    db.add(Role(name="b2b", description="corporate"))
    db.commit()

    resp = client.post(
        "/api/v1/requests/b2b-application",
        json={
            "company": "СТО Старая Сборка",
            "contact_name": "Сидоров Семён",
            "phone": "+380501113344",
            "email": "legacy@example.com",
        },
    )
    assert resp.status_code == 200, resp.text
    request = (
        db.query(Request)
        .filter(Request.number == resp.json()["request_number"])
        .one()
    )
    assert request.payload["contact_name"] == "Сидоров Семён"
    assert contact_display_name(request.payload) == "Сидоров Семён"

    approved = client.post(
        f"/api/v1/admin/requests/{request.id}/approve",
        headers=admin_headers,
        json={},
    )
    assert approved.status_code == 200, approved.text
    user = db.query(User).filter(User.email == "legacy@example.com").one()
    assert user.last_name == "Сидоров"
    assert user.first_name == "Семён"
    assert user.full_name == "Сидоров Семён"


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
        json={"category_code": "other", "description": "Заявка оператора"},
    )
    assert own.status_code == 200, own.text
    own_id = own.json()["id"]

    assigned = client.post(
        "/api/v1/admin/requests",
        headers=_headers(client, manager),
        json={
            "category_code": "other",
            "description": "Заявка менеджера",
        },
    )
    assert assigned.status_code == 200, assigned.text
    assigned_id = assigned.json()["id"]
    assign_resp = client.post(
        f"/api/v1/admin/requests/{assigned_id}/assign",
        headers=admin_headers,
        json={"assignee_id": operator.id},
    )
    assert assign_resp.status_code == 200, assign_resp.text

    foreign = client.post(
        "/api/v1/admin/requests",
        headers=_headers(client, manager),
        json={"category_code": "other", "description": "Чужая заявка"},
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
            "contact_last_name": "Петров",
            "contact_first_name": "Пётр",
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
    # Фамилия и имя берутся из полей заявки, без разбора строки
    assert user.last_name == "Петров"
    assert user.first_name == "Пётр"
    assert user.full_name == "Петров Пётр"

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


def test_assignee_must_match_category_take_roles(
    client, db, admin_headers, admin_user, operator_role, manager_role
):
    category = _category(db, "other", "Прочее", take_roles=["admin"])
    operator = _user(db, "op-assign@example.com", operator_role)
    manager = _user(db, "mg-assign@example.com", manager_role)

    denied_create = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={
            "category_code": "other",
            "description": "Заявка с недопустимым исполнителем",
            "assignee_id": operator.id,
        },
    )
    assert denied_create.status_code == 403

    created = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "description": "Заявка"},
    )
    assert created.status_code == 200, created.text
    request_id = created.json()["id"]

    denied_assign = client.post(
        f"/api/v1/admin/requests/{request_id}/assign",
        headers=admin_headers,
        json={"assignee_id": operator.id},
    )
    assert denied_assign.status_code == 403

    allowed_assign = client.post(
        f"/api/v1/admin/requests/{request_id}/assign",
        headers=admin_headers,
        json={"assignee_id": admin_user.id},
    )
    assert allowed_assign.status_code == 200, allowed_assign.text

    # Менеджер может создать заявку, но не входит в «Кто может брать»
    manager_request = client.post(
        "/api/v1/admin/requests",
        headers=_headers(client, manager),
        json={"category_code": "other", "description": "Заявка менеджера"},
    )
    assert manager_request.status_code == 200, manager_request.text
    denied_actor = client.post(
        f"/api/v1/admin/requests/{manager_request.json()['id']}/assign",
        headers=_headers(client, manager),
        json={"assignee_id": admin_user.id},
    )
    assert denied_actor.status_code == 403


def test_only_admin_can_assign_even_if_take_roles_allow_manager(
    client, db, admin_headers, admin_user, manager_role
):
    _category(db, "other", "Прочее", take_roles=["admin", "manager"])
    manager = _user(db, "mg-assign-allowed@example.com", manager_role)

    denied_create = client.post(
        "/api/v1/admin/requests",
        headers=_headers(client, manager),
        json={
            "category_code": "other",
            "description": "Заявка менеджера",
            "assignee_id": admin_user.id,
        },
    )
    assert denied_create.status_code == 403

    created = client.post(
        "/api/v1/admin/requests",
        headers=_headers(client, manager),
        json={"category_code": "other", "description": "Заявка менеджера"},
    )
    assert created.status_code == 200, created.text
    request_id = created.json()["id"]

    denied_assign = client.post(
        f"/api/v1/admin/requests/{request_id}/assign",
        headers=_headers(client, manager),
        json={"assignee_id": admin_user.id},
    )
    assert denied_assign.status_code == 403

    allowed = client.post(
        f"/api/v1/admin/requests/{request_id}/assign",
        headers=admin_headers,
        json={"assignee_id": manager.id},
    )
    assert allowed.status_code == 200, allowed.text


def test_status_requires_assignee_and_take_role(
    client, db, admin_headers, admin_user, operator_role
):
    _category(db, "other", "Прочее", take_roles=["admin"])
    operator = _user(db, "op-status@example.com", operator_role)
    created = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "description": "Заявка"},
    )
    assert created.status_code == 200, created.text
    request_id = created.json()["id"]

    # Без назначения исполнителя статус менять нельзя
    unassigned = client.post(
        f"/api/v1/admin/requests/{request_id}/status",
        headers=admin_headers,
        json={"status": "resolved"},
    )
    assert unassigned.status_code == 403

    # Даже назначенный исполнитель не может менять статус, если его роли нет
    # в настройках категории
    request = db.query(Request).filter(Request.id == request_id).one()
    request.assignee_id = operator.id
    db.commit()
    denied_role = client.post(
        f"/api/v1/admin/requests/{request_id}/status",
        headers=_headers(client, operator),
        json={"status": "resolved"},
    )
    assert denied_role.status_code == 403

    request.assignee_id = None
    db.commit()
    assigned = client.post(
        f"/api/v1/admin/requests/{request_id}/assign",
        headers=admin_headers,
        json={"assignee_id": admin_user.id},
    )
    assert assigned.status_code == 200, assigned.text
    resolved = client.post(
        f"/api/v1/admin/requests/{request_id}/status",
        headers=admin_headers,
        json={"status": "resolved"},
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "resolved"


# ---------------------------------------------------------------------------
# Сроки и алерты
# ---------------------------------------------------------------------------

def test_alerts_due_soon_and_overdue(client, db, admin_headers):
    _category(db, "other", "Прочее", response_minutes=120, resolve_minutes=1440)
    first = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "description": "Скоро срок"},
    ).json()
    second = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "description": "Просрочена"},
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
        json={"category_code": "other", "description": "Заявка в колокольчик"},
    )
    data = client.get("/api/v1/admin/notifications", headers=admin_headers).json()
    assert any(
        item["category_code"] == "other" for item in data["new_requests"]
    )


def test_other_request_requires_description(client, db, admin_headers):
    _category(db, "other", "Прочее")

    blank = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "description": "   "},
    )
    assert blank.status_code == 400
    assert "описание" in blank.text.lower()
    assert db.query(Request).count() == 0

    created = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "description": "Описание заявки"},
    )
    assert created.status_code == 200, created.text

    db.expire_all()
    request = db.query(Request).filter(Request.id == created.json()["id"]).one()
    assert request.description == "Описание заявки"


def test_delete_request_removes_comments(client, db, admin_headers):
    _category(db, "other", "Прочее")
    created = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={"category_code": "other", "description": "На удаление"},
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
            "contact_last_name": "Петров",
            "contact_first_name": "Пётр",
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
    # Карточка клиента показывает фамилию и имя отдельными полями
    assert app_row["contact_last_name"] == "Петров"
    assert app_row["contact_first_name"] == "Пётр"
    assert app_row["status"] == "new"

    # Клиент без заявок — пустой список
    other = _user(db, "noapps@example.com", b2b_role)
    empty = client.get(
        f"/api/v1/admin/monitor/clients/u{other.id}/b2b", headers=admin_headers
    ).json()
    assert empty == {"applications": [], "total": 0}


def test_client_turnover_by_months(client, db, admin_headers):
    """Оборот за 12 месяцев: суммы по месяцам, отменённые заказы не входят."""
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

    now = datetime.utcnow()
    this_month = datetime(now.year, now.month, 1, 10, 0, 0)
    # Предыдущий месяц (год назад — заведомо вне окна в 12 месяцев)
    prev_year, prev_month = (now.year - 1, now.month) if now.month > 1 else (now.year - 2, 12)
    prev_month_dt = datetime(prev_year, prev_month, 15, 10, 0, 0)

    _order(this_month, 1500.0)
    _order(this_month.replace(day=2, hour=18), 500.0)
    _order(this_month, 999.0, OrderStatus.CANCELLED)
    _order(prev_month_dt, 100.0)  # вне окна

    resp = client.get(
        f"/api/v1/admin/monitor/clients/u{buyer.id}/turnover",
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    months = resp.json()["months"]
    assert len(months) == 12

    by_month = {m["month"]: m for m in months}
    current_key = f"{now.year:04d}-{now.month:02d}"
    # Отмена не считается, прошлогодний заказ в окно не попадает
    assert by_month[current_key] == {
        "month": current_key,
        "total": 2000.0,
        "orders": 2,
    }
    # Пустые месяцы присутствуют с нулями — график всегда на 12 столбцов
    assert sum(1 for m in months if m["orders"] == 0) == 11

    # Клиент без заказов — 12 нулевых месяцев
    other = _user(db, "nomoney@example.com", role)
    empty = client.get(
        f"/api/v1/admin/monitor/clients/u{other.id}/turnover",
        headers=admin_headers,
    ).json()["months"]
    assert len(empty) == 12
    assert all(m["total"] == 0 and m["orders"] == 0 for m in empty)


def test_client_turnover_ignores_legacy_month_param(client, db, admin_headers):
    """Параметр месяца больше не участвует: график всегда на 12 месяцев."""
    role = Role(name="retail", description="retail")
    db.add(role)
    db.commit()
    db.refresh(role)
    buyer = _user(db, "buyer2@example.com", role)

    resp = client.get(
        f"/api/v1/admin/monitor/clients/u{buyer.id}/turnover?month=2026-13",
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["months"]) == 12
