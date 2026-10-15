"""B2B-цены: наценка от закупки (правило b2b), витрина, корзина, чекаут, админ-заказы.

B2B-цена = закупка (SupplierOffer.price) + наценка; retail_price всегда
розничная цена (final_price) — витрина показывает её зачёркнутой.
"""
import pytest

from app.core.security import get_password_hash
from app.models import Order, OrderItem, Role, User
from app.models.parts import Part, PartCategory
from app.models.pricing import PriceRule, PriceRuleHistory
from app.models.suppliers import Supplier, SupplierOffer


@pytest.fixture
def b2b_role(db):
    role = Role(name="b2b", description="Корпоративный клиент")
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@pytest.fixture
def b2b_user(db, b2b_role):
    user = User(
        email="b2b@example.com",
        password_hash=get_password_hash("test_password"),
        first_name="B2B",
        phone="+380501112233",
        role_id=b2b_role.id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def b2b_headers(client, b2b_user):
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": b2b_user.email, "password": "test_password"},
    )
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.json()}")
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def admin_user(db, admin_role):
    user = User(
        email="admin@b2b.example.com",
        password_hash=get_password_hash("pass123"),
        role_id=admin_role.id,
        is_active=True,
        first_name="Admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": admin_user.email, "password": "pass123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _ensure_retail_general(db, margin=20.0):
    """Розничная общая наценка — база для запрета B2B выше розничной."""
    rule = db.query(PriceRule).filter(PriceRule.type == "general").first()
    if rule is None:
        rule = PriceRule(type="general", margin_percent=margin, is_active=True)
        db.add(rule)
        db.commit()
        db.refresh(rule)
    return rule


def _set_b2b_rule(db, margin=15.0, enabled=True) -> PriceRule:
    _ensure_retail_general(db)
    rule = PriceRule(type="b2b", margin_percent=margin, is_active=enabled)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def _part_with_offer(db, price=100.0, final_price=200.0, article="B2B-ART"):
    part = Part(article=article, brand="TestBrand", name="B2B Part", brand_id=0, is_active=True)
    db.add(part)
    db.commit()
    db.refresh(part)
    supplier = Supplier(name="B2B Supplier")
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    offer = SupplierOffer(
        part_id=part.id, supplier_id=supplier.id, price=price,
        final_price=final_price, currency="UAH", quantity=5,
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return part, offer


# ---------------------------------------------------------------------------
# Правило: GET/PUT /admin/pricing/b2b
# ---------------------------------------------------------------------------

class TestRuleEndpoints:
    def test_default_disabled(self, client, admin_headers):
        resp = client.get("/api/v1/admin/pricing/b2b", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json() == {
            "enabled": False,
            "margin_percent": 0.0,
            "max_margin_percent": 0.0,
        }

    def test_enable_history_and_disable(self, client, db, admin_headers):
        _ensure_retail_general(db, margin=20)

        resp = client.put(
            "/api/v1/admin/pricing/b2b",
            headers=admin_headers,
            json={"enabled": True, "margin_percent": 15},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == {
            "enabled": True,
            "margin_percent": 15.0,
            "max_margin_percent": 20.0,
        }

        rule = db.query(PriceRule).filter(PriceRule.type == "b2b").one()
        history = db.query(PriceRuleHistory).filter(
            PriceRuleHistory.price_rule_id == rule.id
        ).all()
        assert len(history) == 1
        assert float(history[0].new_percent) == 15.0

        # Выключение не сбрасывает наценку — только флаг
        resp = client.put(
            "/api/v1/admin/pricing/b2b",
            headers=admin_headers,
            json={"enabled": False, "margin_percent": 15},
        )
        assert resp.json()["enabled"] is False
        assert db.query(PriceRule).filter(PriceRule.type == "b2b").one().is_active is False

    def test_validation(self, client, db, admin_headers):
        for payload in (
            {"enabled": True, "margin_percent": 0},
            {"enabled": True, "margin_percent": -5},
            {"enabled": True, "margin_percent": 600},
        ):
            resp = client.put("/api/v1/admin/pricing/b2b", headers=admin_headers, json=payload)
            assert resp.status_code == 400, payload

    def test_limit_is_general_retail_margin(self, client, db, admin_headers):
        """Порог B2B — всегда общая розничная наценка; категорийные не влияют."""
        # Без общей розничной наценки максимум = 0
        resp = client.put(
            "/api/v1/admin/pricing/b2b",
            headers=admin_headers,
            json={"enabled": True, "margin_percent": 15},
        )
        assert resp.status_code == 400

        # Общая розничная 20% → 15% можно, 25% нельзя
        _ensure_retail_general(db, margin=20)
        resp = client.put(
            "/api/v1/admin/pricing/b2b",
            headers=admin_headers,
            json={"enabled": True, "margin_percent": 15},
        )
        assert resp.status_code == 200, resp.text

        resp = client.put(
            "/api/v1/admin/pricing/b2b",
            headers=admin_headers,
            json={"enabled": True, "margin_percent": 25},
        )
        assert resp.status_code == 400

        # Категорийная наценка НИЖЕ общей (8%) не сужает порог: максимум 20
        cheap = PartCategory(name="Дешёвая категория")
        db.add(cheap)
        # Категорийная наценка ВЫШЕ общей (30%) не расширяет порог
        rich = PartCategory(name="Дорогая категория")
        db.add(rich)
        db.commit()
        db.refresh(cheap)
        db.refresh(rich)
        db.add(PriceRule(type="category", category_id=cheap.id,
                         margin_percent=8, is_active=True))
        db.add(PriceRule(type="category", category_id=rich.id,
                         margin_percent=30, is_active=True))
        db.commit()

        g = client.get("/api/v1/admin/pricing/b2b", headers=admin_headers)
        assert g.json()["max_margin_percent"] == 20.0

        # 10% разрешено, хотя в категории розничная всего 8%
        resp = client.put(
            "/api/v1/admin/pricing/b2b",
            headers=admin_headers,
            json={"enabled": True, "margin_percent": 10},
        )
        assert resp.status_code == 200, resp.text

        # 25% запрещено, хотя в категории розничная 30%
        resp = client.put(
            "/api/v1/admin/pricing/b2b",
            headers=admin_headers,
            json={"enabled": True, "margin_percent": 25},
        )
        assert resp.status_code == 400

        # Выключенным можно сохранить любое значение — проверка только при включении
        resp = client.put(
            "/api/v1/admin/pricing/b2b",
            headers=admin_headers,
            json={"enabled": False, "margin_percent": 25},
        )
        assert resp.status_code == 200

    def test_requires_permission(self, client, auth_headers):
        assert client.get("/api/v1/admin/pricing/b2b", headers=auth_headers).status_code == 403
        assert client.put(
            "/api/v1/admin/pricing/b2b",
            headers=auth_headers,
            json={"enabled": True, "margin_percent": 10},
        ).status_code == 403


# ---------------------------------------------------------------------------
# Витрина: карточка, список, поиск
# ---------------------------------------------------------------------------

class TestCatalogPrices:
    def test_details_b2b_and_retail(self, client, db, b2b_headers):
        part, _offer = _part_with_offer(db)

        # Розница: цена = final_price, закупочная цена не отдаётся
        resp = client.get(f"/api/v1/catalog/parts/{part.article}/details")
        assert resp.status_code == 200
        price = resp.json()["price"]
        assert price["price"] == 200.0
        assert price["retail_price"] == 200.0
        assert price["is_b2b"] is False
        assert "original_price" not in price

        _set_b2b_rule(db, margin=15)

        # B2B-клиент: закупка 100 + 15% = 115, розничная — для зачёркивания
        resp = client.get(f"/api/v1/catalog/parts/{part.article}/details", headers=b2b_headers)
        price = resp.json()["price"]
        assert price["price"] == 115.0
        assert price["retail_price"] == 200.0
        assert price["is_b2b"] is True

        # Розничный клиент при включённой B2B-наценке видит розничную цену
        resp = client.get(f"/api/v1/catalog/parts/{part.article}/details")
        assert resp.json()["price"]["price"] == 200.0
        assert resp.json()["price"]["is_b2b"] is False

    def test_disabled_rule_shows_retail_to_b2b(self, client, db, b2b_headers):
        part, _offer = _part_with_offer(db, article="B2B-OFF")
        _set_b2b_rule(db, margin=15, enabled=False)

        resp = client.get(f"/api/v1/catalog/parts/{part.article}/details", headers=b2b_headers)
        price = resp.json()["price"]
        assert price["price"] == 200.0
        assert price["is_b2b"] is False

    def test_list_and_search(self, client, db, b2b_headers):
        category = PartCategory(name="Тест-категория")
        db.add(category)
        db.commit()
        db.refresh(category)
        part, _offer = _part_with_offer(db, article="B2B-LIST")
        part.category_id = category.id
        db.commit()
        _set_b2b_rule(db, margin=15)

        resp = client.get(f"/api/v1/catalog/parts/0/{category.id}", headers=b2b_headers)
        assert resp.status_code == 200, resp.text
        item = resp.json()["items"][0]
        assert item["price"] == 115.0
        assert item["retail_price"] == 200.0
        assert item["is_b2b"] is True

        resp = client.get(
            "/api/v1/catalog/search", params={"q": "B2B-LIST"}, headers=b2b_headers
        )
        assert resp.status_code == 200, resp.text
        found = [i for i in resp.json() if i["article"] == "B2B-LIST"]
        assert found
        assert found[0]["price"] == 115.0
        assert found[0]["retail_price"] == 200.0
        assert found[0]["is_b2b"] is True

    def test_favorites_price(self, client, db, b2b_headers):
        part, _offer = _part_with_offer(db, article="B2B-FAV")
        _set_b2b_rule(db, margin=15)
        client.post("/api/v1/favorites/add", headers=b2b_headers, json={"part_id": part.id})

        resp = client.get("/api/v1/favorites/", headers=b2b_headers)
        item = resp.json()["items"][0]
        assert item["price"] == 115.0
        assert item["retail_price"] == 200.0
        assert item["is_b2b"] is True


# ---------------------------------------------------------------------------
# Корзина и чекаут
# ---------------------------------------------------------------------------

class TestCartAndCheckout:
    def test_cart_price_for_b2b(self, client, db, b2b_headers):
        part, offer = _part_with_offer(db)
        _set_b2b_rule(db, margin=15)
        client.post(
            "/api/v1/cart/add",
            headers=b2b_headers,
            json={"part_id": part.id, "quantity": 2, "supplier_offer_id": offer.id},
        )

        cart = client.get("/api/v1/cart/", headers=b2b_headers).json()
        assert cart[0]["price"] == 115.0
        assert cart[0]["retail_price"] == 200.0
        assert cart[0]["is_b2b"] is True

    def test_checkout_ignores_client_price(self, client, db, auth_headers, test_part, test_supplier_offer):
        """Клиент присылает заниженную цену — сервер считает по своей."""
        resp = client.post(
            "/api/v1/orders/checkout",
            headers=auth_headers,
            json={
                "last_name": "Test", "first_name": "User", "phone": "+380501234567",
                "delivery_type": "warehouse", "payment_method": "cod",
                "items": [{
                    "part_id": test_part.id, "quantity": 2, "price": 1.0,
                    "supplier_offer_id": test_supplier_offer.id,
                }],
            },
        )
        assert resp.status_code == 200, resp.text
        order = db.query(Order).order_by(Order.id.desc()).first()
        assert float(order.total) == 200.0  # 100 × 2, а не 1 × 2
        item = db.query(OrderItem).filter(OrderItem.order_id == order.id).one()
        assert float(item.price) == 100.0

    def test_b2b_price_capped_at_retail(self, client, db, b2b_headers):
        """Страховка: B2B-цена никогда не выше розничной.

        Розничная 105 (наценка 5%), B2B-наценка 15% дала бы 115 — в категориях
        с низкой розничной наценкой B2B-клиент платит как розничный.
        """
        part, offer = _part_with_offer(db, price=100.0, final_price=105.0,
                                       article="B2B-CAP")
        _set_b2b_rule(db, margin=15)

        resp = client.get(
            f"/api/v1/catalog/parts/{part.article}/details", headers=b2b_headers
        )
        price = resp.json()["price"]
        assert price["price"] == 105.0  # капнулось до розничной
        assert price["retail_price"] == 105.0

        client.post(
            "/api/v1/cart/add",
            headers=b2b_headers,
            json={"part_id": part.id, "quantity": 1, "supplier_offer_id": offer.id},
        )
        cart = client.get("/api/v1/cart/", headers=b2b_headers).json()
        assert cart[0]["price"] == 105.0

        resp = client.post(
            "/api/v1/orders/checkout",
            headers=b2b_headers,
            json={
                "last_name": "B2B", "first_name": "Cap", "phone": "+380501112233",
                "delivery_type": "courier", "payment_method": "cod",
                "items": [{
                    "part_id": part.id, "quantity": 1, "price": 1.0,
                    "supplier_offer_id": offer.id,
                }],
            },
        )
        assert resp.status_code == 200, resp.text
        order = db.query(Order).order_by(Order.id.desc()).first()
        assert float(order.total) == 105.0

    def test_checkout_b2b_price(self, client, db, b2b_headers):
        part, offer = _part_with_offer(db)
        _set_b2b_rule(db, margin=15)
        resp = client.post(
            "/api/v1/orders/checkout",
            headers=b2b_headers,
            json={
                "last_name": "B2B", "first_name": "Client", "phone": "+380501112233",
                "delivery_type": "courier", "payment_method": "cod",
                "items": [{
                    "part_id": part.id, "quantity": 2, "price": 999.0,
                    "supplier_offer_id": offer.id,
                }],
            },
        )
        assert resp.status_code == 200, resp.text
        order = db.query(Order).order_by(Order.id.desc()).first()
        assert float(order.total) == 230.0  # 115 × 2
        item = db.query(OrderItem).filter(OrderItem.order_id == order.id).one()
        assert float(item.price) == 115.0


# ---------------------------------------------------------------------------
# Админский заказ для B2B-клиента
# ---------------------------------------------------------------------------

class TestAdminOrderForB2B:
    def test_admin_order_uses_b2b_price(self, client, db, admin_headers, b2b_user):
        part, _offer = _part_with_offer(db, article="B2B-ADM")
        _set_b2b_rule(db, margin=15)

        resp = client.post(
            "/api/v1/admin/orders",
            headers=admin_headers,
            json={
                "last_name": "B2B", "first_name": "Client",
                "phone": b2b_user.phone,
                "delivery_type": "warehouse",
                "delivery_city": "Київ", "delivery_city_ref": "city-ref",
                "delivery_city_label": "м. Київ",
                "delivery_warehouse": "Відділення №1",
                "delivery_warehouse_ref": "wh-ref",
                "delivery_warehouse_label": "Відділення №1",
                "payment_method": "cod",
                "items": [{"part_id": part.id, "quantity": 2}],
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["user_id"] == b2b_user.id  # клиент найден по телефону
        assert data["total"] == 230.0  # 115 × 2 — B2B-цена
        assert data["items"][0]["price"] == 115.0
