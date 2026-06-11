from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text
from typing import List
import hashlib
from app.core.db import get_db, get_tecdoc_db
from app.schemas.user_schemas import UserSchema, ProfileUpdate, ChangePasswordSchema, GarageVehicleSchema, GarageAddSchema
from app.services.user_service import user_service
from app.models import User, UserGarage, VehicleModification, VehicleModel, VehicleBrand
from app.api.v1.endpoints.auth import get_current_user

router = APIRouter()


def _user_to_schema(user: User) -> UserSchema:
    return UserSchema(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.name,
        is_active=user.is_active,
        phone=user.phone,
        last_name=user.last_name,
        first_name=user.first_name,
        middle_name=user.middle_name,
        delivery_type=user.delivery_type,
        delivery_city=user.delivery_city,
        delivery_warehouse=user.delivery_warehouse,
    )


@router.get("/me", response_model=UserSchema)
async def get_me(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    user = user_service.get_user_profile(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_schema(user)


@router.put("/me", response_model=UserSchema)
async def update_me(data: ProfileUpdate, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    update_data = data.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return _user_to_schema(user)


@router.post("/change-password")
async def change_password(data: ChangePasswordSchema, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    current_hash = hashlib.sha256(data.current_password.encode()).hexdigest()
    if user.password_hash != current_hash:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hashlib.sha256(data.new_password.encode()).hexdigest()
    db.commit()
    return {"message": "Password changed"}


@router.get("/garage", response_model=List[GarageVehicleSchema])
async def get_garage(user_id: int = Depends(get_current_user), db: Session = Depends(get_db), tecdb: Session = Depends(get_tecdoc_db)):
    entries = user_service.get_user_garage(db, user_id)
    
    result = []
    for entry in entries:
        if entry.mod_id and entry.modification:
            mod = entry.modification
            model = db.query(VehicleModel).filter(VehicleModel.id == mod.model_id).first()
            brand = db.query(VehicleBrand).filter(VehicleBrand.id == model.brand_id).first() if model else None
            result.append({
                "id": entry.id,
                "mod_id": mod.id,
                "name": mod.name,
                "model_name": model.name if model else "",
                "brand_name": brand.name if brand else "",
                "tecdoc_car_id": entry.tecdoc_car_id,
            })
        elif entry.tecdoc_car_id:
            row = None
            for tbl, joins in [
                ("autodb_passenger_cars pc JOIN autodb_models m ON m.id = pc.model_id JOIN autodb_manufacturers man ON man.id = m.manufacturer_id", ""),
                ("commercial_vehicles pc JOIN models m ON m.id = pc.modelid JOIN manufacturers man ON man.id = m.manufacturerid", ""),
                ("motorbikes pc JOIN models m ON m.id = pc.modelid JOIN manufacturers man ON man.id = m.manufacturerid", ""),
            ]:
                row = tecdb.execute(sa_text(f"""
                    SELECT pc.description, m.description as model, man.description as brand
                    FROM {tbl}
                    WHERE pc.id = :car_id
                    LIMIT 1
                """), {"car_id": entry.tecdoc_car_id}).first()
                if row:
                    break
            if row:
                result.append({
                    "id": entry.id,
                    "mod_id": 0,
                    "name": row[0] or "",
                    "model_name": row[1] or "",
                    "brand_name": row[2] or "",
                    "tecdoc_car_id": entry.tecdoc_car_id,
                })
    return result


@router.post("/garage/add")
async def add_to_garage(data: GarageAddSchema, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    user_service.add_to_garage(db, user_id, data)
    return {"message": "Vehicle added to garage"}


@router.delete("/garage/{entry_id}")
async def remove_from_garage(entry_id: int, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    if user_service.remove_from_garage(db, user_id, entry_id):
        return {"message": "Vehicle removed from garage"}
    raise HTTPException(status_code=404, detail="Entry not found")
