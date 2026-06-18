import pytest
from app.core.security import get_password_hash
from app.models import Role, User, PartCategory


class TestCategoriesHeader:
    def test_returns_structure(self, client):
        resp = client.get("/api/v1/categories/header")
        assert resp.status_code == 200
        data = resp.json()
        assert "categories" in data
        assert "zapchasti_dlya_to" in data

    def test_with_locale(self, client):
        resp = client.get("/api/v1/categories/header?locale=en")
        assert resp.status_code == 200

    def test_invalid_locale_falls_back(self, client):
        resp = client.get("/api/v1/categories/header?locale=de")
        assert resp.status_code == 422  # FastAPI validation rejects
