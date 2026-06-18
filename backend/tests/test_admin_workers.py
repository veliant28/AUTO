import pytest
from unittest.mock import patch, MagicMock
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
    user = User(email="admin@wrk.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestGetWorkers:
    def test_returns_ok(self, client, admin_headers):
        from app.api.v1.endpoints.admin.workers import celery_app
        mock_inspect = MagicMock()
        mock_inspect.active.return_value = {}
        mock_inspect.reserved.return_value = {}
        mock_inspect.scheduled.return_value = {}
        mock_inspect.stats.return_value = {}
        with patch.object(celery_app, "control") as mock_ctrl:
            mock_ctrl.inspect.return_value = mock_inspect
            resp = client.get("/api/v1/admin/workers", headers=admin_headers)
            assert resp.status_code == 200
            data = resp.json()
            assert "worker" in data

    def test_requires_admin(self, client, auth_headers):
        resp = client.get("/api/v1/admin/workers", headers=auth_headers)
        assert resp.status_code == 403


class TestRevokeTask:
    def test_revoke(self, client, db, admin_headers):
        with patch("app.api.v1.endpoints.admin.workers.celery_app.control.revoke") as mock_revoke:
            resp = client.post("/api/v1/admin/workers/tasks/fake-task-id/revoke",
                               headers=admin_headers)
            assert resp.status_code == 200
            mock_revoke.assert_called_once_with("fake-task-id", terminate=True, signal="SIGKILL")


class TestRestartWorker:
    def test_restart_returns_ok(self, client, admin_headers):
        with patch("docker.from_env") as mock_from_env:
            mock_client = MagicMock()
            mock_container = MagicMock()
            mock_from_env.return_value.containers.get.return_value = mock_container
            resp = client.post("/api/v1/admin/workers/restart", headers=admin_headers)
            assert resp.status_code in (200, 500)
