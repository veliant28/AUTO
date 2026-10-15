"""Варианты доставки клиента из заказов (режим «Доставка» в модалке).

Правила дедупликации: самовывоз не дублируется; отделения/почтоматы — по
городу и номеру; курьер — город + улица + дом (регистр не важен, квартира
варианты не различает). Учитываются все заказы, включая отменённые.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.models import Order, OrderStatus
from app.services.delivery_variants import (
    MAX_VARIANTS,
    aggregate_variants,
    delivery_group,
    monthly_type_counts,
)

BASE_TIME = datetime(2026, 5, 1, 12, 0)


def _o(**kw) -> SimpleNamespace:
    """Заказ-заглушка: только атрибуты, которые читает сервис."""
    base = dict(
        delivery_type="warehouse",
        delivery_city=None,
        delivery_city_ref=None,
        delivery_city_label=None,
        delivery_warehouse=None,
        delivery_warehouse_ref=None,
        delivery_warehouse_label=None,
        delivery_street_ref=None,
        delivery_street_label=None,
        delivery_house=None,
        delivery_apartment=None,
        created_at=BASE_TIME,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _wh(city, label, ref=None, **kw) -> SimpleNamespace:
    return _o(
        delivery_type="warehouse",
        delivery_city_label=city,
        delivery_warehouse_label=label,
        delivery_warehouse_ref=ref,
        **kw,
    )


def _cr(city, street, house, ref=None, **kw) -> SimpleNamespace:
    return _o(
        delivery_type="courier",
        delivery_city_label=city,
        delivery_street_label=street,
        delivery_street_ref=ref,
        delivery_house=house,
        **kw,
    )


# ---------------------------------------------------------------------------
# Группы типов
# ---------------------------------------------------------------------------

def test_delivery_group_maps_both_vocabularies():
    assert delivery_group("pickup") == "pickup"
    assert delivery_group("warehouse") == "warehouse"
    assert delivery_group("postomat") == "warehouse"  # лексика накладной НП
    assert delivery_group("courier") == "courier"
    assert delivery_group("address") == "courier"
    assert delivery_group(" Warehouse ") == "warehouse"
    assert delivery_group(None) is None
    assert delivery_group("drone") is None


# ---------------------------------------------------------------------------
# Список вариантов: дедупликация
# ---------------------------------------------------------------------------

def test_pickup_not_duplicated_and_rises_to_top():
    """Самовывоз — одна плитка: повторное использование поднимает её вверх."""
    orders = [
        _o(delivery_type="pickup", created_at=BASE_TIME),
        _wh("Киев", "Отделение №123", created_at=BASE_TIME + timedelta(days=1)),
        _o(delivery_type="pickup", created_at=BASE_TIME + timedelta(days=2)),
    ]
    variants = aggregate_variants(orders)
    assert [v["type"] for v in variants] == ["pickup", "warehouse"]
    pickup = variants[0]
    assert pickup["count"] == 2
    assert pickup["last_used_at"] == BASE_TIME + timedelta(days=2)
    assert pickup["city_label"] is None and pickup["warehouse_label"] is None


def test_warehouse_different_branches_are_different_variants():
    """Другой номер отделения — другая доставка."""
    orders = [
        _wh("Киев", "Отделение №123", ref="wh-123"),
        _wh("Киев", "Отделение №45", ref="wh-45"),
    ]
    variants = aggregate_variants(orders)
    assert len(variants) == 2
    assert {v["warehouse_label"] for v in variants} == {
        "Отделение №123",
        "Отделение №45",
    }


def test_warehouse_different_cities_are_different_variants():
    """Одинаковый номер в разных городах — разные доставки."""
    orders = [
        _wh("Киев", "Почтомат №54023", ref="pm-54023"),
        _wh("Днепр", "Почтомат №54023", ref="pm-54023"),
    ]
    assert len(aggregate_variants(orders)) == 2


def test_warehouse_legacy_label_merges_into_ref_variant():
    """Легаси-заказ без ref подтягивается к варианту с ref по городу и названию."""
    orders = [
        _wh("Киев", "Отделение №123", ref=None),
        _wh("Киев", "Отделение №123", ref="wh-123"),
    ]
    variants = aggregate_variants(orders)
    assert len(variants) == 1
    assert variants[0]["count"] == 2


def test_courier_house_letter_case_insensitive():
    """«2А» и «2а» — один и тот же адрес (регистр не создаёт вариант)."""
    orders = [
        _cr("Николаев", "проспект Корабелов", "2А"),
        _cr("Николаев", "проспект Корабелов", "2а"),
    ]
    variants = aggregate_variants(orders)
    assert len(variants) == 1
    assert variants[0]["count"] == 2


def test_courier_different_addresses_are_different_variants():
    orders = [
        _cr("Николаев", "проспект Корабелов", "2А"),
        _cr("Николаев", "проспект Октябрьский", "327/2"),
    ]
    assert len(aggregate_variants(orders)) == 2


def test_courier_apartment_does_not_split_variant():
    """Квартира варианты не различает — показываем последнюю."""
    orders = [
        _cr("Киев", "ул. Хрещатик", "1", delivery_apartment="5",
            created_at=BASE_TIME),
        _cr("Киев", "ул. Хрещатик", "1", delivery_apartment="7",
            created_at=BASE_TIME + timedelta(days=1)),
    ]
    variants = aggregate_variants(orders)
    assert len(variants) == 1
    assert variants[0]["count"] == 2
    assert variants[0]["apartment"] == "7"
    assert variants[0]["house"] == "1"


def test_top_variant_is_from_last_order():
    orders = [
        _cr("Киев", "ул. Хрещатик", "1", created_at=BASE_TIME),
        _o(delivery_type="pickup", created_at=BASE_TIME + timedelta(hours=1)),
    ]
    assert aggregate_variants(orders)[0]["type"] == "pickup"


def test_orders_without_delivery_type_skipped():
    """Легаси-заказ без типа доставки — не вариант, а отсутствие данных."""
    orders = [
        _o(delivery_type=None),
        _o(delivery_type=""),
        _wh("Киев", "Отделение №123", ref="wh-123"),
    ]
    variants = aggregate_variants(orders)
    assert len(variants) == 1
    assert variants[0]["type"] == "warehouse"


def test_unknown_type_variant_keeps_raw_type():
    orders = [_o(delivery_type="drone")]
    variants = aggregate_variants(orders)
    assert len(variants) == 1
    assert variants[0]["type"] == "other"
    assert variants[0]["raw_type"] == "drone"


def test_variants_limited_to_100_most_recent():
    orders = [
        _wh("Киев", f"Отделение №{i}", ref=f"wh-{i}",
            created_at=BASE_TIME + timedelta(minutes=i))
        for i in range(MAX_VARIANTS + 5)
    ]
    variants = aggregate_variants(orders)
    assert len(variants) == MAX_VARIANTS
    # Свежие остаются, самые старые (5 шт.) вытеснены
    assert variants[0]["warehouse_label"] == f"Отделение №{MAX_VARIANTS + 4}"
    labels = {v["warehouse_label"] for v in variants}
    assert "Отделение №0" not in labels


# ---------------------------------------------------------------------------
# Месяцы за 12 месяцев
# ---------------------------------------------------------------------------

def test_monthly_counts_always_12_buckets():
    months = monthly_type_counts([], now=datetime(2026, 1, 15))
    assert len(months) == 12
    assert months[0]["month"] == "2025-02"
    assert months[-1]["month"] == "2026-01"
    assert all(m["pickup"] == 0 and m["warehouse"] == 0 and m["courier"] == 0 for m in months)


def test_monthly_counts_by_group_and_year_rollover():
    now = datetime(2026, 1, 15)
    orders = [
        _o(delivery_type="pickup", created_at=datetime(2026, 1, 3)),
        _o(delivery_type="postomat", created_at=datetime(2026, 1, 4)),  # в группу отделений
        _o(delivery_type="address", created_at=datetime(2025, 12, 20)),  # в группу курьера
        _o(delivery_type="drone", created_at=datetime(2026, 1, 5)),  # неизвестный — мимо
        _o(delivery_type=None, created_at=datetime(2026, 1, 6)),  # без типа — мимо
        _o(delivery_type="courier", created_at=datetime(2024, 1, 1)),  # старше 12 мес — мимо
    ]
    months = {m["month"]: m for m in monthly_type_counts(orders, now=now)}
    assert months["2026-01"]["pickup"] == 1
    assert months["2026-01"]["warehouse"] == 1
    assert months["2026-01"]["courier"] == 0
    assert months["2025-12"]["courier"] == 1


# ---------------------------------------------------------------------------
# Эндпоинт
# ---------------------------------------------------------------------------

def _db_order(db, user_id: int, **kw) -> Order:
    order = Order(
        user_id=user_id,
        status=kw.pop("status", OrderStatus.PENDING),
        total=100,
        full_name="Test User",
        phone="+380501234567",
        **kw,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def test_endpoint_requires_permission(client):
    r = client.get("/api/v1/admin/monitor/clients/u1/delivery")
    assert r.status_code == 401


def test_endpoint_returns_variants_and_months(client, db, admin_headers, test_user):
    _db_order(
        db, test_user.id,
        delivery_type="warehouse",
        delivery_city_label="Киев",
        delivery_warehouse_label="Отделение №123",
        delivery_warehouse_ref="wh-123",
    )
    # Отменённый заказ тоже участвует: это сигнал, а не шум
    _db_order(
        db, test_user.id,
        status=OrderStatus.CANCELLED,
        delivery_type="courier",
        delivery_city_label="Николаев",
        delivery_street_label="проспект Корабелов",
        delivery_house="2А",
    )

    r = client.get(
        f"/api/v1/admin/monitor/clients/u{test_user.id}/delivery",
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    assert len(body["months"]) == 12
    types = [v["type"] for v in body["variants"]]
    assert sorted(types) == ["courier", "warehouse"]
    # Верхний вариант — из последнего заказа (курьер оформлен позже)
    assert body["variants"][0]["type"] == "courier"
    assert body["variants"][0]["house"] == "2А"
    current_month = body["months"][-1]
    assert current_month["warehouse"] + current_month["courier"] == 2


def test_endpoint_anonymous_is_empty(client, admin_headers):
    r = client.get(
        "/api/v1/admin/monitor/clients/sabc123/delivery",
        headers=admin_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["variants"] == []
    assert body["total"] == 0
    assert len(body["months"]) == 12
