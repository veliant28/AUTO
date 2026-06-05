from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.db import get_db
from app.schemas.user_schemas import UserSchema, GarageVehicleSchema, GarageAddSchema
from app.services.user_service import user_service
from app.models import UserGarage, VehicleModification, VehicleModel, VehicleBrand

router = APIRouter()

# Mock dependency for current user (in real app, this would be JWT based)
def get_current_user(db: Session = Depends(get_db)):
    user = db.query(UserGarage).first() # Just a mock
    # For now, let's assume user_id = 1 for development
    return 1

@router.get("/me", response_model=UserSchema)
async def get_me(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models import User
    user = user_service.get_user_profile(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

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
