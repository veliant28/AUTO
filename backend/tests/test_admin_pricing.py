import pytest
from app.core.security import get_password_hash
from app.models import Role, User
from app.models.pricing import PriceRule


@pytest.fixture
def admin_user(db, admin_role):
    user = User(email="admin@pricing.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestGeneralMargin:
    def test_get_default(self, client, admin_headers):
        resp = client.get("/api/v1/admin/pricing/general", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["margin_percent"] == 0.0

    def test_update(self, client, admin_headers):
        resp = client.put("/api/v1/admin/pricing/general", headers=admin_headers,
                          json={"margin_percent": 25.5})
        assert resp.status_code == 200
        assert resp.json()["margin_percent"] == 25.5

    def test_requires_admin(self, client, auth_headers):
        resp = client.get("/api/v1/admin/pricing/general", headers=auth_headers)
        assert resp.status_code == 403


class TestCategoryMargins:
    def test_list_empty(self, client, admin_headers):
        resp = client.get("/api/v1/admin/pricing/categories", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data or isinstance(data, list)

    def test_update_category_margin(self, client, db, admin_headers):
        from app.models.parts import PartCategory
        cat = PartCategory(name="Brakes")
        db.add(cat)
        db.commit()
        resp = client.put(f"/api/v1/admin/pricing/categories/{cat.id}", headers=admin_headers,
                          json={"margin_percent": 15})
        assert resp.status_code == 200
        assert resp.json()["margin_percent"] == 15.0


class TestPricingHistory:
    def test_get_history(self, client, admin_headers):
        resp = client.get("/api/v1/admin/pricing/history", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_history_by_category(self, client, db, admin_headers):
        from app.models.parts import PartCategory
        cat = PartCategory(name="Filters")
        db.add(cat)
        db.commit()
        resp = client.get(f"/api/v1/admin/pricing/history?type=category&category_id={cat.id}",
                          headers=admin_headers)
        assert resp.status_code == 200


class TestAppliedHistory:
    def test_applied_history(self, client, admin_headers):
        resp = client.get("/api/v1/admin/pricing/applied-history", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
