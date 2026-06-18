import pytest
from app.models import VehicleBrand, VehicleModel, VehicleModification, Part, PartCategory


class TestMakes:
    def test_list_empty(self, client):
        resp = client.get("/api/v1/catalog/makes")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_with_data(self, client, db):
        b = VehicleBrand(name="Toyota", tecdoc_id=1, group="passenger")
        db.add(b)
        db.commit()
        resp = client.get("/api/v1/catalog/makes")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["name"] == "Toyota"


class TestModels:
    def test_list_empty(self, client, db):
        resp = client.get("/api/v1/catalog/models/1")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_with_data(self, client, db):
        b = VehicleBrand(name="Honda", tecdoc_id=2, group="passenger")
        db.add(b)
        db.flush()
        m = VehicleModel(name="Civic", tecdoc_id=10, brand_id=b.id)
        db.add(m)
        db.commit()
        resp = client.get(f"/api/v1/catalog/models/{b.id}")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestModifications:
    def test_list_empty(self, client, db):
        resp = client.get("/api/v1/catalog/modifications/1")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_with_data(self, client, db):
        b = VehicleBrand(name="BMW", tecdoc_id=3, group="passenger")
        db.add(b)
        db.flush()
        m = VehicleModel(name="3 Series", tecdoc_id=30, brand_id=b.id)
        db.add(m)
        db.flush()
        mod = VehicleModification(name="320i", tecdoc_id=300, model_id=m.id)
        db.add(mod)
        db.commit()
        resp = client.get(f"/api/v1/catalog/modifications/{m.id}")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestSections:
    def test_list_sections(self, client, db):
        b = VehicleBrand(name="Audi", tecdoc_id=4, group="passenger")
        db.add(b)
        db.flush()
        m = VehicleModel(name="A4", tecdoc_id=40, brand_id=b.id)
        db.add(m)
        db.flush()
        mod = VehicleModification(name="2.0 TDI", tecdoc_id=400, model_id=m.id)
        db.add(mod)
        db.commit()
        from unittest.mock import patch
        from app.services.sync_service import sync_service
        with patch.object(sync_service, "sync_sections", return_value=None):
            resp = client.get(f"/api/v1/catalog/sections/{mod.id}")
            assert resp.status_code == 200
            assert isinstance(resp.json(), list)


class TestSearch:
    def test_search_by_article(self, client, db):
        p = Part(article="BR001", brand="Bosch", name="Brake Pad Set", brand_id=0)
        db.add(p)
        db.commit()
        resp = client.get("/api/v1/catalog/search?q=BR001", follow_redirects=True)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_search_empty(self, client):
        resp = client.get("/api/v1/catalog/search?q=ZZZ999")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_search_no_query(self, client):
        resp = client.get("/api/v1/catalog/search")
        assert resp.status_code == 422


class TestAutocomplete:
    def test_autocomplete(self, client, db):
        p = Part(article="TESTART", brand="Test", name="Test Part", brand_id=0)
        db.add(p)
        db.commit()
        resp = client.get("/api/v1/catalog/search/autocomplete?q=TEST", follow_redirects=True)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1
