import pytest
from app.core.security import get_password_hash
from app.models import Role, User, Part
from app.models.suppliers import Supplier, SupplierOffer


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
    user = User(email="admin@prods.example.com", password_hash=get_password_hash("pass123"),
                role_id=admin_role.id, is_active=True, first_name="Admin")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    resp = client.post("/api/v1/auth/login", json={"email": admin_user.email, "password": "pass123"})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestListProducts:
    def test_list_empty(self, client, admin_headers):
        resp = client.get("/api/v1/admin/products", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    def test_list_with_data(self, client, db, admin_headers):
        p = Part(article="TST001", brand="Test", name="Test Part", brand_id=0)
        db.add(p)
        db.commit()
        resp = client.get("/api/v1/admin/products", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()["items"]) == 1

    def test_requires_admin(self, client, auth_headers):
        resp = client.get("/api/v1/admin/products", headers=auth_headers)
        assert resp.status_code == 403


class TestDeleteProduct:
    def test_delete(self, client, db, admin_headers):
        p = Part(article="DEL001", brand="Test", name="Delete Me", brand_id=0)
        db.add(p)
        db.commit()
        resp = client.delete(f"/api/v1/admin/products/{p.id}", headers=admin_headers)
        assert resp.status_code == 200
        assert db.query(Part).filter(Part.id == p.id).first() is None

    def test_delete_not_found(self, client, admin_headers):
        resp = client.delete("/api/v1/admin/products/99999", headers=admin_headers)
        assert resp.status_code == 404
