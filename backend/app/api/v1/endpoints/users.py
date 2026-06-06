from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import hashlib
from app.core.db import get_db
from app.schemas.user_schemas import UserSchema, ProfileUpdate, ChangePasswordSchema, GarageVehicleSchema, GarageAddSchema
from app.services.user_service import user_service
from app.models import User, UserGarage, VehicleModification, VehicleModel, VehicleBrand
from app.api.v1.endpoints.auth import get_current_user

router = APIRouter()

@router.get("/me", response_model=UserSchema)
async def get_me(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    user = user_service.get_user_profile(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

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
    return user

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
async def get_garage(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    entries = user_service.get_user_garage(db, user_id)
    
    result = []
    for entry in entries:
        mod = entry.modification
        model = db.query(VehicleModel).filter(VehicleModel.id == mod.model_id).first()
        brand = db.query(VehicleBrand).filter(VehicleBrand.id == model.brand_id).first()
        
        result.append({
            "id": entry.id,
            "mod_id": mod.id,
            "name": mod.name,
            "model_name": model.name,
            "brand_name": brand.name
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
