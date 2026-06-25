from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
from app.core.db import get_db
from app.schemas.orders_schemas import OrderSchema, OrderListResponse, CheckoutSchema
from app.models import Order, OrderItem, OrderStatus, Part
from app.models.returns import ReturnRequest
from app.api.v1.endpoints.auth import get_optional_user

router = APIRouter()

def _items_with_brand(order, db):
    items = []
    for item in order.items:
        part = db.query(Part).filter(Part.id == item.part_id).first()
        items.append({
            "id": item.id,
            "part_id": item.part_id,
            "article": part.article if part else "",
            "part_name": part.name if part else "",
            "brand": part.brand if part else None,
            "quantity": item.quantity,
            "price": float(item.price),
            "sku": part.sku if part else None,
        })
    return items

def _can_return(order, db=None) -> bool:
    """Check if the order is eligible for return (delivered within 14 days, no existing return)."""
    if order.status != OrderStatus.DELIVERED:
        return False
    if not order.first_delivered_at:
        return False
    if datetime.utcnow() - order.first_delivered_at > timedelta(days=14):
        return False
    # Check if a return already exists for this order
    if db:
        existing = db.query(ReturnRequest).filter(
            ReturnRequest.order_id == order.id,
        ).first()
        if existing:
            return False
    return True

def _order_to_dict(order, db):
    return {
        "id": order.id,
        "order_number": order.order_number or f"ORD-{order.id:010d}",
        "status": order.status.value,
        "total": float(order.total),
        "full_name": order.full_name,
        "phone": order.phone,
        "address": order.address,
        "last_name": order.last_name,
        "first_name": order.first_name,
        "middle_name": order.middle_name,
        "delivery_type": order.delivery_type,
        "delivery_city": order.delivery_city,
        "delivery_warehouse": order.delivery_warehouse,
        "payment_method": order.payment_method,
        "created_at": order.created_at,
        "first_delivered_at": order.first_delivered_at,
        "can_return": _can_return(order, db),
        "items": _items_with_brand(order, db),
    }

@router.get("/", response_model=OrderListResponse)
async def get_orders(
    user_id: int = Depends(get_optional_user),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    status: str = Query(None, description="Comma-separated statuses to filter by"),
):
    """Получить список заказов текущего пользователя с пагинацией и фильтром по статусу."""
    if not user_id:
        raise HTTPException(401, "Unauthorized")
    
    base = db.query(Order).filter(Order.user_id == user_id)
    if status:
        status_list = [s.strip() for s in status.split(",") if s.strip()]
        if status_list:
            base = base.filter(Order.status.in_([OrderStatus(s) for s in status_list]))
    base = base.order_by(Order.created_at.desc())
    total = base.count()
    orders = base.offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "items": [_order_to_dict(o, db) for o in orders],
        "total": total,
        "page": page,
        "page_size": page_size,
    }

@router.get("/{order_id}", response_model=OrderSchema)
async def get_order(order_id: int, user_id: int = Depends(get_optional_user), db: Session = Depends(get_db)):
    """Получить детальную информацию о заказе по ID."""
    if not user_id:
        raise HTTPException(401, "Unauthorized")
    
    order = db.query(Order).filter(Order.id == order_id, Order.user_id == user_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    
    return _order_to_dict(order, db)

@router.post("/checkout")
async def checkout(data: CheckoutSchema, user_id: int = Depends(get_optional_user), db: Session = Depends(get_db)):
    """Оформить заказ. Принимает список товаров и данные доставки, создаёт заказ со статусом pending."""
    if not user_id:
        raise HTTPException(401, "Unauthorized")
    
    total = sum(item["price"] * item["quantity"] for item in data.items)
    full_name = ' '.join(filter(None, [data.last_name, data.first_name, data.middle_name]))
    
    order = Order(
        user_id=user_id,
        status=OrderStatus.PENDING,
        total=total,
        full_name=full_name,
        phone=data.phone,
        last_name=data.last_name,
        first_name=data.first_name,
        middle_name=data.middle_name,
        delivery_type=data.delivery_type,
        delivery_city=data.delivery_city,
        delivery_warehouse=data.delivery_warehouse,
        payment_method=data.payment_method,
    )
    db.add(order)
    db.flush()

    # Generate human-readable order number
    order.order_number = f"ORD-{order.id:010d}"

    for item_data in data.items:
        order_item = OrderItem(
            order_id=order.id,
            part_id=item_data["part_id"],
            quantity=item_data["quantity"],
            price=item_data["price"],
        )
        db.add(order_item)
    
    db.commit()
    db.refresh(order)
    
    return {"message": "Order created", "order_id": order.id}
