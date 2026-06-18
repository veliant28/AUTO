def test_get_cart_empty(client, auth_headers):
    response = client.get("/api/v1/cart/", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_add_to_cart(client, auth_headers, test_part, test_supplier_offer):
    response = client.post(
        "/api/v1/cart/add",
        headers=auth_headers,
        json={"part_id": test_part.id, "quantity": 2},
    )
    assert response.status_code == 200


def test_update_cart_quantity(client, auth_headers, test_part, test_supplier_offer):
    client.post(
        "/api/v1/cart/add",
        headers=auth_headers,
        json={"part_id": test_part.id, "quantity": 1},
    )
    cart = client.get("/api/v1/cart/", headers=auth_headers).json()
    item_id = cart[0]["id"]

    response = client.put(
        f"/api/v1/cart/{item_id}",
        headers=auth_headers,
        json={"quantity": 5},
    )
    assert response.status_code == 200


def test_remove_from_cart(client, auth_headers, test_part, test_supplier_offer):
    client.post(
        "/api/v1/cart/add",
        headers=auth_headers,
        json={"part_id": test_part.id, "quantity": 1},
    )
    cart = client.get("/api/v1/cart/", headers=auth_headers).json()
    item_id = cart[0]["id"]

    response = client.delete(
        f"/api/v1/cart/{item_id}",
        headers=auth_headers,
    )
    assert response.status_code == 200


def test_cart_unauthorized(client):
    response = client.get("/api/v1/cart/")
    assert response.status_code == 401
