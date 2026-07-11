"""Store-facing returns API endpoints."""
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload

from app.core.db import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models import User, Order, OrderStatus, OrderItem, Part
from app.models.returns import ReturnRequest, ReturnItem, ReturnChangeLog, ReturnStatus
from app.services.notifications import send_telegram_notification
from app.services import telegram_format
from app.schemas.returns_schemas import (
    ReturnRequestSchema, ReturnListResponse, ReturnItemSchema, ReturnCreate, ReturnCreateItem,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _return_to_dict(r: ReturnRequest, max_qty_map: Optional[dict[int, int]] = None) -> dict:
    items = [
        ReturnItemSchema(
            id=item.id,
            part_id=item.part_id,
            article=item.article,
            part_name=item.part_name,
            brand=item.brand,
            quantity=item.quantity,
            max_quantity=max_qty_map.get(item.part_id, item.quantity) if max_qty_map else item.quantity,
            price=float(item.price),
            total=float(item.total),
        )
        for item in (r.items or [])
    ]
    return {
        "id": r.id,
        "return_number": r.return_number or f"RND-{r.id:010d}",
        "order_id": r.order_id,
        "order_number": r.order.order_number if r.order else f"ORD-{r.order_id:010d}",
        "status": r.status.value if hasattr(r.status, 'value') else str(r.status),
        "total_refund": float(r.total_refund),
        "created_at": r.created_at,
        "return_phone": r.return_phone,
        "return_last_name": r.return_last_name,
        "return_first_name": r.return_first_name,
        "return_middle_name": r.return_middle_name,
        "return_delivery_city": r.return_delivery_city,
        "return_delivery_warehouse": r.return_delivery_warehouse,
        "ttn_number": r.ttn_number,
        "items": items,
    }


@router.get("/", response_model=ReturnListResponse)
async def list_returns(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    """List return requests for the current user."""
    query = db.query(ReturnRequest).options(
        joinedload(ReturnRequest.items),
        joinedload(ReturnRequest.order),
    ).filter(ReturnRequest.user_id == user_id)

    total = query.count()

    items = query.order_by(ReturnRequest.created_at.desc()) \
        .offset((page - 1) * page_size) \
        .limit(page_size) \
        .all()

    return ReturnListResponse(
        items=[_return_to_dict(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{return_id}", response_model=ReturnRequestSchema)
async def get_return(
    return_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    """Get return request detail (only own returns)."""
    r = db.query(ReturnRequest).options(
        joinedload(ReturnRequest.items),
        joinedload(ReturnRequest.order),
    ).filter(
        ReturnRequest.id == return_id,
        ReturnRequest.user_id == user_id,
    ).first()

    if not r:
        raise HTTPException(404, "Return request not found")

    # Build max quantities from order items
    max_qty_map = {}
    if r.order:
        order_items = db.query(OrderItem).filter(OrderItem.order_id == r.order_id).all()
        for oi in order_items:
            max_qty_map[oi.part_id] = oi.quantity

    return _return_to_dict(r, max_qty_map)


@router.post("/from-order/{order_id}", response_model=ReturnRequestSchema, status_code=201)
async def create_return(
    order_id: int,
    data: ReturnCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    """Create or return existing return request for an order."""
    # Check order exists and belongs to user
    order = db.query(Order).options(
        joinedload(Order.items).joinedload(OrderItem.part),
    ).filter(
        Order.id == order_id,
        Order.user_id == user_id,
    ).first()

    if not order:
        raise HTTPException(404, "Order not found")

    # If a pending return already exists, return it directly
    existing = db.query(ReturnRequest).options(
        joinedload(ReturnRequest.items),
        joinedload(ReturnRequest.order),
    ).filter(
        ReturnRequest.order_id == order_id,
        ReturnRequest.user_id == user_id,
        ReturnRequest.status == ReturnStatus.PENDING,
    ).first()
    if existing:
        return _return_to_dict(existing)

    # Check order is delivered
    if order.status != OrderStatus.DELIVERED:
        raise HTTPException(400, "Return is only available for delivered orders")

    # Check 14-day window
    if order.first_delivered_at:
        fourteen_days = timedelta(days=14)
        if datetime.utcnow() - order.first_delivered_at > fourteen_days:
            raise HTTPException(400, "The 14-day return window has expired")

    order_items_by_part = {oi.part_id: oi for oi in order.items}

    # If no items specified, auto-populate with all order items
    items_to_process = data.items
    if not items_to_process:
        items_to_process = [
            ReturnCreateItem(part_id=oi.part_id, quantity=oi.quantity)
            for oi in order.items
        ]

    total_refund = 0
    return_items_data = []

    for item in items_to_process:
        if item.part_id not in order_items_by_part:
            raise HTTPException(400, f"Part {item.part_id} is not in this order")

        oi = order_items_by_part[item.part_id]
        if item.quantity < 1:
            raise HTTPException(400, "Quantity must be at least 1")
        if item.quantity > oi.quantity:
            raise HTTPException(400, f"Quantity for part {item.part_id} exceeds ordered quantity")

        part = oi.part
        item_total = float(item.quantity) * float(oi.price)
        total_refund += item_total

        return_items_data.append({
            "part_id": item.part_id,
            "article": part.article if part else "",
            "part_name": part.name if part else "",
            "brand": part.brand if part else None,
            "quantity": item.quantity,
            "price": float(oi.price),
            "total": item_total,
        })

    # Create return request
    return_request = ReturnRequest(
        order_id=order_id,
        user_id=user_id,
        status=ReturnStatus.PENDING,
        total_refund=total_refund,
    )
    db.add(return_request)
    db.flush()

    # Set return number based on sequential count (independent of DB id)
    count = db.query(ReturnRequest).count()
    return_request.return_number = f"RND-{count:010d}"

    # Create return items
    for ri in return_items_data:
        return_item = ReturnItem(
            return_request_id=return_request.id,
            **ri,
        )
        db.add(return_item)

    db.commit()
    db.refresh(return_request)

    # Telegram notification about new return (fire-and-forget)
    import asyncio
    asyncio.ensure_future(
        send_telegram_notification(
            telegram_format.new_return(
                return_number=return_request.return_number,
                order_number=return_request.order.order_number if return_request.order else "?",
            )
        )
    )

    # Reload with relationships
    return_request = db.query(ReturnRequest).options(
        joinedload(ReturnRequest.items),
        joinedload(ReturnRequest.order),
    ).filter(ReturnRequest.id == return_request.id).first()

    return _return_to_dict(return_request)


@router.delete("/{return_id}")
async def cancel_return(
    return_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    """Cancel a return request (only if pending)."""
    r = db.query(ReturnRequest).filter(
        ReturnRequest.id == return_id,
        ReturnRequest.user_id == user_id,
    ).first()

    if not r:
        raise HTTPException(404, "Return request not found")

    if r.status != ReturnStatus.PENDING:
        raise HTTPException(400, "Only pending return requests can be cancelled")

    r.status = ReturnStatus.REJECTED
    db.commit()

    return {"message": "Return request cancelled"}


@router.put("/{return_id}/ttn", response_model=ReturnRequestSchema)
async def save_return_ttn(
    return_id: int,
    data: dict,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    """Save TTN number for a return."""
    r = db.query(ReturnRequest).filter(
        ReturnRequest.id == return_id,
        ReturnRequest.user_id == user_id,
    ).first()

    if not r:
        raise HTTPException(404, "Return request not found")

    if r.status not in (ReturnStatus.APPROVED, ReturnStatus.COMPLETED):
        raise HTTPException(400, "TTN can only be set for approved returns")

    ttn = data.get("ttn_number", "")
    # Validate: exactly 14 digits
    clean = ttn.replace(" ", "")
    if not clean.isdigit() or len(clean) != 14:
        raise HTTPException(400, "TTN must be exactly 14 digits")

    r.ttn_number = clean

    # Log TTN change
    user = db.query(User).filter(User.id == user_id).first()
    user_name = f"{user.last_name or ''} {user.first_name or ''}".strip() if user else ""
    user_group = user.role.name if user and user.role else ""
    log = ReturnChangeLog(
        return_request_id=return_id,
        user_id=user_id,
        user_name=user_name,
        user_group=user_group,
        action="ttn_update",
        details=f"ТТН обновлен: {clean}",
    )
    db.add(log)

    db.commit()
    db.refresh(r)

    r = db.query(ReturnRequest).options(
        joinedload(ReturnRequest.items),
        joinedload(ReturnRequest.order),
    ).filter(ReturnRequest.id == return_id).first()
    return _return_to_dict(r)


@router.put("/{return_id}", response_model=ReturnRequestSchema)
async def update_return(
    return_id: int,
    data: ReturnCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user),
):
    """Update return request items."""
    r = db.query(ReturnRequest).filter(
        ReturnRequest.id == return_id,
        ReturnRequest.user_id == user_id,
    ).first()

    if not r:
        raise HTTPException(404, "Return request not found")

    if r.status != ReturnStatus.PENDING:
        raise HTTPException(400, "Only pending return requests can be edited")

    # Replace items
    db.query(ReturnItem).filter(ReturnItem.return_request_id == return_id).delete()

    total_refund = 0
    order_items_by_part: dict[int, OrderItem] = {}
    if r.order:
        order_items = db.query(OrderItem).filter(OrderItem.order_id == r.order_id).all()
        for oi in order_items:
            order_items_by_part[oi.part_id] = oi

    for item_data in data.items:
        oi = order_items_by_part.get(item_data.part_id)
        if not oi:
            raise HTTPException(400, f"Part {item_data.part_id} is not in this order")
        if item_data.quantity < 1:
            raise HTTPException(400, "Quantity must be at least 1")
        if item_data.quantity > oi.quantity:
            raise HTTPException(400, f"Quantity exceeds ordered quantity for part {item_data.part_id}")

        part = oi.part
        item_total = float(item_data.quantity) * float(oi.price)
        total_refund += item_total

        item = ReturnItem(
            return_request_id=return_id,
            part_id=item_data.part_id,
            article=part.article if part else "",
            part_name=part.name if part else "",
            brand=part.brand if part else None,
            quantity=item_data.quantity,
            price=float(oi.price),
            total=item_total,
        )
        db.add(item)

    r.total_refund = total_refund
    db.commit()
    db.refresh(r)

    r = db.query(ReturnRequest).options(
        joinedload(ReturnRequest.items),
        joinedload(ReturnRequest.order),
    ).filter(ReturnRequest.id == return_id).first()

    max_qty_map = {oi.part_id: oi.quantity for oi in order_items_by_part.values()}
    return _return_to_dict(r, max_qty_map)
