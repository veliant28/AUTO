from sqlalchemy.orm import Session
from app.models import User, UserGarage, VehicleModification
from app.schemas.user_schemas import GarageAddSchema

class UserService:
    @staticmethod
    def get_user_profile(db: Session, user_id: int):
        return db.query(User).filter(User.id == user_id).first()

    @staticmethod
    def add_to_garage(db: Session, user_id: int, garage_data: GarageAddSchema):
        exists = db.query(UserGarage).filter(
            UserGarage.user_id == user_id, 
            UserGarage.mod_id == garage_data.mod_id
        ).first()
        
        if exists:
            return exists
            
        new_entry = UserGarage(user_id=user_id, mod_id=garage_data.mod_id)
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
        return db.query(UserGarage).join(VehicleModification).filter(UserGarage.user_id == user_id).all()

user_service = UserService()
