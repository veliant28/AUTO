from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.schemas.admin_schemas import (
    AdminUserResponse, AdminUserListResponse,
)
from app.schemas.user_schemas import AdminUserCreate, AdminUserUpdate
from app.models import User, Role
from app.models.orders import Order, OrderStatus
from app.models.returns import ReturnRequest, ReturnStatus
from app.core.security import get_password_hash
from datetime import datetime

router = APIRouter()


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users.view")),
):
    """Список пользователей с пагинацией и поиском."""
    query = db.query(User)
    if search:
            like = f"%{search}%"
            query = query.filter(
                User.email.ilike(like) |
                User.full_name.ilike(like) |
                User.first_name.ilike(like) |
                User.last_name.ilike(like) |
                User.phone.ilike(like)
            )
    total = query.count()
    users = query.order_by(User.id).offset((page - 1) * page_size).limit(page_size).all()

    # Compute user rating stats (counts + monetary values)
    user_ids = [u.id for u in users]

    # Count-based stats
    order_counts = (
        db.query(
            Order.user_id,
            func.sum(case((Order.status == OrderStatus.DELIVERED, 1), else_=0)).label("delivered"),
            func.sum(case((Order.status == OrderStatus.CANCELLED, 1), else_=0)).label("cancelled"),
        )
        .filter(Order.user_id.in_(user_ids))
        .group_by(Order.user_id)
        .all()
    )
    return_counts = (
        db.query(
            ReturnRequest.user_id,
            func.count(ReturnRequest.id).label("completed"),
        )
        .filter(
            ReturnRequest.user_id.in_(user_ids),
            ReturnRequest.status == ReturnStatus.COMPLETED,
        )
        .group_by(ReturnRequest.user_id)
        .all()
    )

    # Monetary value stats for success_index
    order_values = (
        db.query(
            Order.user_id,
            func.sum(case((Order.status == OrderStatus.DELIVERED, Order.total), else_=0)).label("delivered_total"),
            func.sum(case((Order.status == OrderStatus.CANCELLED, Order.total), else_=0)).label("cancelled_total"),
        )
        .filter(Order.user_id.in_(user_ids))
        .group_by(Order.user_id)
        .all()
    )
    return_refunds = (
        db.query(
            ReturnRequest.user_id,
            func.sum(ReturnRequest.total_refund).label("refunded_total"),
        )
        .filter(
            ReturnRequest.user_id.in_(user_ids),
            ReturnRequest.status == ReturnStatus.COMPLETED,
        )
        .group_by(ReturnRequest.user_id)
        .all()
    )

    count_map = {r.user_id: (r.delivered, r.cancelled) for r in order_counts}
    return_map = {r.user_id: r.completed for r in return_counts}
    value_map = {r.user_id: (float(r.delivered_total or 0), float(r.cancelled_total or 0)) for r in order_values}
    refund_map = {r.user_id: float(r.refunded_total or 0) for r in return_refunds}

    def compute_success_index(user_id: int) -> int:
        delivered_total, cancelled_total = value_map.get(user_id, (0.0, 0.0))
        refunded = refund_map.get(user_id, 0.0)
        total_value = delivered_total + cancelled_total
        if total_value == 0:
            return 0
        retained = delivered_total - refunded
        if retained < 0:
            retained = 0
        return round((retained / total_value) * 100)

    return AdminUserListResponse(
        items=[
            AdminUserResponse(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                first_name=u.first_name,
                last_name=u.last_name,
                middle_name=u.middle_name,
                role=u.role.name,
                is_active=u.is_active,
                phone=u.phone,
                created_at=u.created_at,
                orders_delivered=count_map.get(u.id, (0, 0))[0],
                orders_cancelled=count_map.get(u.id, (0, 0))[1],
                returns_completed=return_map.get(u.id, 0),
                success_index=compute_success_index(u.id),
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
    current_user: User = Depends(require_permission("users.create")),
):
    """Создать нового пользователя."""
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")
    
    role = db.query(Role).filter(Role.id == data.role_id).first()
    if not role:
        raise HTTPException(400, "Invalid role ID")
    
    hashed = get_password_hash(data.password)
    user = User(
        email=data.email,
        password_hash=hashed,
        full_name=data.full_name,
        first_name=data.first_name,
        last_name=data.last_name,
        middle_name=data.middle_name,
        is_active=data.is_active,
        phone=data.phone,
        role_id=data.role_id,
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return AdminUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.name,
        is_active=user.is_active,
        phone=user.phone,
        created_at=user.created_at,
    )


@router.put("/users/{user_id}", response_model=AdminUserResponse)
async def update_user(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users.edit")),
):
    """Обновить данные пользователя."""
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
    if data.first_name is not None:
        user.first_name = data.first_name
    if data.last_name is not None:
        user.last_name = data.last_name
    if data.middle_name is not None:
        user.middle_name = data.middle_name
    if data.role_id is not None:
        role = db.query(Role).filter(Role.id == data.role_id).first()
        if not role:
            raise HTTPException(400, "Invalid role ID")
        user.role_id = data.role_id
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.phone is not None:
        user.phone = data.phone
    if data.password:
        user.password_hash = get_password_hash(data.password)
    db.commit()
    db.refresh(user)

    return AdminUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.name,
        is_active=user.is_active,
        phone=user.phone,
        created_at=user.created_at,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users.delete")),
):
    """Удалить пользователя."""
    if user_id == current_user.id:
        raise HTTPException(400, "Cannot delete yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}
