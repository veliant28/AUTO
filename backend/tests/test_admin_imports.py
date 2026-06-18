import unittest.mock
import pytest
import os
from app.core.security import get_password_hash
from app.models import Role, User
from app.models.tecdoc import SupplierPrice
from app.models.imports import PriceImport, SupplierConfig


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
    user = User(email="admin@imp.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestListImports:
    def test_list_empty(self, client, admin_headers):
        resp = client.get("/api/v1/admin/imports", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    def test_list_with_data(self, client, db, admin_headers):
        imp = PriceImport(supplier="GPL", status="complete", format="xlsx")
        db.add(imp)
        db.commit()
        resp = client.get("/api/v1/admin/imports", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1

    def test_filter_by_supplier(self, client, db, admin_headers):
        PriceImport(supplier="GPL", status="complete", format="xlsx")
        PriceImport(supplier="UTR", status="pending", format="xlsx")
        db.commit()
        resp = client.get("/api/v1/admin/imports?supplier=GPL", headers=admin_headers)
        assert resp.status_code == 200

    def test_requires_admin(self, client, auth_headers):
        resp = client.get("/api/v1/admin/imports", headers=auth_headers)
        assert resp.status_code == 403


class TestDownloadImport:
    def test_not_found(self, client, admin_headers):
        resp = client.get("/api/v1/admin/imports/99999/download", headers=admin_headers)
        assert resp.status_code == 404

    def test_no_file(self, client, db, admin_headers):
        imp = PriceImport(supplier="GPL", status="complete", format="xlsx")
        db.add(imp)
        db.commit()
        resp = client.get(f"/api/v1/admin/imports/{imp.id}/download", headers=admin_headers)
        assert resp.status_code == 404


class TestPromoteImport:
    def test_not_found(self, client, admin_headers):
        resp = client.post("/api/v1/admin/imports/99999/promote", headers=admin_headers)
        assert resp.status_code == 404

    def test_promote_starts_task(self, client, db, admin_headers):
        imp = PriceImport(supplier="GPL", status="complete", format="xlsx", matched_items=5)
        db.add(imp)
        db.commit()
        with unittest.mock.patch("app.workers.tasks.import_tasks.promote_import_task.delay"):
            resp = client.post(f"/api/v1/admin/imports/{imp.id}/promote", headers=admin_headers)
            assert resp.status_code == 200
            assert resp.json()["task_started"] is True


class TestDeleteImport:
    def test_not_found(self, client, admin_headers):
        resp = client.delete("/api/v1/admin/imports/99999", headers=admin_headers)
        assert resp.status_code == 404

    def test_delete_existing(self, client, db, admin_headers):
        imp = PriceImport(supplier="GPL", status="pending", format="xlsx")
        db.add(imp)
        db.commit()
        resp = client.delete(f"/api/v1/admin/imports/{imp.id}", headers=admin_headers)
        assert resp.status_code == 200
