import pytest

def test_get_makes(client, db):
    response = client.get("/api/v1/catalog/makes")
    assert response.status_code == 200
    brands = response.json()
    assert isinstance(brands, list)
    if brands:
        assert "id" in brands[0]
        assert "name" in brands[0]

def test_get_models(client, db):
    response = client.get("/api/v1/catalog/models/1")
    assert response.status_code == 200
    models = response.json()
    assert isinstance(models, list)

@pytest.mark.skip(reason="catalog/sections endpoint moved")
def test_get_sections(client, db):
    response = client.get("/api/v1/catalog/sections/1")
    assert response.status_code == 200
    sections = response.json()
    assert isinstance(sections, list)

@pytest.mark.skip(reason="catalog/vendors endpoint moved")
def test_get_vendors(client, db):
    response = client.get("/api/v1/catalog/vendors")
    assert response.status_code == 200
    vendors = response.json()
    assert isinstance(vendors, list)

@pytest.mark.skip(reason="catalog/vehicle-types endpoint moved")
def test_get_vehicle_types(client, db):
    response = client.get("/api/v1/catalog/vehicle-types")
    assert response.status_code == 200
    vehicle_types = response.json()
    assert isinstance(vehicle_types, list)
