import pytest
from unittest.mock import MagicMock, patch
from app.core.security import get_password_hash
from app.models import Role, User


@pytest.fixture
def admin_user(db, admin_role):
    user = User(email="admin@catadm.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def mock_tecdoc(rows=None):
    """Mock a tecdoc_db session with execute() returning given rows."""
    mock_db = MagicMock()
    mock_db.execute.return_value.fetchall.return_value = rows or []
    mock_db.execute.return_value.scalar.return_value = 0

    def override():
        return mock_db

    return override, mock_db


class TestGetTypes:
    def test_returns_types(self, client, admin_headers):
        override_fn, _ = mock_tecdoc()
        from app.core.db import get_tecdoc_db
        from app.main import app
        app.dependency_overrides[get_tecdoc_db] = override_fn
        try:
            resp = client.get("/api/v1/admin/catalog/types", headers=admin_headers)
            assert resp.status_code == 200
            assert len(resp.json()) == 3
        finally:
            app.dependency_overrides.pop(get_tecdoc_db, None)


class TestGetYears:
    def test_empty(self, client, admin_headers):
        override_fn, _ = mock_tecdoc([])
        from app.core.db import get_tecdoc_db
        from app.main import app
        app.dependency_overrides[get_tecdoc_db] = override_fn
        try:
            resp = client.get("/api/v1/admin/catalog/years?type=passenger", headers=admin_headers)
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.pop(get_tecdoc_db, None)


class TestGetMakes:
    def test_empty(self, client, admin_headers):
        override_fn, mock_db = mock_tecdoc()
        mock_db.execute.return_value.fetchall.return_value = [(1, "Toyota"), (2, "BMW")]
        from app.core.db import get_tecdoc_db
        from app.main import app
        app.dependency_overrides[get_tecdoc_db] = override_fn
        try:
            resp = client.get("/api/v1/admin/catalog/makes?type=passenger&year=2020", headers=admin_headers)
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.pop(get_tecdoc_db, None)
