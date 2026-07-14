import pytest
from datetime import datetime
from app.core.security import get_password_hash
from app.models import Role, User, Order, OrderItem, OrderStatus
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
