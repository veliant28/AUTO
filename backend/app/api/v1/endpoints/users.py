from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text
from typing import List
from app.core.db import get_db, get_tecdoc_db
from app.core.security import get_password_hash, verify_password
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
        avatar_index=user.avatar_index,
        delivery_type=user.delivery_type,
        delivery_city=user.delivery_city,
        delivery_warehouse=user.delivery_warehouse,
    )


@router.get("/me", response_model=UserSchema)
async def get_me(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    """Получить профиль текущего пользователя."""
    user = user_service.get_user_profile(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_schema(user)


@router.put("/me", response_model=UserSchema)
async def update_me(data: ProfileUpdate, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    """Обновить профиль текущего пользователя (имя, телефон и т.д.)."""
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
    """Сменить пароль. Требует текущий пароль для подтверждения."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Password changed"}


@router.get("/garage", response_model=List[GarageVehicleSchema])
async def get_garage(user_id: int = Depends(get_current_user), db: Session = Depends(get_db), tecdb: Session = Depends(get_tecdoc_db)):
    """Получить список сохранённых автомобилей в гараже пользователя."""
    entries = user_service.get_user_garage(db, user_id)
    
    result = []
    for entry in entries:
        if entry.mod_id and entry.modification:
            mod = entry.modification
            model = db.query(VehicleModel).filter(VehicleModel.id == mod.model_id).first()
            brand = db.query(VehicleBrand).filter(VehicleBrand.id == model.brand_id).first() if model else None
            volume = None
            engine = None
            if entry.tecdoc_car_id:
                vol_row = tecdb.execute(sa_text("SELECT displayvalue FROM passanger_car_attributes WHERE passangercarid = :cid AND attributetype = 'Capacity' LIMIT 1"), {"cid": entry.tecdoc_car_id}).first()
                if vol_row: volume = vol_row[0]
                eng_row = tecdb.execute(sa_text("SELECT displayvalue FROM passanger_car_attributes WHERE passangercarid = :cid AND attributetype = 'EngineCode' LIMIT 1"), {"cid": entry.tecdoc_car_id}).first()
                if eng_row: engine = eng_row[0]
            result.append({
                "id": entry.id,
                "mod_id": mod.id,
                "name": mod.name,
                "model_name": model.name if model else "",
                "brand_name": brand.name if brand else "",
                "tecdoc_car_id": entry.tecdoc_car_id,
                "volume": volume,
                "engine": engine,
                "vehicle_type": brand.group if brand else None,
            })
        elif entry.tecdoc_car_id:
            row = None
            type_idx = 0
            type_names = ['passenger', 'commercial', 'motorbike']
            for i, (tbl, joins, extra_cols) in enumerate([
                ("passanger_cars pc JOIN models m ON m.id = pc.modelid JOIN manufacturers man ON man.id = m.manufacturerid", "",
                 ", NULL::int as start_year, NULL::int as end_year, "
                 "(SELECT attr.displayvalue FROM passanger_car_attributes attr WHERE attr.passangercarid = pc.id AND attr.attributetype = 'Power' LIMIT 1) as power"),
                ("commercial_vehicles pc JOIN models m ON m.id = pc.modelid JOIN manufacturers man ON man.id = m.manufacturerid", "",
                 ", NULL::int as start_year, NULL::int as end_year, NULL::varchar as power"),
                ("motorbikes pc JOIN models m ON m.id = pc.modelid JOIN manufacturers man ON man.id = m.manufacturerid", "",
                 ", NULL::int as start_year, NULL::int as end_year, NULL::varchar as power"),
            ]):
                row = tecdb.execute(sa_text(f"""
                    SELECT pc.description, m.description as model, man.description as brand,
                           pc.constructioninterval{extra_cols}
                    FROM {tbl}
                    WHERE pc.id = :car_id
                    LIMIT 1
                """), {"car_id": entry.tecdoc_car_id}).first()
                if row:
                    type_idx = i
                    break
            if row:
                ci = row[3] or ''
                import re
                years = re.findall(r'(\d{4})', ci)
                year_from = int(years[0]) if len(years) > 0 else None
                year_to = int(years[1]) if len(years) > 1 else None
                # Get volume and engine if passenger
                volume = None
                engine = None
                if type_idx == 0:
                    vol_row = tecdb.execute(sa_text("SELECT displayvalue FROM passanger_car_attributes WHERE passangercarid = :cid AND attributetype = 'Capacity' LIMIT 1"), {"cid": entry.tecdoc_car_id}).first()
                    if vol_row: volume = vol_row[0]
                    eng_row = tecdb.execute(sa_text("SELECT displayvalue FROM passanger_car_attributes WHERE passangercarid = :cid AND attributetype = 'EngineCode' LIMIT 1"), {"cid": entry.tecdoc_car_id}).first()
                    if eng_row: engine = eng_row[0]
                result.append({
                    "id": entry.id,
                    "mod_id": 0,
                    "name": row[0] or "",
                    "model_name": row[1] or "",
                    "brand_name": row[2] or "",
                    "tecdoc_car_id": entry.tecdoc_car_id,
                    "volume": volume,
                    "engine": engine,
                    "power": row[6] or "" if len(row) > 6 else "",
                    "year_from": year_from,
                    "year_to": year_to,
                    "vehicle_type": type_names[type_idx],
                })
    return result


@router.post("/garage/add")
async def add_to_garage(data: GarageAddSchema, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    """Добавить автомобиль в гараж пользователя."""
    user_service.add_to_garage(db, user_id, data)
    return {"message": "Vehicle added to garage"}


@router.delete("/garage/{entry_id}")
async def remove_from_garage(entry_id: int, user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    """Удалить автомобиль из гаража."""
    if user_service.remove_from_garage(db, user_id, entry_id):
        return {"message": "Vehicle removed from garage"}
    raise HTTPException(status_code=404, detail="Entry not found")
