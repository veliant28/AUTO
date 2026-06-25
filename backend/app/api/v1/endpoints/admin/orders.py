from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.schemas.admin_schemas import (
    AdminOrderItem, AdminAdminOrderListResponse,
    UpdateOrderStatusSchema,
    AdminOrderDetailResponse, AdminOrderItemSchema,
    AdminOrderUpdateSchema, AdminOrderAddItemSchema,
    OrderChangeLogResponse,
)
from app.models import User, Order, OrderItem, OrderStatus, OrderChangeLog, Part
from datetime import datetime

router = APIRouter()


@router.get("/orders", response_model=AdminAdminOrderListResponse)
async def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    status: str = Query("", max_length=50),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Список заказов для админ-панели с пагинацией, фильтром по статусу и поиском."""
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
                (Order.order_number.ilike(like)) |
                (Order.full_name.ilike(like)) |
                (Order.last_name.ilike(like)) |
                (Order.first_name.ilike(like)) |
                (Order.middle_name.ilike(like)) |
                (Order.phone.ilike(like))
            )
        except ValueError:
            query = query.filter(
                (Order.order_number.ilike(like)) |
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
                order_number=o.order_number or f"ORD-{o.id:010d}",
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
    """Детальная информация о заказе для админ-панели."""
    order = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.part),
        joinedload(Order.updated_by),
    ).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    return AdminOrderDetailResponse(
        id=order.id,
        order_number=order.order_number or f"ORD-{order.id:010d}",
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
    """Обновить заказ: товары, контактные данные, доставку."""
    order = db.query(Order).filter(Order.id == order_id).first()
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

        # Recalculate total after quantity changes
        db.flush()
        order.total = sum(
            float(i.quantity) * float(i.price) for i in order.items
        )

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
    """Удалить товар из заказа. Пересчитывает итоговую сумму."""
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
        order_number=order.order_number or f"ORD-{order.id:010d}",
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


@router.post("/orders/{order_id}/items", response_model=AdminOrderDetailResponse)
async def add_order_item(
    order_id: int,
    data: AdminOrderAddItemSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Добавить товар в заказ. Только для заказов со статусом 'В обработке'."""
    order = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.part),
    ).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    if order.status != OrderStatus.PROCESSING:
        raise HTTPException(400, "Товар можно добавить только в заказ со статусом 'В обработке'")

    part = db.query(Part).filter(Part.id == data.part_id).first()
    if not part:
        raise HTTPException(404, "Product not found")

    # Determine price from the best offer
    best_price = None
    for offer in (part.offers or []):
        if offer.quantity and offer.quantity > 0:
            price = float(offer.final_price) if offer.final_price else float(offer.price)
            if best_price is None or (
                offer.updated_at and (
                    best_price.get("updated_at") is None or
                    offer.updated_at > best_price["updated_at"]
                )
            ):
                best_price = {"price": price, "updated_at": offer.updated_at}

    if best_price is None:
        # Fallback: take any offer price (even if out of stock)
        for offer in (part.offers or []):
            price = float(offer.final_price) if offer.final_price else float(offer.price)
            if best_price is None:
                best_price = {"price": price, "updated_at": offer.updated_at}

    if best_price is None:
        raise HTTPException(400, "Для этого товара нет доступной цены")

    unit_price = best_price["price"]
    quantity = max(1, data.quantity)

    # Check if item already exists in the order
    existing_item = None
    for item in order.items:
        if item.part_id == data.part_id:
            existing_item = item
            break

    role_name = current_user.role.name if current_user.role else ""
    user_display = f"{current_user.last_name or ''} {current_user.first_name or ''}".strip()
    part_info = f"{part.name} {part.article} (SKU: {part.sku or '—'})"

    if existing_item:
        # Increment quantity
        old_qty = existing_item.quantity
        existing_item.quantity += quantity
        changes = [f"{part_info}: {old_qty} шт. → {existing_item.quantity} шт."]
    else:
        # Create new order item
        new_item = OrderItem(
            order_id=order.id,
            part_id=data.part_id,
            quantity=quantity,
            price=unit_price,
        )
        db.add(new_item)
        db.flush()
        changes = [f"{part_info}: добавлено {quantity} шт. × {unit_price:.2f} ₴"]

    # Recalculate total - re-query items to ensure we have the latest
    db.flush()
    all_items = db.query(OrderItem).filter(
        OrderItem.order_id == order.id
    ).all()
    order.total = sum(
        float(i.quantity) * float(i.price) for i in all_items
    )

    order.updated_by_user_id = current_user.id
    order.updated_by_name = user_display
    order.updated_by_group = role_name
    order.updated_at = datetime.utcnow()

    log = OrderChangeLog(
        order_id=order.id,
        user_id=current_user.id,
        user_name=user_display,
        user_group=role_name,
        action="item_added",
        details="; ".join(changes),
    )
    db.add(log)
    db.commit()

    # Re-fetch to get the updated items list with part data
    db.refresh(order)
    # Reload items with part data
    items = db.query(OrderItem).options(
        joinedload(OrderItem.part)
    ).filter(OrderItem.order_id == order.id).all()

    return AdminOrderDetailResponse(
        id=order.id,
        order_number=order.order_number or f"ORD-{order.id:010d}",
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
            for i in items
        ],
    )


@router.put("/orders/{order_id}/status")
async def update_order_status(
    order_id: int,
    data: UpdateOrderStatusSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """Изменить статус заказа. Создаёт запись в истории изменений."""
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
    """Получить историю изменений заказа."""
    order_obj = db.query(Order).filter(Order.id == order_id).first()
    if not order_obj:
        raise HTTPException(404, "Order not found")
    logs = db.query(OrderChangeLog).filter(
        OrderChangeLog.order_id == order_id
    ).order_by(OrderChangeLog.created_at.desc()).all()
    return logs
