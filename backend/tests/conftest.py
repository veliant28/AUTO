import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["TECDOC_DATABASE_URL"] = "sqlite:///:memory:"
os.environ["AUTO_PARTS_PROTECTION_ENABLED"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.db import get_db, get_tecdoc_db
from app.main import app
from app.models import Base, User, Role, Permission, RolePermission
os.environ["AUTO_PARTS_PROTECTION_ENABLED"] = "false"

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    echo=False,
    poolclass=StaticPool
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def retail_role(db):
    role = Role(name="retail", description="retail role")
    db.add(role)
    db.commit()
    db.refresh(role)
    return role

@pytest.fixture
def admin_role(db):
    role = Role(name="admin", description="admin role")
    db.add(role)
    db.commit()
    db.refresh(role)

    # Seed all permissions and assign them to admin role
    all_perms = [
        "dashboard.view", "orders.view", "orders.edit_status", "orders.delete",
        "users.view", "users.create", "users.edit", "users.delete",
        "catalog.view",
        "roles.view", "roles.create", "roles.edit", "roles.delete", "roles.assign",
        "tecdoc.view", "tecdoc.batch", "tecdoc.sync", "tecdoc.settings",
        "footer.edit", "settings.edit",
        "novaposhta.view", "novaposhta.create", "novaposhta.edit", "novaposhta.print", "novaposhta.tracking", "novaposhta.delete",
        "products.view", "products.create", "products.edit", "products.delete",
        "brands.view",
        "categories.view", "categories.create", "categories.edit", "categories.delete",
        "pricing.view", "pricing.edit", "pricing.apply",
        "suppliers.view", "suppliers.create", "suppliers.edit", "suppliers.delete",
        "protection.view", "protection.ban", "protection.unban", "protection.edit",
        "imports.view", "imports.create", "imports.delete", "imports.edit",
        "support.view", "support.reply",
        "backup.view", "backup.run", "backup.download", "backup.config", "backup.delete",
        "workers.view", "workers.restart",
        "staff.view",
        "loyalty.view", "loyalty.create",
        "waybills.view", "waybills.print",
        "returns.view", "returns.edit_status", "returns.delete", "returns.edit",
        "checkbox.view", "payments.view",
    ]
    for i, codename in enumerate(all_perms, start=1):
        perm = Permission(id=i, codename=codename, description="", group_name="")
        db.add(perm)
        db.flush()
        rp = RolePermission(role_id=role.id, permission_id=perm.id)
        db.add(rp)
    db.commit()
    return role

@pytest.fixture
def test_user(db, retail_role):
    user = User(
        email="test@example.com",
        password_hash="$2b$12$6qW0DnNZjgNuB6GWlEGGv.DRbOeaRywnAzKoxhMnhYzfamBRSE2xG",
        first_name="Test",
        avatar_index=0,
        role_id=retail_role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@pytest.fixture
def admin_user(db, admin_role):
    user = User(
        email="admin@example.com",
        password_hash="$2b$12$6qW0DnNZjgNuB6GWlEGGv.DRbOeaRywnAzKoxhMnhYzfamBRSE2xG",
        first_name="Admin",
        avatar_index=0,
        role_id=admin_role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@pytest.fixture
def auth_headers(client, test_user):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "test_password"}
    )
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    if response.status_code != 200:
        pytest.skip(f"Login failed: {response.json()}")
    return headers

@pytest.fixture
def admin_headers(client, admin_user):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": admin_user.email, "password": "test_password"}
    )
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    if response.status_code != 200:
        pytest.skip(f"Login failed: {response.json()}")
    return headers

@pytest.fixture
def tecdoc_db():
    Base.metadata.create_all(bind=engine)
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def test_part(db):
    from app.models.parts import Part
    part = Part(article="TST001", brand="Test", name="Test Part", brand_id=0)
    db.add(part)
    db.commit()
    db.refresh(part)
    return part


@pytest.fixture
def test_supplier(db):
    from app.models.suppliers import Supplier
    s = Supplier(name="Test Supplier")
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def test_supplier_offer(db, test_part, test_supplier):
    from app.models.suppliers import SupplierOffer
    offer = SupplierOffer(
        part_id=test_part.id,
        supplier_id=test_supplier.id,
        price=100.0,
        currency="UAH",
        quantity=5,
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer
