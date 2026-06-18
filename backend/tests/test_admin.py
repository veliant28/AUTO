import pytest

def test_admin_dashboard(client, auth_headers):
    response = client.get(
        "/api/v1/admin/dashboard",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)

def test_get_users(client, auth_headers, test_user):
    response = client.get(
        "/api/v1/admin/users",
        headers=auth_headers
    )
    assert response.status_code == 200
    users = response.json()
    assert isinstance(users, list)

def test_get_all_brands(client, auth_headers):
    response = client.get(
        "/api/v1/admin/brands",
        headers=auth_headers
    )
    assert response.status_code == 200
    brands = response.json()
    assert isinstance(brands, list)

def test_get_all_parts(client, auth_headers):
    response = client.get(
        "/api/v1/admin/parts",
        headers=auth_headers
    )
    assert response.status_code == 200
    parts = response.json()
    assert isinstance(parts, list)

def test_get_all_orders(client, auth_headers):
    response = client.get(
        "/api/v1/admin/orders",
        headers=auth_headers
    )
    assert response.status_code == 200
    orders = response.json()
    assert isinstance(orders, list)

def test_get_statistics(client, auth_headers):
    response = client.get(
        "/api/v1/admin/statistics",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
