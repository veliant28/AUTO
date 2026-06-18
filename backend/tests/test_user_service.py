import pytest
from app.models import User, UserGarage, VehicleBrand, VehicleModel, VehicleModification
from app.schemas.user_schemas import GarageAddSchema
from app.services.user_service import user_service


class TestUserProfile:
    def test_get_profile(self, db, test_user):
        profile = user_service.get_user_profile(db, test_user.id)
        assert profile is not None
        assert profile.id == test_user.id

    def test_get_profile_not_found(self, db):
        profile = user_service.get_user_profile(db, 99999)
        assert profile is None


class TestAddToGarage:
    def _brand(self, db):
        b = VehicleBrand(name="TestBrand", tecdoc_id=1, group="passenger")
        db.add(b)
        db.flush()
        return b

    def _model(self, db, brand):
        m = VehicleModel(name="TestModel", tecdoc_id=10, brand_id=brand.id)
        db.add(m)
        db.flush()
        return m

    def _mod(self, db, model):
        m = VehicleModification(name="1.6 MPI", tecdoc_id=12345, model_id=model.id)
        db.add(m)
        db.flush()
        return m

    def test_add_with_mod_id(self, db, test_user):
        brand = self._brand(db)
        model = self._model(db, brand)
        mod = self._mod(db, model)
        entry = user_service.add_to_garage(db, test_user.id,
            GarageAddSchema(mod_id=mod.id, tecdoc_car_id=mod.tecdoc_id))
        assert entry is not None
        assert entry.user_id == test_user.id
        assert entry.mod_id == mod.id

    def test_add_with_tecdoc_car_id(self, db, test_user):
        entry = user_service.add_to_garage(db, test_user.id,
            GarageAddSchema(mod_id=0, tecdoc_car_id=999))
        assert entry is not None
        assert entry.tecdoc_car_id == 999

    def test_returns_existing_entry(self, db, test_user):
        entry = user_service.add_to_garage(db, test_user.id,
            GarageAddSchema(mod_id=0, tecdoc_car_id=555))
        duplicate = user_service.add_to_garage(db, test_user.id,
            GarageAddSchema(mod_id=0, tecdoc_car_id=555))
        assert duplicate.id == entry.id

    def test_returns_none_when_no_ids(self, db, test_user):
        result = user_service.add_to_garage(db, test_user.id,
            GarageAddSchema(mod_id=0, tecdoc_car_id=0))
        assert result is None


class TestRemoveFromGarage:
    def test_remove_own_entry(self, db, test_user):
        entry = user_service.add_to_garage(db, test_user.id,
            GarageAddSchema(mod_id=0, tecdoc_car_id=777))
        result = user_service.remove_from_garage(db, test_user.id, entry.id)
        assert result is True
        assert db.query(UserGarage).filter(UserGarage.id == entry.id).first() is None

    def test_cannot_remove_others_entry(self, db, test_user):
        entry = user_service.add_to_garage(db, test_user.id,
            GarageAddSchema(mod_id=0, tecdoc_car_id=888))
        result = user_service.remove_from_garage(db, 99999, entry.id)
        assert result is False

    def test_remove_nonexistent(self, db, test_user):
        result = user_service.remove_from_garage(db, test_user.id, 99999)
        assert result is False


class TestGetGarage:
    def test_get_empty_garage(self, db, test_user):
        assert user_service.get_user_garage(db, test_user.id) == []

    def test_get_garage_with_entries(self, db, test_user):
        user_service.add_to_garage(db, test_user.id,
            GarageAddSchema(mod_id=0, tecdoc_car_id=101))
        user_service.add_to_garage(db, test_user.id,
            GarageAddSchema(mod_id=0, tecdoc_car_id=102))
        entries = user_service.get_user_garage(db, test_user.id)
        assert len(entries) == 2
