import pytest
from unittest.mock import MagicMock, patch
from app.core.security import get_password_hash
from app.models import Role, User, TelegramLink


@pytest.fixture
def user_headers(client, test_user):
    resp = client.post("/api/v1/auth/login", json={"email": test_user.email, "password": "test_password"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestTelegram:
    def test_start_connection(self, client, db, user_headers):
        resp = client.post("/api/v1/telegram/start", headers=user_headers)
        assert resp.status_code == 200
        assert "code" in resp.json()
        assert resp.json()["connected"] is False

    def test_connection_status_not_connected(self, client, user_headers):
        resp = client.get("/api/v1/telegram/status", headers=user_headers)
        assert resp.status_code == 200
        assert resp.json()["connected"] is False

    def test_disconnect_not_connected(self, client, user_headers):
        resp = client.post("/api/v1/telegram/disconnect", headers=user_headers)
        assert resp.status_code == 400
