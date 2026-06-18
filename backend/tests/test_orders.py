def test_get_orders_empty(client, auth_headers):
    response = client.get("/api/v1/orders/", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_checkout(client, auth_headers, test_part, test_supplier_offer):
    client.post(
        "/api/v1/cart/add",
        headers=auth_headers,
        json={"part_id": test_part.id, "quantity": 2},
    )
    response = client.post(
        "/api/v1/orders/checkout",
        headers=auth_headers,
        json={
            "last_name": "Test",
            "first_name": "User",
            "phone": "+380501234567",
            "delivery_type": "nova_poshta",
            "delivery_city": "Kyiv",
            "delivery_warehouse": "1",
            "payment_method": "cash",
            "items": [{"part_id": test_part.id, "quantity": 2, "price": 1500.00}],
        },
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Order created"


def test_get_single_order(client, auth_headers, test_part, test_supplier_offer):
    client.post(
        "/api/v1/cart/add",
        headers=auth_headers,
        json={"part_id": test_part.id, "quantity": 1},
    )
    checkout_resp = client.post(
        "/api/v1/orders/checkout",
        headers=auth_headers,
        json={
            "last_name": "Test",
            "first_name": "User",
            "phone": "+380501234567",
            "delivery_type": "nova_poshta",
            "payment_method": "cash",
            "items": [{"part_id": test_part.id, "quantity": 1, "price": 1500.00}],
        },
    )
    order_id = checkout_resp.json()["order_id"]

    response = client.get(f"/api/v1/orders/{order_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "pending"


def test_orders_unauthorized(client):
    response = client.get("/api/v1/orders/")
    assert response.status_code == 401
