from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from sqlalchemy import func
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.api.v1.endpoints.auth import get_current_user
from app.schemas.admin_schemas import (
    DashboardResponse, OrdersByDateItem, PartsByCategoryItem,
    AdminOrderItem, AdminAdminOrderListResponse,
    AdminUserResponse, AdminUserListResponse,
    UpdateOrderStatusSchema,
    AdminOrderDetailResponse, AdminOrderItemSchema,
    AdminOrderUpdateSchema, AdminOrderUpdateItem,
    OrderChangeLogResponse,
    RoleResponse, RoleCreate, RoleUpdate, PermissionResponse,
)
from app.schemas.user_schemas import AdminUserCreate, AdminUserUpdate
from app.models import User, Role, Permission, RolePermission, Order, OrderItem, OrderStatus, OrderChangeLog, Part, PartCategory
import bcrypt
from datetime import datetime, timedelta

router = APIRouter()


# ─── Dashboard ────────────────────────────────────────────────────────────

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


# ─── Users ────────────────────────────────────────────────────────────────

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
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")
    
    role = db.query(Role).filter(Role.id == data.role_id).first()
    if not role:
        raise HTTPException(400, "Invalid role ID")
    
    hashed = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
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
        user.password_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
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
    if user_id == current_user.id:
        raise HTTPException(400, "Cannot delete yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


# ─── Orders ───────────────────────────────────────────────────────────────

@router.get("/orders", response_model=AdminAdminOrderListResponse)
async def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str = Query("", max_length=50),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    query = db.query(Order)
    if status:
        try:
            query = query.filter(Order.status == OrderStatus(status))
        except ValueError:
            pass
    if search:
        like = f"%{search}%"
        try:
            search_id = int(search)
            query = query.filter(
                (Order.id == search_id) |
                (Order.full_name.ilike(like)) |
                (Order.last_name.ilike(like)) |
                (Order.first_name.ilike(like)) |
                (Order.middle_name.ilike(like)) |
                (Order.phone.ilike(like))
            )
        except ValueError:
            query = query.filter(
                (Order.full_name.ilike(like)) |
                (Order.last_name.ilike(like)) |
                (Order.first_name.ilike(like)) |
                (Order.middle_name.ilike(like)) |
                (Order.phone.ilike(like))
            )
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


@router.get("/orders/{order_id}", response_model=AdminOrderDetailResponse)
async def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    order = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.part),
        joinedload(Order.updated_by),
    ).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    return AdminOrderDetailResponse(
        id=order.id,
        user_id=order.user_id,
        status=order.status.value if hasattr(order.status, "value") else order.status,
        total=float(order.total),
        full_name=order.full_name,
        phone=order.phone,
        address=order.address,
        last_name=order.last_name,
        first_name=order.first_name,
        middle_name=order.middle_name,
        delivery_type=order.delivery_type,
        delivery_city=order.delivery_city,
        delivery_warehouse=order.delivery_warehouse,
        payment_method=order.payment_method,
        created_at=order.created_at,
        updated_by_name=order.updated_by_name,
        updated_by_group=order.updated_by_group,
        updated_at=order.updated_at,
        items=[
            AdminOrderItemSchema(
                id=item.id,
                part_id=item.part_id,
                article=item.part.article,
                part_name=item.part.name,
                brand=item.part.brand,
                quantity=item.quantity,
                price=float(item.price),
                sku=item.part.sku,
            )
            for item in order.items
        ],
    )


