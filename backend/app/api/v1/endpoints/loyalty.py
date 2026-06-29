from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.core.db import get_db
from app.models.loyalty import Promocode
from app.schemas.loyalty_schemas import PromocodeResponse
from app.api.v1.endpoints.auth import get_current_user

router = APIRouter()




@router.post("/validate", response_model=dict)
async def validate_promocode(
    code: str,
    db: Session = Depends(get_db),
):
    """Validate a promocode and return its details."""
    from app.models.loyalty import Promocode
    from app.schemas.loyalty_schemas import PromocodeValidateResponse
    
    pc = db.query(Promocode).filter(Promocode.code == code).first()
    if not pc:
        return {"valid": False, "message": "Promocode not found", "type": None, "discount_percent": 0}
    if not pc.is_active:
        return {"valid": False, "message": "Promocode is inactive", "type": pc.type, "discount_percent": pc.discount_percent}
    if pc.expires_at < datetime.utcnow():
        return {"valid": False, "message": "Promocode expired", "type": pc.type, "discount_percent": pc.discount_percent}
    if pc.used_at:
        return {"valid": False, "message": "Promocode already used", "type": pc.type, "discount_percent": pc.discount_percent}
    
    return {
        "valid": True,
        "type": pc.type,
        "discount_percent": pc.discount_percent or 100,
        "message": "Promocode is valid"
    }

@router.get("", response_model=List[PromocodeResponse])
async def get_my_promocodes(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get promocodes issued to the current user."""
    query = db.query(Promocode).filter(
        Promocode.user_id == user_id
    ).options(
        joinedload(Promocode.user), joinedload(Promocode.issued_by)
    ).order_by(Promocode.created_at.desc())

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for p in items:
        issued_by_name = None
        if p.issued_by:
            issued_by_name = ' '.join(filter(None, [p.issued_by.last_name, p.issued_by.first_name]))

        result.append(PromocodeResponse(
            id=p.id,
            code=p.code,
            type=p.type,
            user_id=p.user_id,
            reason=p.reason,
            issued_by_id=p.issued_by_id,
            issued_by_name=issued_by_name,
            expires_at=p.expires_at,
            used_at=p.used_at,
            is_active=p.is_active,
            created_at=p.created_at,
        ))

    return result
