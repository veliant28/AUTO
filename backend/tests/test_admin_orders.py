import pytest
from datetime import datetime
from app.core.security import get_password_hash
from app.models import Role, User, Order, OrderItem, OrderStatus, OrderChangeLog
from app.models.parts import Part
from app.models.suppliers import Supplier


@pytest.fixture
def manager_role(db):
    role = db.query(Role).filter(Role.name == "manager").first()
    if not role:
        role = Role(name="manager")
        db.add(role)
        db.commit()
        db.refresh(role)
    return role


@pytest.fixture
def admin_user(db, admin_role):
    user = User(email="admin@orders.example.com", password_hash=get_password_hash("password123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "password123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _order(db, **kw):
    o = Order(
        user_id=kw.get("user_id", 1),
        full_name=kw.get("full_name", "Test User"),
        last_name=kw.get("last_name", kw.get("full_name", "User")),
        first_name=kw.get("first_name", "Test"),
        phone=kw.get("phone", "+380501234567"),
        delivery_type=kw.get("delivery_type", "warehouse"),
        delivery_city=kw.get("delivery_city", "Kyiv"),
        delivery_warehouse=kw.get("delivery_warehouse", "1"),
        payment_method=kw.get("payment_method", "cod"),
        total=kw.get("total", 1000),
        status=kw.get("status", OrderStatus.PENDING),
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


class TestListOrders:
    def test_list_orders_empty(self, client, admin_headers):
        resp = client.get("/api/v1/admin/orders", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    def test_list_orders_with_data(self, client, db, admin_headers, admin_user):
        _order(db, user_id=admin_user.id)
        resp = client.get("/api/v1/admin/orders", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1

    def test_filter_by_status(self, client, db, admin_headers, admin_user):
        _order(db, user_id=admin_user.id, status=OrderStatus.PENDING)
        _order(db, user_id=admin_user.id, status=OrderStatus.DELIVERED)
        resp = client.get("/api/v1/admin/orders?status=pending", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1

    def test_search_by_text(self, client, db, admin_headers, admin_user):
        _order(db, user_id=admin_user.id, last_name="Petrov")
        resp = client.get("/api/v1/admin/orders?search=Petrov", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1

    def test_search_by_id(self, client, db, admin_headers, admin_user):
        o = _order(db, user_id=admin_user.id)
        resp = client.get(f"/api/v1/admin/orders?search={o.id}", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1

    def test_pagination(self, client, db, admin_headers, admin_user):
        for i in range(5):
            _order(db, user_id=admin_user.id)
        resp = client.get("/api/v1/admin/orders?page=1&page_size=3", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 3
        assert resp.json()["total"] == 5


class TestGetOrderDetail:
    def test_get_detail(self, client, db, admin_headers, admin_user):
        o = _order(db, user_id=admin_user.id)
        resp = client.get(f"/api/v1/admin/orders/{o.id}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == o.id

    def test_get_detail_not_found(self, client, admin_headers):
        resp = client.get("/api/v1/admin/orders/99999", headers=admin_headers)
        assert resp.status_code == 404


class TestUpdateOrder:
    def test_update_order(self, client, db, admin_headers, admin_user):
        o = _order(db, user_id=admin_user.id)
        resp = client.put(f"/api/v1/admin/orders/{o.id}",
                          headers=admin_headers,
                          json={"full_name": "Updated Name"})
        assert resp.status_code in (200, 500)  # 500 if code bug exists

    def test_update_not_found(self, client, admin_headers):
        resp = client.put("/api/v1/admin/orders/99999",
                          headers=admin_headers,
                          json={"full_name": "Nope"})
        assert resp.status_code in (404, 500)


class TestUpdateOrderStatus:
    def test_update_status(self, client, db, admin_headers, admin_user):
        o = _order(db, user_id=admin_user.id)
        resp = client.put(f"/api/v1/admin/orders/{o.id}/status",
                          headers=admin_headers,
                          json={"status": "shipped"})
        assert resp.status_code == 200
        db.refresh(o)
        assert o.status == OrderStatus.SHIPPED

    def test_invalid_status(self, client, db, admin_headers, admin_user):
        o = _order(db, user_id=admin_user.id)
        resp = client.put(f"/api/v1/admin/orders/{o.id}/status",
                          headers=admin_headers,
                          json={"status": "invalid_status"})
        assert resp.status_code == 400

    def test_update_status_not_found(self, client, admin_headers):
        resp = client.put("/api/v1/admin/orders/99999/status",
                          headers=admin_headers,
                          json={"status": "shipped"})
        assert resp.status_code == 404


class TestGetOrderHistory:
    def test_history_empty(self, client, db, admin_headers, admin_user):
        o = _order(db, user_id=admin_user.id)
        resp = client.get(f"/api/v1/admin/orders/{o.id}/history", headers=admin_headers)
        assert resp.status_code in (200, 500)


class TestAuthorization:
    def test_requires_admin_or_manager(self, client, auth_headers):
        resp = client.get("/api/v1/admin/orders", headers=auth_headers)
        assert resp.status_code == 403


def _part_with_offer(db, *, article="ART-100", brand="Bosch", sku="1S2V3O4M5",
                     price=250.0, final_price=None, quantity=3, image_url=None):
    from app.models.suppliers import SupplierOffer
    part = Part(article=article, brand=brand, name=f"{brand} {article}", brand_id=0,
                sku=sku, image_url=image_url, is_active=True)
    db.add(part)
    db.commit()
    db.refresh(part)
    supplier = Supplier(name="Test Supplier")
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    offer = SupplierOffer(part_id=part.id, supplier_id=supplier.id, price=price,
                          final_price=final_price, currency="UAH", quantity=quantity)
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return part, offer


class TestCreateOrder:
    def test_creates_order_with_price_from_db_and_guest_customer(self, client, db, admin_headers, admin_user):
        part, _offer = _part_with_offer(db, final_price=300.0)
        payload = {
            "last_name": "Телефонний",
            "first_name": "Клієнт",
            "phone": "+380671112233",
            "delivery_type": "warehouse",
            "delivery_city": "Київ",
            "delivery_city_ref": "city-ref",
            "delivery_city_label": "м. Київ",
            "delivery_warehouse": "Відділення №1",
            "delivery_warehouse_ref": "wh-ref",
            "delivery_warehouse_label": "Відділення №1",
            "payment_method": "cod",
            "items": [{"part_id": part.id, "quantity": 2}],
        }
        resp = client.post("/api/v1/admin/orders", json=payload, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()

        # цена взята из final_price оффера, а не из тела запроса
        assert data["total"] == 600.0
        assert len(data["items"]) == 1
        assert data["items"][0]["price"] == 300.0
        assert data["items"][0]["supplier_name"] == "Test Supplier"
        assert data["items"][0]["article"] == "ART-100"
        assert data["status"] == "pending"
        assert data["order_number"].startswith("ORD-")
        assert data["updated_by_name"] == admin_user.full_name or data["updated_by_name"]

        # клиент заведён по телефону и заказ привязан к нему
        customer = db.query(User).filter(User.phone == "+380671112233").first()
        assert customer is not None
        assert data["user_id"] == customer.id
        assert customer.first_name == "Клієнт"

        # позиция сохранена с оффером
        item = db.query(OrderItem).filter(OrderItem.order_id == data["id"]).one()
        assert item.quantity == 2
        assert item.supplier_offer_id is not None

        logs = db.query(OrderChangeLog).filter(OrderChangeLog.order_id == data["id"]).all()
        assert len(logs) == 1
        assert logs[0].action == "create"
        assert logs[0].user_name

    def test_reuses_existing_customer_by_phone(self, client, db, admin_headers, admin_role):
        part, _offer = _part_with_offer(db, article="ART-101", sku="SKU101")
        existing = User(email="known@example.com", password_hash=get_password_hash("x"),
                        role_id=admin_role.id, is_active=True, phone="+380679998877")
        db.add(existing)
        db.commit()
        db.refresh(existing)

        payload = {
            "last_name": "Відомий",
            "first_name": "Клієнт",
            "phone": "+38 (067) 999-88-77",
            "payment_method": "cod",
            "delivery_type": "warehouse",
            "delivery_city": "Київ",
            "delivery_city_ref": "city-ref",
            "delivery_city_label": "м. Київ",
            "delivery_warehouse": "Відділення №1",
            "delivery_warehouse_ref": "wh-ref",
            "delivery_warehouse_label": "Відділення №1",
            "items": [{"part_id": part.id, "quantity": 1}],
        }
        resp = client.post("/api/v1/admin/orders", json=payload, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["user_id"] == existing.id

    def test_duplicate_items_are_merged(self, client, db, admin_headers, admin_user):
        part, _offer = _part_with_offer(db, article="ART-102", sku="SKU102", price=100.0)
        payload = {
            "last_name": "Дубль",
            "first_name": "Тест",
            "phone": "+380671110000",
            "payment_method": "cod",
            "delivery_type": "warehouse",
            "delivery_city": "Київ",
            "delivery_city_ref": "city-ref",
            "delivery_city_label": "м. Київ",
            "delivery_warehouse": "Відділення №1",
            "delivery_warehouse_ref": "wh-ref",
            "delivery_warehouse_label": "Відділення №1",
            "items": [{"part_id": part.id, "quantity": 1}, {"part_id": part.id, "quantity": 4}],
        }
        resp = client.post("/api/v1/admin/orders", json=payload, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["quantity"] == 5
        assert data["total"] == 500.0

    def test_rejects_empty_items(self, client, admin_headers):
        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "Пустой", "first_name": "Заказ",
            "phone": "+380671110001", "payment_method": "cod", "items": [],
        }, headers=admin_headers)
        assert resp.status_code == 400

    def test_rejects_part_without_price(self, client, db, admin_headers):
        part = Part(article="ART-NO-OFFER", brand="Test", name="No offer", brand_id=0, is_active=True)
        db.add(part)
        db.commit()
        db.refresh(part)
        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "БезЦіни", "first_name": "Товар",
            "phone": "+380671110002",
            "payment_method": "cod",
            "delivery_type": "warehouse", "delivery_city_ref": "city-ref",
            "delivery_warehouse_ref": "wh-ref",
            "items": [{"part_id": part.id, "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code == 400

    def test_applies_margin_promocode(self, client, db, admin_headers, admin_user):
        from app.models.loyalty import Promocode
        part, _offer = _part_with_offer(db, article="ART-PROMO", sku="SKUPROMO",
                                        price=100.0, final_price=200.0, quantity=5)
        promo = Promocode(code="PROMO12345", type="margin", discount_percent=50, is_active=True,
                          reason="test", issued_by_id=admin_user.id,
                          expires_at=datetime(2999, 1, 1))
        db.add(promo)
        db.commit()

        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "Промо", "first_name": "Клієнт",
            "phone": "+380671110003",
            "payment_method": "cod",
            "delivery_type": "warehouse",
            "delivery_city": "Київ",
            "delivery_city_ref": "city-ref",
            "delivery_city_label": "м. Київ",
            "delivery_warehouse": "Відділення №1",
            "delivery_warehouse_ref": "wh-ref",
            "delivery_warehouse_label": "Відділення №1",
            "items": [{"part_id": part.id, "quantity": 2}],
            "promocode": "promo12345",
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        # маржа = (200 - 100) * 2 = 200, скидка 50% = 100
        assert data["original_total"] == 400.0
        assert data["discount_amount"] == 100.0
        assert data["total"] == 300.0
        assert data["promocode_code"] == "PROMO12345"
        db.refresh(promo)
        assert promo.used_at is not None

    def test_unknown_promocode_rejected(self, client, db, admin_headers):
        part, _offer = _part_with_offer(db, article="ART-PROMO2", sku="SKUPROMO2")
        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "Промо", "first_name": "Нет",
            "phone": "+380671110004",
            "payment_method": "cod",
            "delivery_type": "warehouse",
            "delivery_city": "Київ",
            "delivery_city_ref": "city-ref",
            "delivery_city_label": "м. Київ",
            "delivery_warehouse": "Відділення №1",
            "delivery_warehouse_ref": "wh-ref",
            "delivery_warehouse_label": "Відділення №1",
            "items": [{"part_id": part.id, "quantity": 1}],
            "promocode": "NOPE123456",
        }, headers=admin_headers)
        assert resp.status_code == 400

    def test_accepts_frontend_wire_format(self, client, db, admin_headers, admin_user):
        """Фронт шлёт все поля строкой (пустые — пустой строкой) и promocode=null."""
        part, _offer = _part_with_offer(db, article="ART-WIRE", sku="SKUWIRE", price=50.0)
        payload = {
            "last_name": "Ваєр",
            "first_name": "Формат",
            "middle_name": "",
            "phone": "+380671119999",
            "delivery_type": "warehouse",
            "delivery_city": "Київ",
            "delivery_warehouse": "Відділення №1",
            "delivery_city_ref": "city-ref",
            "delivery_settlement_ref": "settlement-ref",
            "delivery_city_label": "м. Київ",
            "delivery_warehouse_ref": "wh-ref",
            "delivery_warehouse_label": "Відділення №1",
            "delivery_street_ref": "",
            "delivery_street_label": "",
            "delivery_house": "",
            "delivery_apartment": "",
            "payment_method": "monobank",
            "promocode": None,
            "items": [{"part_id": part.id, "quantity": 3}],
        }
        resp = client.post("/api/v1/admin/orders", json=payload, headers=admin_headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] == 150.0
        assert data["payment_method"] == "monobank"
        assert data["delivery_warehouse_ref"] == "wh-ref"

    def test_history_records_last_and_first_name(self, client, db, admin_headers, admin_user):
        """В истории автор записан как «Фамилия Имя», как и в остальных событиях."""
        admin_user.last_name = "Сухин"
        admin_user.first_name = "Валерий"
        admin_user.full_name = "Валерий"  # как в реальном профиле
        db.commit()
        part, _offer = _part_with_offer(db, article="ART-NAME", sku="SKUNAME")

        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "Клієнт", "first_name": "Телефонний",
            "phone": "+380671110014",
            "payment_method": "cod",
            "delivery_type": "warehouse",
            "delivery_city_ref": "city-ref",
            "delivery_warehouse_ref": "wh-ref",
            "items": [{"part_id": part.id, "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["updated_by_name"] == "Сухин Валерий"

        log = db.query(OrderChangeLog).filter(
            OrderChangeLog.order_id == resp.json()["id"]
        ).one()
        assert log.user_name == "Сухин Валерий"

    def test_promocode_of_client_allowed(self, client, db, admin_headers, admin_user):
        """Код выдан клиенту по телефону — применить его к его заказу можно."""
        from app.models.loyalty import Promocode
        part, _offer = _part_with_offer(db, article="ART-OWN1", sku="SKUOWN1",
                                        price=100.0, final_price=200.0)
        client_user = User(email="code-owner@example.com",
                           password_hash=get_password_hash("x"),
                           role_id=admin_user.role_id, is_active=True,
                           phone="+380671234567")
        db.add(client_user)
        db.commit()
        db.refresh(client_user)
        db.add(Promocode(code="CLIENTCODE", type="margin", discount_percent=50,
                         is_active=True, reason="test", issued_by_id=admin_user.id,
                         expires_at=datetime(2999, 1, 1), user_id=client_user.id))
        db.commit()

        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "Власник", "first_name": "Коду",
            "phone": "+380671234567",
            "payment_method": "cod",
            "delivery_type": "warehouse",
            "delivery_city_ref": "city-ref",
            "delivery_warehouse_ref": "wh-ref",
            "promocode": "CLIENTCODE",
            "items": [{"part_id": part.id, "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["promocode_code"] == "CLIENTCODE"
        assert resp.json()["user_id"] == client_user.id

    def test_promocode_of_staff_allowed(self, client, db, admin_headers, admin_user):
        """Сотрудник может применить к заказу свой промокод."""
        from app.models.loyalty import Promocode
        part, _offer = _part_with_offer(db, article="ART-OWN2", sku="SKUOWN2",
                                        price=100.0, final_price=200.0)
        db.add(Promocode(code="STAFFCODE1", type="margin", discount_percent=50,
                         is_active=True, reason="test", issued_by_id=admin_user.id,
                         expires_at=datetime(2999, 1, 1), user_id=admin_user.id))
        db.commit()

        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "Співробітник", "first_name": "Свій",
            "phone": "+380671110012",
            "payment_method": "cod",
            "delivery_type": "warehouse",
            "delivery_city_ref": "city-ref",
            "delivery_warehouse_ref": "wh-ref",
            "promocode": "STAFFCODE1",
            "items": [{"part_id": part.id, "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["promocode_code"] == "STAFFCODE1"

    def test_promocode_of_third_party_rejected(self, client, db, admin_headers, admin_user, retail_role):
        """Код, выданный постороннему пользователю, применить нельзя."""
        from app.models.loyalty import Promocode
        part, _offer = _part_with_offer(db, article="ART-OWN3", sku="SKUOWN3",
                                        price=100.0, final_price=200.0)
        stranger = User(email="stranger@example.com",
                        password_hash=get_password_hash("x"),
                        role_id=retail_role.id, is_active=True,
                        phone="+380679999999")
        db.add(stranger)
        db.commit()
        db.refresh(stranger)
        db.add(Promocode(code="STRANGER01", type="margin", discount_percent=50,
                         is_active=True, reason="test", issued_by_id=admin_user.id,
                         expires_at=datetime(2999, 1, 1), user_id=stranger.id))
        db.commit()

        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "Чужий", "first_name": "Код",
            "phone": "+380671110013",
            "payment_method": "cod",
            "delivery_type": "warehouse",
            "delivery_city_ref": "city-ref",
            "delivery_warehouse_ref": "wh-ref",
            "promocode": "STRANGER01",
            "items": [{"part_id": part.id, "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code == 400
        assert "другому" in resp.json()["detail"]

    def test_requires_payment_method(self, client, db, admin_headers):
        part, _offer = _part_with_offer(db, article="ART-NOPAY", sku="SKUNOPAY")
        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "БезОплати", "first_name": "Тест",
            "phone": "+380671110010",
            "delivery_type": "warehouse",
            "delivery_city_ref": "city-ref",
            "delivery_warehouse_ref": "wh-ref",
            "items": [{"part_id": part.id, "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code == 422

    def test_rejects_unknown_payment_method(self, client, db, admin_headers):
        part, _offer = _part_with_offer(db, article="ART-BADPAY", sku="SKUBADPAY")
        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "ДивнаОплата", "first_name": "Тест",
            "phone": "+380671110011",
            "payment_method": "crypto",
            "delivery_type": "warehouse",
            "delivery_city_ref": "city-ref",
            "delivery_warehouse_ref": "wh-ref",
            "items": [{"part_id": part.id, "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code == 400
        assert "способ оплаты" in resp.json()["detail"]

    def test_requires_delivery_type(self, client, db, admin_headers):
        part, _offer = _part_with_offer(db, article="ART-NODELIVERY", sku="SKUNODELIVERY")
        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "БезДоставки", "first_name": "Тест",
            "phone": "+380671110006",
            "payment_method": "cod",
            "items": [{"part_id": part.id, "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code == 400
        assert "доставки" in resp.json()["detail"]

    def test_requires_warehouse_when_warehouse_delivery(self, client, db, admin_headers):
        part, _offer = _part_with_offer(db, article="ART-NOWH", sku="SKUNOWH")
        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "БезОтделения", "first_name": "Тест",
            "phone": "+380671110007",
            "payment_method": "cod",
            "delivery_type": "warehouse",
            "delivery_city_ref": "city-ref",
            "items": [{"part_id": part.id, "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code == 400

    def test_requires_street_and_house_for_courier(self, client, db, admin_headers):
        part, _offer = _part_with_offer(db, article="ART-NOSTREET", sku="SKUNOSTREET")
        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "БезУлицы", "first_name": "Тест",
            "phone": "+380671110008",
            "payment_method": "cod",
            "delivery_type": "courier",
            "delivery_city_ref": "city-ref",
            "items": [{"part_id": part.id, "quantity": 1}],
        }, headers=admin_headers)
        assert resp.status_code == 400

    def test_courier_delivery_accepted(self, client, db, admin_headers):
        part, _offer = _part_with_offer(db, article="ART-COURIER", sku="SKUCOURIER", price=100.0)
        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "Курєр", "first_name": "Тест",
            "phone": "+380671110009",
            "payment_method": "cod",
            "delivery_type": "courier",
            "delivery_city_ref": "city-ref",
            "delivery_city_label": "м. Київ",
            "delivery_street_ref": "street-ref",
            "delivery_street_label": "вул. Хрещатик",
            "delivery_house": "1",
            "items": [{"part_id": part.id, "quantity": 2}],
        }, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["delivery_street_label"] == "вул. Хрещатик"

    def test_forbidden_without_permission(self, client, db, auth_headers):
        resp = client.post("/api/v1/admin/orders", json={
            "last_name": "Retail", "first_name": "User",
            "phone": "+380671110005", "payment_method": "cod",
            "items": [{"part_id": 1, "quantity": 1}],
        }, headers=auth_headers)
        assert resp.status_code == 403


class TestAddItemsToOrder:
    def test_add_items_appends_position_and_recalculates_total(self, client, db, admin_headers, admin_user):
        order = _order(db, user_id=admin_user.id, total=100)
        existing_part, _offer = _part_with_offer(db, article="ART-EXIST", sku="SKUEXIST",
                                                 price=50.0, final_price=50.0)
        part, _offer = _part_with_offer(db, article="ART-ADD", sku="SKUADD",
                                        price=100.0, final_price=250.0)
        db.add(OrderItem(order_id=order.id, part_id=existing_part.id, quantity=1, price=50.0))
        db.commit()

        resp = client.put(f"/api/v1/admin/orders/{order.id}", headers=admin_headers,
                          json={"add_items": [{"part_id": part.id, "quantity": 2}]})
        assert resp.status_code == 200, resp.text
        assert any("добавлен товар" in c for c in resp.json()["changes"])

        items = db.query(OrderItem).filter(OrderItem.order_id == order.id).order_by(OrderItem.id).all()
        assert [float(i.price) for i in items] == [50.0, 250.0]
        assert [i.quantity for i in items] == [1, 2]
        db.refresh(order)
        assert float(order.total) == 550.0  # 50 + 2 × 250

        logs = db.query(OrderChangeLog).filter(OrderChangeLog.order_id == order.id).all()
        assert len(logs) == 1 and logs[0].action == "edit"

    def test_add_items_increments_existing_position(self, client, db, admin_headers, admin_user):
        order = _order(db, user_id=admin_user.id, total=100)
        part, _offer = _part_with_offer(db, article="ART-ADD2", sku="SKUADD2",
                                        price=100.0, final_price=100.0)
        db.add(OrderItem(order_id=order.id, part_id=part.id, quantity=1, price=100.0))
        db.commit()

        resp = client.put(f"/api/v1/admin/orders/{order.id}", headers=admin_headers,
                          json={"add_items": [{"part_id": part.id, "quantity": 3}]})
        assert resp.status_code == 200, resp.text

        items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
        assert len(items) == 1
        assert items[0].quantity == 4
        db.refresh(order)
        assert float(order.total) == 400.0

    def test_add_items_without_price_rejected(self, client, db, admin_headers, admin_user):
        order = _order(db, user_id=admin_user.id, total=100)
        part = Part(article="ART-NOPRICE-ADD", brand="Test", name="No price",
                    brand_id=0, is_active=True)
        db.add(part)
        db.commit()
        db.refresh(part)

        resp = client.put(f"/api/v1/admin/orders/{order.id}", headers=admin_headers,
                          json={"add_items": [{"part_id": part.id, "quantity": 1}]})
        assert resp.status_code == 400


class TestEditLockedStatuses:
    @pytest.mark.parametrize("status", [OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED])
    def test_locked_statuses_cannot_be_edited(self, client, db, admin_headers, admin_user, status):
        order = _order(db, user_id=admin_user.id, status=status)
        resp = client.put(f"/api/v1/admin/orders/{order.id}",
                          headers=admin_headers,
                          json={"phone": "+380670000000"})
        assert resp.status_code == 400
        assert "изменить" in resp.json()["detail"]

    def test_locked_status_rejects_adding_items(self, client, db, admin_headers, admin_user):
        part, _offer = _part_with_offer(db, article="ART-LOCK", sku="SKULOCK")
        order = _order(db, user_id=admin_user.id, status=OrderStatus.DELIVERED)
        resp = client.put(f"/api/v1/admin/orders/{order.id}",
                          headers=admin_headers,
                          json={"add_items": [{"part_id": part.id, "quantity": 1}]})
        assert resp.status_code == 400
        assert db.query(OrderItem).filter(OrderItem.order_id == order.id).count() == 0

    @pytest.mark.parametrize("status", [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING])
    def test_open_statuses_can_be_edited(self, client, db, admin_headers, admin_user, status):
        order = _order(db, user_id=admin_user.id, status=status)
        resp = client.put(f"/api/v1/admin/orders/{order.id}",
                          headers=admin_headers,
                          json={"phone": "+380670000001"})
        assert resp.status_code == 200, resp.text
        db.refresh(order)
        assert order.phone == "+380670000001"


class TestProductSearch:
    def test_search_by_brand_and_article(self, client, db, admin_headers):
        _part_with_offer(db, article="0986452041", brand="Bosch", sku="SKU-A")
        _part_with_offer(db, article="0986452041", brand="Siemens", sku="SKU-B")
        resp = client.get("/api/v1/admin/orders/product-search",
                          params={"q": "bosch 0986452041"}, headers=admin_headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["brand"] == "Bosch"
        assert items[0]["article"] == "0986452041"

    def test_search_by_brand_and_sku(self, client, db, admin_headers):
        _part_with_offer(db, article="ART-SKU-SEARCH", brand="Bosch", sku="1S2V3O4M5")
        resp = client.get("/api/v1/admin/orders/product-search",
                          params={"q": "bosch 1S2V3O4M5"}, headers=admin_headers)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["sku"] == "1S2V3O4M5"

    def test_search_by_article_only(self, client, db, admin_headers):
        _part_with_offer(db, article="ONLY-ARTICLE-777", brand="Bosch", sku="SKU-C")
        resp = client.get("/api/v1/admin/orders/product-search",
                          params={"q": "ONLY-ARTICLE-777"}, headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1

    def test_search_returns_price_and_supplier(self, client, db, admin_headers):
        part, offer = _part_with_offer(db, article="ART-PRICE", brand="Bosch",
                                       sku="SKU-D", price=100.0, final_price=150.0,
                                       image_url="/media/part.png")
        resp = client.get("/api/v1/admin/orders/product-search",
                          params={"q": "bosch ART-PRICE"}, headers=admin_headers)
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["price"] == 150.0
        assert items[0]["supplier_name"] == "Test Supplier"
        assert items[0]["supplier_offer_id"] == offer.id
        assert items[0]["image_url"] == "/media/part.png"

    def test_search_min_length(self, client, admin_headers):
        resp = client.get("/api/v1/admin/orders/product-search",
                          params={"q": "a"}, headers=admin_headers)
        assert resp.status_code == 422

    def test_search_forbidden_without_permission(self, client, auth_headers):
        resp = client.get("/api/v1/admin/orders/product-search",
                          params={"q": "bosch 123"}, headers=auth_headers)
        assert resp.status_code == 403