@router.put("/orders/{order_id}")
async def update_order(
    order_id: int,
    data: AdminOrderUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    order = db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    changes = []
    role_name = current_user.role.name if current_user.role else ""

    if data.items is not None:
        for upd in data.items:
            item = db.query(OrderItem).options(joinedload(OrderItem.part)).filter(OrderItem.id == upd.id, OrderItem.order_id == order_id).first()
            if item and item.quantity != upd.quantity:
                part_base = f"{item.part.name} {item.part.article}" if item.part else f"товар #{item.id}"
                changes.append(f"{part_base}: {item.quantity} шт. → {upd.quantity} шт.")
                item.quantity = upd.quantity

    if data.phone is not None and order.phone != data.phone:
        changes.append(f"телефон: {order.phone} → {data.phone}")
        order.phone = data.phone
    if data.last_name is not None and order.last_name != data.last_name:
        changes.append(f"фамилия: {order.last_name or ''} → {data.last_name}")
        order.last_name = data.last_name
    if data.first_name is not None and order.first_name != data.first_name:
        changes.append(f"имя: {order.first_name or ''} → {data.first_name}")
        order.first_name = data.first_name
    if data.middle_name is not None and order.middle_name != data.middle_name:
        changes.append(f"отчество: {order.middle_name or ''} → {data.middle_name}")
        order.middle_name = data.middle_name
    if data.delivery_type is not None and order.delivery_type != data.delivery_type:
        changes.append(f"доставка: {order.delivery_type or ''} → {data.delivery_type}")
        order.delivery_type = data.delivery_type
    if data.delivery_city is not None and order.delivery_city != data.delivery_city:
        changes.append(f"город: {order.delivery_city or ''} → {data.delivery_city}")
        order.delivery_city = data.delivery_city
    if data.delivery_warehouse is not None and order.delivery_warehouse != data.delivery_warehouse:
        changes.append(f"отделение: {order.delivery_warehouse or ''} → {data.delivery_warehouse}")
        order.delivery_warehouse = data.delivery_warehouse

    if changes:
        order.updated_by_user_id = current_user.id
        order.updated_by_name = f"{current_user.last_name or ''} {current_user.first_name or ''}".strip()
        order.updated_by_group = role_name
        order.updated_at = datetime.utcnow()

        log = OrderChangeLog(
            order_id=order.id,
            user_id=current_user.id,
            user_name=f"{current_user.last_name or ''} {current_user.first_name or ''}".strip(),
            user_group=role_name,
            action="edit",
            details="; ".join(changes),
        )
        db.add(log)

    db.commit()
    return {"message": "Order updated", "changes": changes}


@router.delete("/orders/{order_id}/items/{item_id}", response_model=AdminOrderDetailResponse)
async def delete_order_item(
    order_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")

    item = db.query(OrderItem).options(joinedload(OrderItem.part)).filter(
        OrderItem.id == item_id, OrderItem.order_id == order_id
    ).first()
    if not item:
        raise HTTPException(404, "Order item not found")

    item_info = f"{item.part.name} {item.part.article}"

    db.delete(item)
    db.flush()

    remaining = db.query(OrderItem).options(joinedload(OrderItem.part)).filter(
        OrderItem.order_id == order_id
    ).all()

    order.total = sum(float(i.quantity) * float(i.price) for i in remaining)
    role_name = current_user.role.name if current_user.role else ""
    order.updated_by_user_id = current_user.id
    order.updated_by_name = f"{current_user.last_name or ''} {current_user.first_name or ''}".strip()
    order.updated_by_group = role_name
    order.updated_at = datetime.utcnow()

    log = OrderChangeLog(
        order_id=order.id,
        user_id=current_user.id,
        user_name=f"{current_user.last_name or ''} {current_user.first_name or ''}".strip(),
        user_group=role_name,
        action="item_removed",
        details=item_info,
    )
    db.add(log)
    db.commit()

    return AdminOrderDetailResponse(
        id=order.id,
        user_id=order.user_id,
        status=order.status.value if hasattr(order.status, "value") else order.status,
        total=float(order.total),
        full_name=order.full_name,
        phone=order.phone,
        address=order.address,
        last_name=order.last_name,
        first_name=order.first_name,
        middle_name=order.middle_name,
        delivery_type=order.delivery_type,
        delivery_city=order.delivery_city,
        delivery_warehouse=order.delivery_warehouse,
        payment_method=order.payment_method,
        created_at=order.created_at,
        updated_by_name=order.updated_by_name,
        updated_by_group=order.updated_by_group,
        updated_at=order.updated_at,
        items=[
            AdminOrderItemSchema(
                id=i.id,
                part_id=i.part_id,
                article=i.part.article,
                part_name=i.part.name,
                brand=i.part.brand,
                quantity=i.quantity,
                price=float(i.price),
                sku=i.part.sku,
            )
            for i in remaining
        ],
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
    try:
        new_status = OrderStatus(data.status)
    except ValueError:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(s.value for s in OrderStatus)}")

    old_status = order.status.value if hasattr(order.status, "value") else order.status
    order.status = new_status
    role_name = current_user.role.name if current_user.role else ""
    order.updated_by_user_id = current_user.id
    order.updated_by_name = f"{current_user.last_name or ''} {current_user.first_name or ''}".strip()
    order.updated_by_group = role_name
    order.updated_at = datetime.utcnow()

    log = OrderChangeLog(
        order_id=order.id,
        user_id=current_user.id,
        user_name=f"{current_user.last_name or ''} {current_user.first_name or ''}".strip(),
        user_group=role_name,
        action="status_change",
        details=f"статус: {old_status} → {data.status}",
    )
    db.add(log)
    db.commit()
    return {"message": "Status updated", "status": data.status}


@router.get("/orders/{order_id}/history", response_model=list[OrderChangeLogResponse])
async def get_order_history(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    logs = db.query(OrderChangeLog).filter(
        OrderChangeLog.order_id == order_id
    ).order_by(OrderChangeLog.created_at.desc()).all()
    return logs


# ─── Roles ────────────────────────────────────────────────────────────────

@router.get("/roles", response_model=list[RoleResponse])
async def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    roles = db.query(Role).options(joinedload(Role.permissions)).order_by(Role.id).all()
    return [
        RoleResponse(
            id=r.id,
            name=r.name,
            description=r.description,
            is_system=r.is_system,
            created_at=r.created_at,
            updated_at=r.updated_at,
            permissions=[
                PermissionResponse(
                    id=p.id,
                    codename=p.codename,
                    description=p.description,
                    group_name=p.group_name,
                )
                for p in r.permissions
            ],
        )
        for r in roles
    ]


@router.post("/roles", response_model=RoleResponse)
async def create_role(
    data: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    existing = db.query(Role).filter(Role.name == data.name).first()
    if existing:
        raise HTTPException(400, "Role already exists")
    
    role = Role(name=data.name, description=data.description, is_system=False)
    db.add(role)
    db.flush()

    if data.permission_ids:
        permissions = db.query(Permission).filter(Permission.id.in_(data.permission_ids)).all()
        for perm in permissions:
            db.add(RolePermission(role_id=role.id, permission_id=perm.id))
    
    db.commit()
    db.refresh(role)
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role.id).first()

    return RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        created_at=role.created_at,
        updated_at=role.updated_at,
        permissions=[
            PermissionResponse(
                id=p.id,
                codename=p.codename,
                description=p.description,
                group_name=p.group_name,
            )
            for p in role.permissions
        ],
    )


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(404, "Role not found")
    
    if data.name is not None:
        existing = db.query(Role).filter(Role.name == data.name, Role.id != role_id).first()
        if existing:
            raise HTTPException(400, "Role name already in use")
        role.name = data.name
    if data.description is not None:
        role.description = data.description
    if data.permission_ids is not None:
        db.query(RolePermission).filter(RolePermission.role_id == role_id).delete()
        permissions = db.query(Permission).filter(Permission.id.in_(data.permission_ids)).all()
        for perm in permissions:
            db.add(RolePermission(role_id=role_id, permission_id=perm.id))
    
    role.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(role)
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role.id).first()

    return RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        created_at=role.created_at,
        updated_at=role.updated_at,
        permissions=[
            PermissionResponse(
                id=p.id,
                codename=p.codename,
                description=p.description,
                group_name=p.group_name,
            )
            for p in role.permissions
        ],
    )


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(404, "Role not found")
    if role.is_system:
        raise HTTPException(400, "Cannot delete system role")
    db.delete(role)
    db.commit()
    return {"message": "Role deleted"}


@router.get("/permissions", response_model=list[PermissionResponse])
async def list_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    permissions = db.query(Permission).order_by(Permission.group_name, Permission.id).all()
    return [
        PermissionResponse(
            id=p.id,
            codename=p.codename,
            description=p.description,
            group_name=p.group_name,
        )
        for p in permissions
    ]


from app.api.v1.endpoints.admin_tecdoc import router as tecdoc_router
from app.api.v1.endpoints.admin_products import router as products_router
from app.api.v1.endpoints.admin_brands import router as brands_router
from app.api.v1.endpoints.admin_catalog import router as catalog_router
router.include_router(tecdoc_router, prefix="/tecdoc", tags=["TecDoc"])
router.include_router(products_router, prefix="", tags=["Products"])
router.include_router(brands_router, prefix="", tags=["Brands"])
router.include_router(catalog_router, prefix="", tags=["Catalog"])
