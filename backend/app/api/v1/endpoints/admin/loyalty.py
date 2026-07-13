import random
import string
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, text

from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.models import User
from app.models.loyalty import Promocode
from app.schemas.loyalty_schemas import (
    PromocodeResponse,
    PromocodeCreate,
    PromocodeListResponse,
    PromocodeStatsResponse,
    PromocodeStatsItem,
)

router = APIRouter()


def _generate_code(db: Session) -> str:
    """Generate a unique 10-char alphanumeric code."""
    chars = string.ascii_uppercase + string.digits
    for _ in range(100):
        code = ''.join(random.choices(chars, k=10))
        exists = db.query(Promocode).filter(Promocode.code == code).first()
        if not exists:
            return code
    raise HTTPException(500, "Failed to generate unique code")


def _promocode_to_response(p: Promocode) -> PromocodeResponse:
    user_name = None
    user_phone = None
    user_email = None
    if p.user:
        user_name = ' '.join(filter(None, [p.user.last_name, p.user.first_name]))
        user_phone = p.user.phone
        user_email = p.user.email

    issued_by_name = None
    if p.issued_by:
        issued_by_name = ' '.join(filter(None, [p.issued_by.last_name, p.issued_by.first_name]))

    return PromocodeResponse(
        id=p.id,
        code=p.code,
        type=p.type,
        user_id=p.user_id,
        user_name=user_name,
        user_phone=user_phone,
        user_email=user_email,
        discount_percent=p.discount_percent or 100,
        reason=p.reason,
        issued_by_id=p.issued_by_id,
        issued_by_name=issued_by_name,
        expires_at=p.expires_at,
        used_at=p.used_at,
        is_active=p.is_active,
        created_at=p.created_at,
    )


@router.get("/loyalty", response_model=PromocodeListResponse)
async def list_promocodes(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query("", max_length=200),
    staff_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("loyalty.view")),
):
    """List promocodes with pagination, search, and staff filter."""
    query = db.query(Promocode).options(
        joinedload(Promocode.user), joinedload(Promocode.issued_by)
    )

    if search:
        like = f"%{search}%"
        query = query.outerjoin(User, Promocode.user_id == User.id).filter(
            Promocode.code.ilike(like) |
            User.last_name.ilike(like) |
            User.first_name.ilike(like) |
            User.email.ilike(like) |
            User.phone.ilike(like)
        )

    if staff_id:
        query = query.filter(Promocode.issued_by_id == staff_id)

    total = query.count()
    items = query.order_by(Promocode.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    return PromocodeListResponse(
        items=[_promocode_to_response(p) for p in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/loyalty/stats", response_model=PromocodeStatsResponse)
async def get_promocode_stats(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("loyalty.view")),
):
    """Get promocode issuance stats grouped by date and staff."""
    since = datetime.utcnow() - timedelta(days=days)
    
    rows = db.execute(text("""
        SELECT DATE(p.created_at) as date,
               COUNT(*) as cnt,
               CONCAT(u.last_name, ' ', u.first_name) as staff_name
        FROM promocodes p
        JOIN users u ON u.id = p.issued_by_id
        WHERE p.created_at >= :since
        GROUP BY DATE(p.created_at), u.id, u.last_name, u.first_name
        ORDER BY date DESC
    """), {"since": since}).fetchall()

    # Aggregate by date with staff breakdown
    date_map: dict[str, dict] = {}
    for row in rows:
        d = str(row.date)
        if d not in date_map:
            date_map[d] = {"date": d, "count": 0, "staff": []}
        date_map[d]["count"] += row.cnt
        date_map[d]["staff"].append({"name": row.staff_name, "count": row.cnt})

    items = [PromocodeStatsItem(**v) for v in date_map.values()]
    return PromocodeStatsResponse(items=items, total=sum(i.count for i in items))


@router.post("/loyalty", response_model=PromocodeResponse)
async def create_promocode(
    data: PromocodeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("loyalty.create")),
):
    """Create a new promocode with auto-generated code."""
    code = _generate_code(db)

    # Validate user if provided
    if data.user_id:
        user = db.query(User).filter(User.id == data.user_id).first()
        if not user:
            raise HTTPException(404, "User not found")

    promocode = Promocode(
        code=code,
        type=data.type,
        user_id=data.user_id,
        discount_percent=data.discount_percent,
        reason=data.reason,
        issued_by_id=current_user.id,
        expires_at=data.expires_at,
    )
    db.add(promocode)
    db.commit()
    db.refresh(promocode)
    return _promocode_to_response(promocode)


@router.get("/loyalty/staff")
async def list_staff(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("loyalty.view")),
):
    """List staff members who have issued promocodes."""
    rows = db.execute(text("""
        SELECT DISTINCT u.id, u.last_name, u.first_name, u.email
        FROM promocodes p
        JOIN users u ON u.id = p.issued_by_id
        ORDER BY u.last_name, u.first_name
    """)).fetchall()
    return [{"id": r.id, "name": f"{r.last_name or ''} {r.first_name or ''}".strip(), "email": r.email} for r in rows]


@router.get("/loyalty/search-users")
async def search_users(
    q: str = Query("", min_length=2),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("loyalty.view")),
):
    """Search users by phone, email, or name."""
    like = f"%{q}%"
    users = db.query(User).filter(
        User.email.ilike(like) |
        User.phone.ilike(like) |
        User.last_name.ilike(like) |
        User.first_name.ilike(like)
    ).limit(20).all()
    return [
        {
            "id": u.id,
            "name": ' '.join(filter(None, [u.last_name, u.first_name])),
            "email": u.email,
            "phone": u.phone,
        }
        for u in users
    ]
