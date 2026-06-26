import pytest
from app.core.security import verify_password, get_password_hash


def test_password_hashing():
    password = "test123"
    hash1 = get_password_hash(password)
    hash2 = get_password_hash(password)
    assert hash1 != hash2


def test_password_verification():
    password = "correct_password"
    hashed = get_password_hash(password)
    assert verify_password(password, hashed)
    assert not verify_password("wrong_password", hashed)


def test_register(client, db, retail_role):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "password": "TestPass123",
            "first_name": "John"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user_id"] is not None
    assert data["role"] == "retail"


def test_login(client, test_user):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": test_user.email,
            "password": "test_password"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user_id"] == test_user.id


def test_login_wrong_password(client, test_user):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": test_user.email,
            "password": "wrong_password"
        }
    )
    assert response.status_code == 401


def test_register_duplicate_email(client, test_user):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": test_user.email,
            "password": "TestPass123",
            "first_name": "Another"
        }
    )
    assert response.status_code == 400


def test_get_current_user(client, auth_headers):
    response = client.get(
        "/api/v1/users/me",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "email" in data


def test_change_password(client, test_user, auth_headers):
    response = client.post(
        "/api/v1/users/change-password",
        headers=auth_headers,
        json={
            "current_password": "test_password",
            "new_password": "NewPassword123"
        }
    )
    assert response.status_code == 200


def test_change_password_wrong_current(client, test_user, auth_headers):
    response = client.post(
        "/api/v1/users/change-password",
        headers=auth_headers,
        json={
            "current_password": "wrong_password",
            "new_password": "NewPassword123"
        }
    )
    assert response.status_code == 400
