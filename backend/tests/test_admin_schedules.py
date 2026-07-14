import pytest
from app.core.security import get_password_hash
from app.models import Role, User
from app.models.imports import ImportSchedule


@pytest.fixture
def admin_user(db, admin_role):
    user = User(email="admin@sch.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestListSchedules:
    def test_list_empty(self, client, admin_headers):
        resp = client.get("/api/v1/admin/schedules", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_with_data(self, client, db, admin_headers):
        s = ImportSchedule(supplier="GPL", run_at_time="10:00", enabled=True)
        db.add(s)
        db.commit()
        resp = client.get("/api/v1/admin/schedules", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_requires_admin(self, client, auth_headers):
        resp = client.get("/api/v1/admin/schedules", headers=auth_headers)
        assert resp.status_code == 403


class TestUpdateSchedule:
    def test_update(self, client, db, admin_headers):
        s = ImportSchedule(supplier="UTR", run_at_time="08:00", enabled=False)
        db.add(s)
        db.commit()
        resp = client.put("/api/v1/admin/schedules/UTR", headers=admin_headers,
                          json={"enabled": True})
        assert resp.status_code == 200
        assert resp.json()["enabled"] is True

    def test_update_not_found(self, client, admin_headers):
        resp = client.put("/api/v1/admin/schedules/UNKNOWN", headers=admin_headers,
                          json={"enabled": True})
        assert resp.status_code == 404


class TestRunSchedule:
    def test_run_not_found(self, client, admin_headers):
        resp = client.post("/api/v1/admin/schedules/UNKNOWN/run", headers=admin_headers)
        assert resp.status_code == 404
