def test_get_me(client, auth_headers):
    response = client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"


def test_update_me(client, auth_headers):
    response = client.put(
        "/api/v1/users/me",
        headers=auth_headers,
        json={"first_name": "Updated"},
    )
    assert response.status_code == 200
    assert response.json()["first_name"] == "Updated"


def test_change_password(client, auth_headers):
    response = client.post(
        "/api/v1/users/change-password",
        headers=auth_headers,
        json={"current_password": "test_password", "new_password": "new_pass_123"},
    )
    assert response.status_code == 200


def test_garage_empty(client, auth_headers):
    response = client.get("/api/v1/users/garage", headers=auth_headers)
    assert response.status_code == 200
