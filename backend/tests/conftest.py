import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.db import get_db, get_tecdoc_db
from app.main import app
from app.models import Base, User, Role
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["TECDOC_DATABASE_URL"] = "sqlite:///:memory:"

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
