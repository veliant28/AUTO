import pytest


class TestAuthFlow:
    """Integration tests for full auth flow"""

    def test_register_and_login(self, integration_client, db, integration_role):
        """Test register then login with the new user"""
        resp = integration_client.post(
            "/api/v1/auth/register",
            json={
                "email": "newflow@test.com",
                "password": "SecurePass123",
                "first_name": "Flow",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["role"] == "retail"

        resp2 = integration_client.post(
            "/api/v1/auth/login",
            json={"email": "newflow@test.com", "password": "SecurePass123"},
        )
        assert resp2.status_code == 200
        assert "access_token" in resp2.json()

    def test_login_wrong_password(self, integration_client, integration_user):
        """Login with wrong password returns 401"""
        resp = integration_client.post(
            "/api/v1/auth/login",
            json={"email": integration_user.email, "password": "wrong_password"},
        )
        assert resp.status_code == 401

    def test_register_duplicate_email(self, integration_client, integration_user):
        """Register with existing email returns 400"""
        resp = integration_client.post(
            "/api/v1/auth/register",
            json={
                "email": integration_user.email,
                "password": "AnotherPass123",
                "first_name": "Duplicate",
            },
        )
        assert resp.status_code == 400


class TestCartFlow:
    """Integration tests for cart operations"""

    def test_empty_cart(self, integration_client, integration_auth_headers):
        """New user has empty cart"""
        resp = integration_client.get("/api/v1/cart/", headers=integration_auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_add_to_cart(self, integration_client, integration_auth_headers, test_part, test_supplier_offer):
        """Add item to cart"""
        resp = integration_client.post(
            "/api/v1/cart/add",
            headers=integration_auth_headers,
            json={"part_id": test_part.id, "quantity": 2, "supplier_offer_id": test_supplier_offer.id},
        )
        assert resp.status_code == 200
        assert resp.json()["message"] == "Item added to cart"

    def test_cart_after_add(self, integration_client, integration_auth_headers, test_part, test_supplier_offer):
        """Cart contains the added item"""
        integration_client.post(
            "/api/v1/cart/add",
            headers=integration_auth_headers,
            json={"part_id": test_part.id, "quantity": 2, "supplier_offer_id": test_supplier_offer.id},
        )
        resp = integration_client.get("/api/v1/cart/", headers=integration_auth_headers)
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]["part_id"] == test_part.id
        assert items[0]["quantity"] == 2

    def test_cart_duplicate_add_increments(self, integration_client, integration_auth_headers, test_part, test_supplier_offer):
        """Adding same item twice increments quantity"""
        for _ in range(2):
            integration_client.post(
                "/api/v1/cart/add",
                headers=integration_auth_headers,
                json={"part_id": test_part.id, "quantity": 1, "supplier_offer_id": test_supplier_offer.id},
            )
        items = integration_client.get("/api/v1/cart/", headers=integration_auth_headers).json()
        assert len(items) == 1
        assert items[0]["quantity"] == 2

    def test_update_cart_quantity(self, integration_client, integration_auth_headers, test_part, test_supplier_offer):
        """Update item quantity in cart"""
        integration_client.post(
            "/api/v1/cart/add",
            headers=integration_auth_headers,
            json={"part_id": test_part.id, "quantity": 1, "supplier_offer_id": test_supplier_offer.id},
        )
        items = integration_client.get("/api/v1/cart/", headers=integration_auth_headers).json()
        item_id = items[0]["id"]

        resp = integration_client.put(
            f"/api/v1/cart/{item_id}",
            headers=integration_auth_headers,
            json={"quantity": 5},
        )
        assert resp.status_code == 200

        items = integration_client.get("/api/v1/cart/", headers=integration_auth_headers).json()
        assert items[0]["quantity"] == 5

    def test_remove_from_cart(self, integration_client, integration_auth_headers, test_part, test_supplier_offer):
        """Remove item from cart"""
        integration_client.post(
            "/api/v1/cart/add",
            headers=integration_auth_headers,
            json={"part_id": test_part.id, "quantity": 1, "supplier_offer_id": test_supplier_offer.id},
        )
        items = integration_client.get("/api/v1/cart/", headers=integration_auth_headers).json()
        item_id = items[0]["id"]

        resp = integration_client.delete(f"/api/v1/cart/{item_id}", headers=integration_auth_headers)
        assert resp.status_code == 200

        items = integration_client.get("/api/v1/cart/", headers=integration_auth_headers).json()
        assert items == []

    def test_clear_cart(self, integration_client, integration_auth_headers, test_part, test_supplier_offer):
        """Clear all items from cart"""
        integration_client.post(
            "/api/v1/cart/add",
            headers=integration_auth_headers,
            json={"part_id": test_part.id, "quantity": 1, "supplier_offer_id": test_supplier_offer.id},
        )
        resp = integration_client.delete("/api/v1/cart/", headers=integration_auth_headers)
        assert resp.status_code == 200

        items = integration_client.get("/api/v1/cart/", headers=integration_auth_headers).json()
        assert items == []

    def test_cart_unauthorized(self, integration_client):
        """Cart endpoints require auth"""
        resp = integration_client.get("/api/v1/cart/")
        assert resp.status_code == 401

        resp = integration_client.post("/api/v1/cart/add", json={"part_id": 1, "quantity": 1})
        assert resp.status_code == 401


class TestOrderFlow:
    """Integration tests for full order flow"""

    def test_checkout(self, integration_client, integration_auth_headers, test_part):
        """Create an order via checkout"""
        resp = integration_client.post(
            "/api/v1/orders/checkout",
            headers=integration_auth_headers,
            json={
                "last_name": "Test",
                "first_name": "User",
                "phone": "+380501234567",
                "delivery_type": "nova_poshta",
                "delivery_city": "Kyiv",
                "delivery_warehouse": "Warehouse 1",
                "payment_method": "cash",
                "items": [
                    {"part_id": test_part.id, "quantity": 2, "price": 1500.00},
                ],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "Order created"
        assert "order_id" in data

    def test_get_orders(self, integration_client, integration_auth_headers, test_part):
        """Get orders list after checkout"""
        integration_client.post(
            "/api/v1/orders/checkout",
            headers=integration_auth_headers,
            json={
                "last_name": "Test",
                "first_name": "User",
                "phone": "+380501234567",
                "delivery_type": "nova_poshta",
                "delivery_city": "Kyiv",
                "delivery_warehouse": "Warehouse 1",
                "payment_method": "cash",
                "items": [
                    {"part_id": test_part.id, "quantity": 1, "price": 1500.00},
                ],
            },
        )
        resp = integration_client.get("/api/v1/orders/", headers=integration_auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1
        order = data["items"][0]
        assert order["status"] == "pending"
        assert order["total"] == 1500.0

    def test_get_single_order(self, integration_client, integration_auth_headers, test_part):
        """Get a single order by ID"""
        checkout = integration_client.post(
            "/api/v1/orders/checkout",
            headers=integration_auth_headers,
            json={
                "last_name": "Test",
                "first_name": "User",
                "phone": "+380501234567",
                "delivery_type": "nova_poshta",
                "delivery_city": "Kyiv",
                "delivery_warehouse": "Warehouse 1",
                "payment_method": "cash",
                "items": [
                    {"part_id": test_part.id, "quantity": 1, "price": 1500.00},
                ],
            },
        )
        order_id = checkout.json()["order_id"]

        resp = integration_client.get(f"/api/v1/orders/{order_id}", headers=integration_auth_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == order_id
        assert resp.json()["status"] == "pending"

    def test_get_orders_unauthorized(self, integration_client):
        """Orders endpoints require auth"""
        resp = integration_client.get("/api/v1/orders/")
        assert resp.status_code == 401

        resp = integration_client.get("/api/v1/orders/1")
        assert resp.status_code == 401


class TestCartCheckoutFlow:
    """Full flow: add to cart → checkout → verify order"""

    def test_full_flow(self, integration_client, integration_auth_headers, test_part, test_supplier_offer):
        """Complete flow: add to cart, checkout, verify order"""
        add = integration_client.post(
            "/api/v1/cart/add",
            headers=integration_auth_headers,
            json={"part_id": test_part.id, "quantity": 2, "supplier_offer_id": test_supplier_offer.id},
        )
        assert add.status_code == 200

        cart = integration_client.get("/api/v1/cart/", headers=integration_auth_headers).json()
        assert len(cart) == 1
        assert cart[0]["quantity"] == 2

        checkout = integration_client.post(
            "/api/v1/orders/checkout",
            headers=integration_auth_headers,
            json={
                "last_name": "Test",
                "first_name": "User",
                "phone": "+380501234567",
                "delivery_type": "nova_poshta",
                "delivery_city": "Kyiv",
                "delivery_warehouse": "Warehouse 1",
                "payment_method": "cash",
                "items": [
                    {"part_id": test_part.id, "quantity": 2, "price": 1500.00},
                ],
            },
        )
        assert checkout.status_code == 200
        order_id = checkout.json()["order_id"]

        orders = integration_client.get("/api/v1/orders/", headers=integration_auth_headers).json()
        assert len(orders["items"]) == 1
        assert orders["items"][0]["id"] == order_id
        assert orders["items"][0]["total"] == 3000.0
