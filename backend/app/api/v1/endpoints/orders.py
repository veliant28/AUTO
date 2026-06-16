from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.db import get_db
from app.schemas.orders_schemas import OrderSchema, CheckoutSchema
from app.models import Order, OrderItem, OrderStatus, Part
from app.api.v1.endpoints.auth import get_optional_user

router = APIRouter()

@router.get("/", response_model=List[OrderSchema])
async def get_orders(user_id: int = Depends(get_optional_user), db: Session = Depends(get_db)):
    if not user_id:
        raise HTTPException(401, "Unauthorized")
    
    orders = db.query(Order).filter(Order.user_id == user_id).order_by(Order.created_at.desc()).all()
    
    result = []
    for order in orders:
        items = []
        for item in order.items:
            part = db.query(Part).filter(Part.id == item.part_id).first()
            items.append({
                "id": item.id,
                "part_id": item.part_id,
                "article": part.article if part else "",
                "part_name": part.name if part else "",
                "quantity": item.quantity,
                "price": float(item.price),
            })
        
        result.append({
            "id": order.id,
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
            "items": items,
        })
    
    return result

@router.get("/{order_id}", response_model=OrderSchema)
async def get_order(order_id: int, user_id: int = Depends(get_optional_user), db: Session = Depends(get_db)):
    if not user_id:
        raise HTTPException(401, "Unauthorized")
    
    order = db.query(Order).filter(Order.id == order_id, Order.user_id == user_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    
    items = []
    for item in order.items:
        part = db.query(Part).filter(Part.id == item.part_id).first()
        items.append({
            "id": item.id,
            "part_id": item.part_id,
            "article": part.article if part else "",
            "part_name": part.name if part else "",
            "quantity": item.quantity,
            "price": float(item.price),
        })
    
    return {
        "id": order.id,
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
        "items": items,
    }

@router.post("/checkout")
async def checkout(data: CheckoutSchema, user_id: int = Depends(get_optional_user), db: Session = Depends(get_db)):
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
