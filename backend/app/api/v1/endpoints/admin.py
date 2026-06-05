from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.api.v1.endpoints.auth import get_current_user
from app.schemas.admin_schemas import (
    DashboardResponse, OrdersByDateItem, PartsByCategoryItem,
    AdminOrderItem, AdminAdminOrderListResponse,
    AdminUserResponse, AdminUserListResponse,
    UpdateOrderStatusSchema,
)
from app.schemas.user_schemas import AdminUserCreate, AdminUserUpdate, UserRole
from app.models import User, Order, OrderItem, OrderStatus, Part, PartCategory
import bcrypt
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
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


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    query = db.query(User)
    if search:
        like = f"%{search}%"
        query = query.filter(
            User.email.ilike(like) | User.full_name.ilike(like)
        )
    total = query.count()
    users = query.order_by(User.id).offset((page - 1) * page_size).limit(page_size).all()
    return AdminUserListResponse(
        items=[
            AdminUserResponse(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                role=u.role.value,
                is_active=u.is_active,
                phone=u.phone,
                created_at=u.created_at,
            )
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/users", response_model=AdminUserResponse)
async def create_user(
    data: AdminUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")
    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    user = User(
        email=data.email,
        password_hash=hashed,
        full_name=data.full_name,
        role=UserRole(data.role.value) if isinstance(data.role, UserRole) else data.role,
        is_active=data.is_active,
        phone=data.phone,
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        is_active=user.is_active,
        phone=user.phone,
        created_at=user.created_at,
    )


@router.put("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if data.email is not None:
        existing = db.query(User).filter(User.email == data.email, User.id != user_id).first()
        if existing:
            raise HTTPException(400, "Email already in use")
        user.email = data.email
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        user.role = UserRole(data.role.value) if isinstance(data.role, UserRole) else data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.phone is not None:
        user.phone = data.phone
    db.commit()
    db.refresh(user)
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        is_active=user.is_active,
        phone=user.phone,
        created_at=user.created_at,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    if user_id == current_user.id:
        raise HTTPException(400, "Cannot delete yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


@router.get("/orders", response_model=AdminAdminOrderListResponse)
async def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str = Query("", max_length=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)
    total = query.count()
    orders = query.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return AdminAdminOrderListResponse(
        items=[
            AdminOrderItem(
                id=o.id,
                user_id=o.user_id,
                status=o.status.value if hasattr(o.status, "value") else o.status,
                total=float(o.total),
                full_name=o.full_name,
                phone=o.phone,
                address=o.address,
                created_at=o.created_at,
                items_count=len(o.items),
            )
            for o in orders
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.put("/orders/{order_id}/status")
async def update_order_status(
    order_id: int,
    data: UpdateOrderStatusSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    valid_statuses = [s.value for s in OrderStatus]
    if data.status not in valid_statuses:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
    order.status = data.status
    db.commit()
    return {"message": "Status updated", "status": data.status}
