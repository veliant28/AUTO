import pytest
from unittest.mock import MagicMock


@pytest.fixture
def mock_tecdoc():
    """Override get_tecdoc_db with a mock session."""
    mock_db = MagicMock()
    mock_db.execute.return_value.fetchall.return_value = []
    mock_db.execute.return_value.scalar.return_value = 0

    from app.core.db import get_tecdoc_db
    from app.main import app
    app.dependency_overrides[get_tecdoc_db] = lambda: mock_db
    yield mock_db
    app.dependency_overrides.pop(get_tecdoc_db, None)


class TestVehicleYears:
    def test_returns_empty_passenger(self, client, mock_tecdoc):
        resp = client.get("/api/v1/catalog/vehicle/years?type=passenger")
        assert resp.status_code == 200

    def test_returns_empty_invalid_type(self, client, mock_tecdoc):
        resp = client.get("/api/v1/catalog/vehicle/years?type=invalid")
        assert resp.status_code == 200
        assert resp.json() == []


class TestVehicleMakes:
    def test_requires_year(self, client, mock_tecdoc):
        resp = client.get("/api/v1/catalog/vehicle/makes?type=passenger&year=2020")
        assert resp.status_code == 200


class TestVehicleModels:
    def test_requires_year_and_make(self, client, mock_tecdoc):
        resp = client.get("/api/v1/catalog/vehicle/models?type=passenger&year=2020&make_id=1")
        assert resp.status_code == 200


class TestVehicleCars:
    def test_requires_year_and_model(self, client, mock_tecdoc):
        resp = client.get("/api/v1/catalog/vehicle/cars?type=passenger&year=2020&model_id=1")
        assert resp.status_code == 200


class TestVehicleVolumes:
    def test_requires_year_and_model(self, client, mock_tecdoc):
        resp = client.get("/api/v1/catalog/vehicle/volumes?year=2020&model_id=1")
        assert resp.status_code == 200


class TestVehicleEngines:
    def test_requires_year_and_model(self, client, mock_tecdoc):
        resp = client.get("/api/v1/catalog/vehicle/engines?year=2020&car_id=1")
        assert resp.status_code == 200
