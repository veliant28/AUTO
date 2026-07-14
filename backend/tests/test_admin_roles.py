import pytest
from app.core.security import get_password_hash
from app.models import Role, User, Permission


@pytest.fixture
def admin_user(db, admin_role):
    user = User(email="admin@roles.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestListRoles:
    def test_empty(self, client, admin_headers, admin_role):
        resp = client.get("/api/v1/admin/roles", headers=admin_headers)
        assert resp.status_code == 200
        assert any(r["name"] == "admin" for r in resp.json())

    def test_requires_admin(self, client, auth_headers):
        resp = client.get("/api/v1/admin/roles", headers=auth_headers)
        assert resp.status_code == 403


class TestCreateRole:
    def test_create(self, client, db, admin_headers):
        resp = client.post("/api/v1/admin/roles", headers=admin_headers,
                           json={"name": "editor", "description": "Can edit content"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "editor"

    def test_duplicate_name(self, client, admin_headers):
        client.post("/api/v1/admin/roles", headers=admin_headers,
                    json={"name": "dupe_role", "description": ""})
        resp = client.post("/api/v1/admin/roles", headers=admin_headers,
                           json={"name": "dupe_role", "description": ""})
        assert resp.status_code == 400


class TestUpdateRole:
    def test_update_name(self, client, db, admin_headers):
        resp = client.post("/api/v1/admin/roles", headers=admin_headers,
                           json={"name": "updatable", "description": ""})
        role_id = resp.json()["id"]
        resp = client.put(f"/api/v1/admin/roles/{role_id}", headers=admin_headers,
                          json={"name": "updated_role"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "updated_role"

    def test_not_found(self, client, admin_headers):
        resp = client.put("/api/v1/admin/roles/99999", headers=admin_headers,
                          json={"name": "ghost"})
        assert resp.status_code == 404


class TestDeleteRole:
    def test_delete_custom_role(self, client, db, admin_headers):
        resp = client.post("/api/v1/admin/roles", headers=admin_headers,
                           json={"name": "delete_me", "description": ""})
        role_id = resp.json()["id"]
        resp = client.delete(f"/api/v1/admin/roles/{role_id}", headers=admin_headers)
        assert resp.status_code == 200

    def test_delete_not_found(self, client, admin_headers):
        resp = client.delete("/api/v1/admin/roles/99999", headers=admin_headers)
        assert resp.status_code == 404


class TestListPermissions:
    def test_list(self, client, admin_headers):
        resp = client.get("/api/v1/admin/permissions", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
