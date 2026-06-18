from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.schemas.admin_schemas import (
    AdminUserResponse, AdminUserListResponse,
)
from app.schemas.user_schemas import AdminUserCreate, AdminUserUpdate
from app.models import User, Role
from app.core.security import get_password_hash
from datetime import datetime

router = APIRouter()


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Список пользователей с пагинацией и поиском."""
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
                role=u.role.name,
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
    current_user: User = Depends(require_role("admin")),
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
    current_user: User = Depends(require_role("admin")),
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
