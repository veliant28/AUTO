import pytest

def test_admin_dashboard(client, admin_headers):
    response = client.get(
        "/api/v1/admin/dashboard",
        headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)

def test_get_users(client, admin_headers, test_user):
    response = client.get(
        "/api/v1/admin/users",
        headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)  # paginated response
    assert "items" in data

def test_get_all_brands(client, admin_headers):
    response = client.get(
        "/api/v1/admin/brands",
        headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)  # paginated response
    assert "items" in data

def test_get_all_parts(client, admin_headers):
    response = client.get(
        "/api/v1/admin/products",
        params={"page": 1, "page_size": 10},
        headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "items" in data

def test_get_all_orders(client, admin_headers):
    response = client.get(
        "/api/v1/admin/orders",
        headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)  # paginated response
    assert "items" in data

def test_get_statistics(client, admin_headers):
    response = client.get(
        "/api/v1/admin/dashboard",
        headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
