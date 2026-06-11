from sqlalchemy.orm import Session
from app.models import User, UserGarage, VehicleModification
from app.schemas.user_schemas import GarageAddSchema


class UserService:
    @staticmethod
    def get_user_profile(db: Session, user_id: int):
        return db.query(User).filter(User.id == user_id).first()

    @staticmethod
    def add_to_garage(db: Session, user_id: int, garage_data: GarageAddSchema):
        mod_id = garage_data.mod_id
        tecdoc_car_id = garage_data.tecdoc_car_id

        if not mod_id and not tecdoc_car_id:
            return None

        local_mod = None
        if mod_id:
            local_mod = db.query(VehicleModification).filter(VehicleModification.id == mod_id).first()
            if not local_mod:
                local_mod = db.query(VehicleModification).filter(VehicleModification.tecdoc_id == mod_id).first()
                if local_mod:
                    mod_id = local_mod.id

        stored_mod_id = mod_id if local_mod else None

        exists = db.query(UserGarage).filter(
            UserGarage.user_id == user_id,
            UserGarage.tecdoc_car_id == tecdoc_car_id
        ).first()
        if not exists and stored_mod_id:
            exists = db.query(UserGarage).filter(
                UserGarage.user_id == user_id,
                UserGarage.mod_id == stored_mod_id
            ).first()

        if exists:
            return exists

        new_entry = UserGarage(
            user_id=user_id,
            mod_id=stored_mod_id,
            tecdoc_car_id=tecdoc_car_id,
        )
        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)
        return new_entry

    @staticmethod
    def remove_from_garage(db: Session, user_id: int, entry_id: int):
        entry = db.query(UserGarage).filter(
            UserGarage.id == entry_id, 
            UserGarage.user_id == user_id
        ).first()
        if entry:
            db.delete(entry)
            db.commit()
            return True
        return False

    @staticmethod
    def get_user_garage(db: Session, user_id: int):
        return db.query(UserGarage).filter(UserGarage.user_id == user_id).all()


user_service = UserService()
