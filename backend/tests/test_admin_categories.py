import pytest
from app.core.security import get_password_hash
from app.models import Role, User, PartCategory


@pytest.fixture
def admin_user(db, admin_role):
    user = User(email="admin@cat.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestAdminCategories:
    def test_list_empty(self, client, admin_headers):
        resp = client.get("/api/v1/admin/categories", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    def test_list_with_data(self, client, db, admin_headers):
        cat = PartCategory(name="Brakes")
        db.add(cat)
        db.commit()
        resp = client.get("/api/v1/admin/categories", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1

    def test_create(self, client, admin_headers):
        resp = client.post("/api/v1/admin/categories", headers=admin_headers,
                           json={"name": "Filters"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Filters"

    def test_update(self, client, db, admin_headers):
        cat = PartCategory(name="OldName")
        db.add(cat)
        db.commit()
        resp = client.put(f"/api/v1/admin/categories/{cat.id}", headers=admin_headers,
                          json={"name": "NewName"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "NewName"

    def test_update_not_found(self, client, admin_headers):
        resp = client.put("/api/v1/admin/categories/99999", headers=admin_headers,
                          json={"name": "Ghost"})
        assert resp.status_code == 404

    def test_delete(self, client, db, admin_headers):
        cat = PartCategory(name="DeleteMe")
        db.add(cat)
        db.commit()
        resp = client.delete(f"/api/v1/admin/categories/{cat.id}", headers=admin_headers)
        assert resp.status_code == 200

    def test_delete_not_found(self, client, admin_headers):
        resp = client.delete("/api/v1/admin/categories/99999", headers=admin_headers)
        assert resp.status_code == 404

    def test_requires_admin(self, client, auth_headers):
        resp = client.get("/api/v1/admin/categories", headers=auth_headers)
        assert resp.status_code == 403
