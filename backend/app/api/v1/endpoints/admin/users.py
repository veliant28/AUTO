from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.schemas.admin_schemas import (
    AdminUserResponse, AdminUserListResponse,
)
from app.schemas.user_schemas import AdminUserCreate, AdminUserUpdate
from app.models import User, Role
from app.models.presence import ClientIp
from app.models.protection import BanRecord, ProtectionEvent
from app.services.client_index import compute_client_index_stats_bulk
from app.core.security import get_password_hash
from datetime import datetime

router = APIRouter()


def _last_ip_map(db: Session, user_ids: list[int]) -> dict[int, str]:
    """Последний известный IP каждого пользователя.

    Берём самый свежий из трёх источников: визит на сайт (client_ips,
    пишется по WS-присутствию), последний бан или событие защиты.
    """
    if not user_ids:
        return {}

    best: dict[int, tuple] = {}

    def consider(uid: int | None, ip: str | None, ts) -> None:
        if not uid or not ip or not ts:
            return
        current = best.get(uid)
        if current is None or ts > current[0]:
            best[uid] = (ts, ip)

    keys = [f"u{uid}" for uid in user_ids]
    latest_visit = (
        db.query(
            ClientIp.client_key.label("key"),
            func.max(ClientIp.last_seen).label("ts"),
        )
        .filter(ClientIp.client_key.in_(keys))
        .group_by(ClientIp.client_key)
        .subquery()
    )
    for key, ip, ts in (
        db.query(ClientIp.client_key, ClientIp.ip, ClientIp.last_seen)
        .join(
            latest_visit,
            and_(
                ClientIp.client_key == latest_visit.c.key,
                ClientIp.last_seen == latest_visit.c.ts,
            ),
        )
        .all()
    ):
        try:
            consider(int(key[1:]), ip, ts)
        except (TypeError, ValueError):
            continue

    for model in (BanRecord, ProtectionEvent):
        time_col = (
            BanRecord.banned_at if model is BanRecord else ProtectionEvent.created_at
        )
        latest = (
            db.query(
                model.user_id.label("uid"),
                func.max(time_col).label("ts"),
            )
            .filter(
                model.user_id.in_(user_ids),
                model.ip_address.isnot(None),
            )
            .group_by(model.user_id)
            .subquery()
        )
        for uid, ip, ts in (
            db.query(model.user_id, model.ip_address, time_col)
            .join(
                latest,
                and_(model.user_id == latest.c.uid, time_col == latest.c.ts),
            )
            .all()
        ):
            consider(uid, ip, ts)

    return {uid: ip for uid, (_, ip) in best.items()}


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("users.view")),
):
    """Список пользователей с пагинацией и поиском."""
    query = db.query(User)
    if search:
        # Каждое слово должно найтись хотя бы в одном поле: так работают
        # составные запросы вида «Фамилия Имя», «Имя телефон», «email фамилия».
        for token in search.split():
            like = f"%{token}%"
            query = query.filter(
                User.email.ilike(like) |
                User.full_name.ilike(like) |
                User.first_name.ilike(like) |
                User.last_name.ilike(like) |
                User.phone.ilike(like)
            )
    total = query.count()
    users = query.order_by(User.id).offset((page - 1) * page_size).limit(page_size).all()

    # Рейтинг клиентов — общая формула индекса (services.client_index),
    # та же, что в карточке клиента и модалке заказа
    user_ids = [u.id for u in users]
    stats_map = compute_client_index_stats_bulk(db, user_ids)
    last_ip_map = _last_ip_map(db, user_ids)

    items = []
    for u in users:
        stats = stats_map.get(u.id) or {}
        items.append(AdminUserResponse(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            first_name=u.first_name,
            last_name=u.last_name,
            middle_name=u.middle_name,
            role=u.role.name,
            is_active=u.is_active,
            phone=u.phone,
            last_ip=last_ip_map.get(u.id),
            created_at=u.created_at,
            orders_delivered=stats.get("delivered_count", 0),
            orders_cancelled=stats.get("cancelled_count", 0),
            returns_completed=stats.get("full_count", 0) + stats.get("partial_count", 0),
            success_index=stats.get("success_index", 0),
        ))

    return AdminUserListResponse(
        items=items,
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
