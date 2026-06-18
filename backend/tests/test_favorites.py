def test_get_favorites_empty(client, auth_headers):
    response = client.get("/api/v1/favorites/", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_add_favorite(client, auth_headers, test_part):
    response = client.post(
        "/api/v1/favorites/add",
        headers=auth_headers,
        json={"part_id": test_part.id},
    )
    assert response.status_code == 200


def test_remove_favorite(client, auth_headers, test_part):
    client.post(
        "/api/v1/favorites/add",
        headers=auth_headers,
        json={"part_id": test_part.id},
    )
    response = client.delete(
        f"/api/v1/favorites/{test_part.id}",
        headers=auth_headers,
    )
    assert response.status_code == 200


def test_favorites_unauthorized(client):
    response = client.get("/api/v1/favorites/")
    assert response.status_code == 200
    assert response.json()["items"] == []
