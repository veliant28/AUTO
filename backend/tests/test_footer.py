import pytest
from app.core.security import get_password_hash
from app.models import Role, User
from app.models.footer import FooterContent


@pytest.fixture
def admin_user(db, admin_role):
    user = User(email="admin@footer.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestFooter:
    def test_get_footer_default_locale(self, client):
        resp = client.get("/api/v1/footer")
        assert resp.status_code == 200
        assert resp.json()["locale"] == "ru"

    def test_get_footer_with_locale(self, client):
        resp = client.get("/api/v1/footer?locale=en")
        assert resp.status_code == 200
        assert resp.json()["locale"] == "en"

    def test_get_all_admin(self, client, admin_headers):
        resp = client.get("/api/v1/admin/footer", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_update_footer(self, client, db, admin_headers):
        resp = client.put("/api/v1/admin/footer/ru", headers=admin_headers,
                          json={"data": {"description": "New desc"}})
        assert resp.status_code == 200
        assert resp.json()["data"]["description"] == "New desc"

    def test_update_creates_new_locale(self, client, admin_headers):
        resp = client.put("/api/v1/admin/footer/ua", headers=admin_headers,
                          json={"data": {"description": "Опис"}})
        assert resp.status_code == 200

    def test_invalid_locale(self, client, admin_headers):
        resp = client.put("/api/v1/admin/footer/de", headers=admin_headers,
                          json={"data": {"description": "test"}})
        assert resp.status_code == 400

    def test_admin_required(self, client, auth_headers):
        resp = client.get("/api/v1/admin/footer", headers=auth_headers)
        assert resp.status_code == 403
