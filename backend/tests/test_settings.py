import pytest
from app.core.security import get_password_hash
from app.models import Role, User


@pytest.fixture
def admin_role(db):
    role = db.query(Role).filter(Role.name == "admin").first()
    if not role:
        role = Role(name="admin")
        db.add(role)
        db.commit()
        db.refresh(role)
    return role


@pytest.fixture
def admin_user(db, admin_role):
    user = User(email="admin@settings.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestPublicSettings:
    def test_get_public(self, client):
        resp = client.get("/api/v1/settings")
        assert resp.status_code == 200
        assert "brand_name" in resp.json()

    def test_get_returns_defaults(self, client):
        resp = client.get("/api/v1/settings")
        assert resp.json()["brand_name"] is not None


class TestAdminSettings:
    def test_get_admin(self, client, admin_headers):
        resp = client.get("/api/v1/admin/settings", headers=admin_headers)
        assert resp.status_code == 200
        assert "brand_name" in resp.json()

    def test_update(self, client, admin_headers):
        resp = client.put("/api/v1/admin/settings", headers=admin_headers,
                          json={"brand_name": "TestStore"})
        assert resp.status_code == 200
        assert resp.json()["brand_name"] == "TestStore"

    def test_requires_admin(self, client, auth_headers):
        resp = client.get("/api/v1/admin/settings", headers=auth_headers)
        assert resp.status_code == 403
