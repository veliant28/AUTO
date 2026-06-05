from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.db import get_db
from app.schemas.favorites_schemas import FavoriteItemSchema, FavoriteAddSchema
from app.models import Favorite, Part
from app.api.v1.endpoints.auth import get_optional_user

router = APIRouter()

@router.get("/", response_model=List[FavoriteItemSchema])
async def get_favorites(user_id: int = Depends(get_optional_user), db: Session = Depends(get_db)):
    if not user_id:
        return []
    
    items = db.query(Favorite).filter(Favorite.user_id == user_id).all()
    
    result = []
    for item in items:
        part = db.query(Part).filter(Part.id == item.part_id).first()
        if part:
            result.append({
                "id": item.id,
                "part_id": item.part_id,
                "article": part.article,
                "part_name": part.name,
                "brand_name": str(part.brand_id),
            })
    return result

@router.post("/add")
async def add_favorite(data: FavoriteAddSchema, user_id: int = Depends(get_optional_user), db: Session = Depends(get_db)):
    if not user_id:
        raise HTTPException(401, "Unauthorized")
    
    existing = db.query(Favorite).filter(
        Favorite.user_id == user_id, 
        Favorite.part_id == data.part_id
    ).first()
    
    if not existing:
        fav = Favorite(user_id=user_id, part_id=data.part_id)
        db.add(fav)
        db.commit()
    
    return {"message": "Added to favorites"}

@router.delete("/{part_id}")
async def remove_favorite(part_id: int, user_id: int = Depends(get_optional_user), db: Session = Depends(get_db)):
    if not user_id:
        raise HTTPException(401, "Unauthorized")
    
    db.query(Favorite).filter(
        Favorite.user_id == user_id, 
        Favorite.part_id == part_id
    ).delete()
    db.commit()
    
    return {"message": "Removed from favorites"}
