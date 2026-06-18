from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional, Dict, Any
from app.core.db import get_db
from app.schemas.favorites_schemas import FavoriteItemSchema, FavoriteAddSchema, FavoriteListResponse, FavoritePartResult
from app.models import Favorite, Part, SupplierOffer
from app.api.v1.endpoints.auth import get_optional_user

router = APIRouter()


def _best_favorite_offer(offers: List[SupplierOffer]) -> Optional[Dict[str, Any]]:
    in_stock = [o for o in offers if o.quantity > 0]
    candidates = in_stock or offers
    if not candidates:
        return None
    best = max(candidates, key=lambda o: (o.updated_at or o.id, o.id))
    return {
        "price": float(best.final_price) if best.final_price is not None else float(best.price),
        "quantity": best.quantity or 0,
        "currency": best.currency or "UAH",
    }


@router.get("/", response_model=FavoriteListResponse)
async def get_favorites(
    user_id: int = Depends(get_optional_user),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    """Получить список избранных товаров пользователя с пагинацией."""
    if not user_id:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}

    base_query = db.query(Favorite).filter(Favorite.user_id == user_id)
    total = base_query.count()
    items = base_query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for item in items:
        part = db.query(Part).filter(Part.id == item.part_id).first()
        if not part:
            continue
        offers = db.query(SupplierOffer).options(
            joinedload(SupplierOffer.supplier)
        ).filter(SupplierOffer.part_id == part.id).all()
        best = _best_favorite_offer(offers)
        result.append({
            "id": part.id,
            "article": part.article,
            "name": part.name,
            "brand_id": part.brand_id,
            "brand": part.brand,
            "price": best["price"] if best else None,
            "quantity": best["quantity"] if best else None,
            "currency": best["currency"] if best else "UAH",
            "image_url": None,
        })

    return {"items": result, "total": total, "page": page, "page_size": page_size}

@router.post("/add")
async def add_favorite(data: FavoriteAddSchema, user_id: int = Depends(get_optional_user), db: Session = Depends(get_db)):
    """Добавить товар в избранное."""
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
    """Удалить товар из избранного."""
    if not user_id:
        raise HTTPException(401, "Unauthorized")
    
    db.query(Favorite).filter(
        Favorite.user_id == user_id, 
        Favorite.part_id == part_id
    ).delete()
    db.commit()
    
    return {"message": "Removed from favorites"}
