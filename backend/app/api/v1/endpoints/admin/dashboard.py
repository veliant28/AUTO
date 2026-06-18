from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.schemas.admin_schemas import (
    DashboardResponse, OrdersByDateItem, PartsByCategoryItem,
)
from app.models import User, Order, OrderStatus, Part, PartCategory
from datetime import datetime, timedelta

router = APIRouter()


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Статистика админ-панели: пользователи, заказы, выручка, товары по категориям."""
    total_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0
    total_orders = db.query(func.count(Order.id)).scalar() or 0
    total_revenue = (
        db.query(func.coalesce(func.sum(Order.total), 0))
        .filter(Order.status != OrderStatus.CANCELLED)
        .scalar()
    )
    total_revenue = float(total_revenue)
    total_parts = db.query(func.count(Part.id)).scalar() or 0

    fourteen_days_ago = datetime.utcnow() - timedelta(days=14)
    orders_by_date_rows = (
        db.query(
            func.date(Order.created_at).label("date"),
            func.count(Order.id).label("count"),
            func.coalesce(func.sum(Order.total), 0).label("revenue"),
        )
        .filter(Order.created_at >= fourteen_days_ago)
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
        .all()
    )
    orders_by_date = [
        OrdersByDateItem(date=str(row.date), count=row.count, revenue=float(row.revenue))
        for row in orders_by_date_rows
    ]

    orders_by_status_rows = (
        db.query(Order.status, func.count(Order.id))
        .group_by(Order.status)
        .all()
    )
    orders_by_status = {row[0].value if hasattr(row[0], "value") else row[0]: row[1] for row in orders_by_status_rows}

    parts_by_category_rows = (
        db.query(PartCategory.name, func.count(Part.id))
        .join(Part, Part.category_id == PartCategory.id, isouter=True)
        .group_by(PartCategory.name)
        .order_by(func.count(Part.id).desc())
        .all()
    )
    parts_by_category = [
        PartsByCategoryItem(category=row[0] or "Без категории", count=row[1])
        for row in parts_by_category_rows
    ]

    return DashboardResponse(
        total_users=total_users,
        total_orders=total_orders,
        total_revenue=total_revenue,
        total_parts=total_parts,
        orders_by_date=orders_by_date,
        orders_by_status=orders_by_status,
        parts_by_category=parts_by_category,
    )
