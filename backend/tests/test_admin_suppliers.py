import pytest
from app.core.security import get_password_hash
from app.models import Role, User
from app.models.imports import SupplierConfig


@pytest.fixture
def admin_user(db, admin_role):
    user = User(email="admin@sup.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestListSuppliers:
    def test_list_empty(self, client, admin_headers):
        resp = client.get("/api/v1/admin/suppliers", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_with_data(self, client, db, admin_headers):
        sc = SupplierConfig(supplier="GPL", login="user", is_active=True)
        db.add(sc)
        db.commit()
        resp = client.get("/api/v1/admin/suppliers", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_requires_admin(self, client, auth_headers):
        resp = client.get("/api/v1/admin/suppliers", headers=auth_headers)
        assert resp.status_code == 403


class TestUpdateSupplier:
    def test_update(self, client, db, admin_headers):
        sc = SupplierConfig(supplier="GPL", login="old_login")
        db.add(sc)
        db.commit()
        resp = client.put("/api/v1/admin/suppliers/GPL", headers=admin_headers,
                          json={"login": "new_login"})
        assert resp.status_code == 200
        assert resp.json()["login"] == "new_login"

    def test_update_not_found(self, client, admin_headers):
        resp = client.put("/api/v1/admin/suppliers/UNKNOWN", headers=admin_headers,
                          json={"login": "x"})
        assert resp.status_code == 404


class TestTokenStatus:
    def test_token_status_none(self, client, db, admin_headers):
        sc = SupplierConfig(supplier="GPL", login="user")
        db.add(sc)
        db.commit()
        resp = client.get("/api/v1/admin/suppliers/GPL/token-status", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["token_status"] == "none"

    def test_token_status_not_found(self, client, admin_headers):
        resp = client.get("/api/v1/admin/suppliers/UNKNOWN/token-status", headers=admin_headers)
        assert resp.status_code == 404
