"""Заявки на изменение наценки: валидация и автоматизация одобрения."""
import pytest

from app.models.parts import PartCategory
from app.models.pricing import PriceRule, PriceRuleHistory
from app.models.requests import (
    CATEGORY_PRICING_CHANGE,
    Request,
    RequestCategory,
    RequestEvent,
    RequestStatus,
)


class _FakeApplyTask:
    @staticmethod
    def delay():
        class _Result:
            id = "test-task"

        return _Result()


@pytest.fixture
def pricing_category(db):
    category = RequestCategory(
        name="Цена",
        code=CATEGORY_PRICING_CHANGE,
        response_minutes=240,
        resolve_minutes=1440,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@pytest.fixture
def part_category(db):
    category = PartCategory(name="Тормозные колодки")
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@pytest.fixture(autouse=True)
def fake_apply_task(monkeypatch):
    import app.workers.tasks.pricing_tasks as pricing_tasks

    monkeypatch.setattr(pricing_tasks, "apply_margins_task", _FakeApplyTask)


def _create_request(client, headers, category_id: int, payload: dict):
    return client.post(
        "/api/v1/admin/requests",
        headers=headers,
        json={
            "category_id": category_id,
            "description": "Изменить наценку",
            "payload": payload,
        },
    )


def test_category_margin_applied_on_approval(
    client, db, admin_headers, pricing_category, part_category
):
    resp = _create_request(
        client,
        admin_headers,
        pricing_category.id,
        {
            "pricing_target": "category",
            "pricing_category_id": part_category.id,
            "pricing_target_name": part_category.name,
            "pricing_old_margin": 0,
            "margin_percent": 15,
        },
    )
    assert resp.status_code == 200, resp.text
    request_id = resp.json()["id"]

    approved = client.post(
        f"/api/v1/admin/requests/{request_id}/approve",
        headers=admin_headers,
        json={},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "resolved"

    db.expire_all()
    rule = (
        db.query(PriceRule)
        .filter(
            PriceRule.type == "category",
            PriceRule.category_id == part_category.id,
        )
        .one()
    )
    assert float(rule.margin_percent) == 15
    assert rule.is_active is True

    history = (
        db.query(PriceRuleHistory)
        .filter(PriceRuleHistory.price_rule_id == rule.id)
        .one()
    )
    assert float(history.old_percent) == 0
    assert float(history.new_percent) == 15

    events = (
        db.query(RequestEvent)
        .filter(
            RequestEvent.request_id == request_id,
            RequestEvent.event_type == "automation",
        )
        .all()
    )
    lines = " ".join(e.details or "" for e in events)
    assert "15%" in lines
    assert "test-task" in lines


def test_general_margin_applied_on_approval(
    client, db, admin_headers, pricing_category
):
    db.add(
        PriceRule(
            type="general",
            margin_percent=10,
            is_active=True,
        )
    )
    db.commit()

    resp = _create_request(
        client,
        admin_headers,
        pricing_category.id,
        {
            "pricing_target": "general",
            "pricing_target_name": "Общая наценка",
            "pricing_old_margin": 10,
            "margin_percent": 12,
        },
    )
    assert resp.status_code == 200, resp.text
    request_id = resp.json()["id"]

    approved = client.post(
        f"/api/v1/admin/requests/{request_id}/approve",
        headers=admin_headers,
        json={},
    )
    assert approved.status_code == 200, approved.text

    db.expire_all()
    rule = db.query(PriceRule).filter(PriceRule.type == "general").one()
    assert float(rule.margin_percent) == 12
    assert rule.is_active is True


def test_zero_category_margin_removes_override(
    client, db, admin_headers, pricing_category, part_category
):
    db.add(
        PriceRule(
            type="category",
            category_id=part_category.id,
            margin_percent=15,
            is_active=True,
        )
    )
    db.commit()

    resp = _create_request(
        client,
        admin_headers,
        pricing_category.id,
        {
            "pricing_target": "category",
            "pricing_category_id": part_category.id,
            "pricing_target_name": part_category.name,
            "pricing_old_margin": 15,
            "margin_percent": 0,
        },
    )
    assert resp.status_code == 200, resp.text
    approved = client.post(
        f"/api/v1/admin/requests/{resp.json()['id']}/approve",
        headers=admin_headers,
        json={},
    )
    assert approved.status_code == 200, approved.text

    db.expire_all()
    rule = (
        db.query(PriceRule)
        .filter(
            PriceRule.type == "category",
            PriceRule.category_id == part_category.id,
        )
        .one()
    )
    assert float(rule.margin_percent) == 0
    assert rule.is_active is False


def test_pricing_reason_required(
    client, db, admin_headers, pricing_category
):
    resp = client.post(
        "/api/v1/admin/requests",
        headers=admin_headers,
        json={
            "category_id": pricing_category.id,
            "description": "   ",
            "payload": {
                "pricing_target": "general",
                "margin_percent": 10,
            },
        },
    )
    assert resp.status_code == 400, resp.text
    assert "причину" in resp.text
    assert db.query(Request).count() == 0


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"pricing_target": "general", "margin_percent": 101},
        {"pricing_target": "general", "margin_percent": -1},
        {
            "pricing_target": "category",
            "pricing_category_id": 999999,
            "margin_percent": 10,
        },
    ],
)
def test_pricing_payload_is_validated(
    client, db, admin_headers, pricing_category, payload
):
    resp = _create_request(
        client, admin_headers, pricing_category.id, payload
    )
    assert resp.status_code == 400, resp.text
    assert db.query(Request).count() == 0
