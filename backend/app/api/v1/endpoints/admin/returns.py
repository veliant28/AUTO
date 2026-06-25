"""Admin returns API endpoints."""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload

from app.core.db import get_db
from app.api.v1.deps import require_role
from app.models import User, Order, OrderItem
from app.models.returns import ReturnRequest, ReturnItem, ReturnChangeLog, ReturnStatus
from app.schemas.returns_schemas import (
    AdminReturnListItem, AdminReturnListResponse,
    AdminReturnDetailResponse, AdminReturnItemSchema,
    AdminReturnUpdateSchema, AdminReturnItemUpdateSchema,
    AdminUpdateReturnStatusSchema,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _admin_return_to_list_dict(r: ReturnRequest) -> dict:
    return {
        "id": r.id,
        "return_number": r.return_number or f"RND-{r.id:010d}",
        "order_id": r.order_id,
        "order_number": r.order.order_number if r.order else f"ORD-{r.order_id:010d}",
        "user_id": r.user_id,
        "user_name": r.user.full_name or r.user.email if r.user else "",
        "user_last_name": r.user.last_name if r.user else None,
        "user_first_name": r.user.first_name if r.user else None,
        "phone": r.order.phone if r.order else None,
        "status": r.status.value if hasattr(r.status, 'value') else str(r.status),
        "total_refund": float(r.total_refund),
        "ttn_number": r.ttn_number,
        "items_count": len(r.items) if r.items else 0,
        "created_at": r.created_at,
    }


def _admin_return_to_detail_dict(r: ReturnRequest, db: Optional[Session] = None) -> dict:
    # Build a map of part_id → order quantity for max_quantity
    max_qty_map: dict[int, int] = {}
    sku_map: dict[int, Optional[str]] = {}
    sender_info = {"sender_name": None, "sender_city_label": None, "sender_address_label": None}
    
    if db and r.order:
        order_items = db.query(OrderItem).filter(OrderItem.order_id == r.order_id).all()
        for oi in order_items:
            max_qty_map[oi.part_id] = oi.quantity
        
        # Get sender info from the waybill's sender profile
        from app.models.nova_poshta import OrderNovaPoshtaWaybill
        waybill = db.query(OrderNovaPoshtaWaybill).options(
            joinedload(OrderNovaPoshtaWaybill.sender_profile)
        ).filter(
            OrderNovaPoshtaWaybill.order_id == r.order_id,
            OrderNovaPoshtaWaybill.is_deleted == False,
        ).first()
        if waybill and waybill.sender_profile:
            sp = waybill.sender_profile
            name_parts = [sp.last_name or '', sp.first_name or '', sp.middle_name or '']
            sender_info["sender_name"] = ' '.join(filter(None, name_parts)) or sp.organization_name or sp.name
            sender_info["sender_city_label"] = sp.city_label
            sender_info["sender_address_label"] = sp.address_label

    # Build sku map from parts
    from app.models import Part
    if db and r.items:
        part_ids = [item.part_id for item in r.items]
        parts = db.query(Part).filter(Part.id.in_(part_ids)).all()
        for p in parts:
            sku_map[p.id] = p.sku

    items = [
        AdminReturnItemSchema(
            id=item.id,
            part_id=item.part_id,
            article=item.article,
            part_name=item.part_name,
            brand=item.brand,
            quantity=item.quantity,
            max_quantity=max_qty_map.get(item.part_id, item.quantity),
            sku=sku_map.get(item.part_id),
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
        "user_id": r.user_id,
        "user_name": r.user.full_name or r.user.email if r.user else "",
        "user_last_name": r.user.last_name if r.user else None,
        "user_first_name": r.user.first_name if r.user else None,
        "phone": r.order.phone if r.order else None,
        "last_name": r.order.last_name if r.order else None,
        "first_name": r.order.first_name if r.order else None,
        "middle_name": r.order.middle_name if r.order else None,
        "delivery_type": r.order.delivery_type if r.order else None,
        "delivery_city": r.order.delivery_city if r.order else None,
        "delivery_warehouse": r.order.delivery_warehouse if r.order else None,
        "sender_name": sender_info["sender_name"],
        "sender_city_label": sender_info["sender_city_label"],
        "sender_address_label": sender_info["sender_address_label"],
        "return_phone": r.return_phone,
        "return_last_name": r.return_last_name,
        "return_first_name": r.return_first_name,
        "return_middle_name": r.return_middle_name,
        "return_delivery_city": r.return_delivery_city,
        "return_delivery_warehouse": r.return_delivery_warehouse,
        "ttn_number": r.ttn_number,
        "status": r.status.value if hasattr(r.status, 'value') else str(r.status),
        "total_refund": float(r.total_refund),
        "admin_notes": r.admin_notes,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
        "approved_at": r.approved_at,
        "completed_at": r.completed_at,
        "approved_by_user_id": r.approved_by_user_id,
        "approved_by_name": r.approved_by.full_name if r.approved_by else None,
        "updated_by_name": r.updated_by_name,
        "updated_by_group": r.updated_by_group,
        "change_logs": [
            {
                "id": log.id,
                "user_name": log.user_name,
                "user_group": log.user_group,
                "action": log.action,
                "details": log.details,
                "created_at": log.created_at,
            }
            for log in (r.change_logs or [])
        ],
        "items": items,
    }


@router.get("/returns", response_model=AdminReturnListResponse)
async def list_returns(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    status: str = Query("", max_length=50),
    search: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """List all return requests with pagination, status filter, and search."""
    query = db.query(ReturnRequest).options(
        joinedload(ReturnRequest.items),
        joinedload(ReturnRequest.order),
        joinedload(ReturnRequest.user),
    )

    if status:
        try:
            query = query.filter(ReturnRequest.status == ReturnStatus(status))
        except ValueError:
            pass

    if search:
        like = f"%{search}%"
        try:
            search_id = int(search)
            query = query.filter(
                (ReturnRequest.id == search_id) |
                (ReturnRequest.return_number.ilike(like))
            )
        except ValueError:
            query = query.filter(
                (ReturnRequest.return_number.ilike(like)) |
                (ReturnRequest.order.has(Order.order_number.ilike(like))) |
                (ReturnRequest.user.has(User.full_name.ilike(like))) |
                (ReturnRequest.user.has(User.email.ilike(like)))
            )

    total = query.count()

    items = query.order_by(ReturnRequest.created_at.desc()) \
        .offset((page - 1) * page_size) \
        .limit(page_size) \
        .all()

    return AdminReturnListResponse(
        items=[_admin_return_to_list_dict(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/returns/{return_id}", response_model=AdminReturnDetailResponse)
async def get_return(
    return_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """Get return request detail with items."""
    r = db.query(ReturnRequest).options(
        joinedload(ReturnRequest.items),
        joinedload(ReturnRequest.order),
        joinedload(ReturnRequest.user),
        joinedload(ReturnRequest.approved_by),
        joinedload(ReturnRequest.change_logs),
    ).filter(ReturnRequest.id == return_id).first()

    if not r:
        raise HTTPException(404, "Return request not found")

    return _admin_return_to_detail_dict(r, db)


@router.put("/returns/{return_id}")
async def update_return(
    return_id: int,
    data: AdminReturnUpdateSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Update return request (admin_notes)."""
    r = db.query(ReturnRequest).filter(ReturnRequest.id == return_id).first()

    if not r:
        raise HTTPException(404, "Return request not found")

    if data.admin_notes is not None:
        r.admin_notes = data.admin_notes

    # Update return recipient data (saved on return, not on order)
    if any(field is not None for field in [data.last_name, data.first_name, data.middle_name, data.phone, data.delivery_city, data.delivery_warehouse]):
        if data.last_name is not None:
            r.return_last_name = data.last_name
        if data.first_name is not None:
            r.return_first_name = data.first_name
        if data.middle_name is not None:
            r.return_middle_name = data.middle_name
        if data.phone is not None:
            r.return_phone = data.phone
        if data.delivery_city is not None:
            r.return_delivery_city = data.delivery_city
        if data.delivery_warehouse is not None:
            r.return_delivery_warehouse = data.delivery_warehouse

    # Update return items (quantities, removal)
    if data.items is not None:
        item_logs = []
        for item_update in data.items:
            item = db.query(ReturnItem).filter(
                ReturnItem.id == item_update.id,
                ReturnItem.return_request_id == return_id,
            ).first()
            if item:
                old_qty = item.quantity
                if item_update.quantity < 1:
                    db.delete(item)
                    item_logs.append(f"«{item.part_name}» удалён")
                else:
                    item.quantity = item_update.quantity
                    item.total = float(item_update.quantity) * float(item.price)
                    if old_qty != item_update.quantity:
                        item_logs.append(f"«{item.part_name}»: {old_qty} шт. → {item_update.quantity} шт.")
        
        # Recalculate total refund
        remaining_items = db.query(ReturnItem).filter(
            ReturnItem.return_request_id == return_id
        ).all()
        r.total_refund = sum(float(i.total) for i in remaining_items)

    role_name = current_user.role.name if current_user.role else ""
    r.updated_by_user_id = current_user.id
    r.updated_by_name = f"{current_user.last_name or ''} {current_user.first_name or ''}".strip()
    r.updated_by_group = role_name
    r.updated_at = datetime.utcnow()

    # Log the change
    details_parts = []
    if data.admin_notes is not None:
        details_parts.append("заметки обновлены")
    if any(field is not None for field in [data.last_name, data.first_name, data.middle_name, data.phone, data.delivery_city, data.delivery_warehouse]):
        details_parts.append("данные возврата обновлены")
    if data.items is not None and item_logs:
        details_parts.extend(item_logs)
    if details_parts:
        log = ReturnChangeLog(
            return_request_id=return_id,
            user_id=current_user.id,
            user_name=r.updated_by_name,
            user_group=role_name,
            action="edit",
            details=", ".join(details_parts),
        )
        db.add(log)

    db.commit()

    return {"message": "Return request updated"}


@router.put("/returns/{return_id}/status")
async def update_return_status(
    return_id: int,
    data: AdminUpdateReturnStatusSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Change return request status (approve/reject/complete)."""
    r = db.query(ReturnRequest).filter(ReturnRequest.id == return_id).first()

    if not r:
        raise HTTPException(404, "Return request not found")

    try:
        new_status = ReturnStatus(data.status)
    except ValueError:
        raise HTTPException(400, f"Invalid status: {data.status}")

    # Set timestamps on status transitions
    if new_status == ReturnStatus.APPROVED and r.status != ReturnStatus.APPROVED:
        r.approved_at = datetime.utcnow()
        r.approved_by_user_id = current_user.id
        # Auto-fill return recipient fields from sender profile if empty
        if not r.return_phone and not r.return_last_name:
            from app.models.nova_poshta import OrderNovaPoshtaWaybill
            waybill = db.query(OrderNovaPoshtaWaybill).options(
                joinedload(OrderNovaPoshtaWaybill.sender_profile)
            ).filter(
                OrderNovaPoshtaWaybill.order_id == r.order_id,
                OrderNovaPoshtaWaybill.is_deleted == False,
            ).first()
            if waybill and waybill.sender_profile:
                sp = waybill.sender_profile
                r.return_last_name = sp.last_name
                r.return_first_name = sp.first_name
                r.return_middle_name = sp.middle_name
                r.return_phone = sp.phone
                r.return_delivery_city = sp.city_label
                r.return_delivery_warehouse = sp.address_label
    elif new_status == ReturnStatus.COMPLETED and r.status != ReturnStatus.COMPLETED:
        r.completed_at = datetime.utcnow()

    old_status = r.status.value if hasattr(r.status, 'value') else str(r.status)
    r.status = new_status
    role_name = current_user.role.name if current_user.role else ""
    r.updated_by_user_id = current_user.id
    r.updated_by_name = f"{current_user.last_name or ''} {current_user.first_name or ''}".strip()
    r.updated_by_group = role_name
    r.updated_at = datetime.utcnow()

    # Log status change
    log = ReturnChangeLog(
        return_request_id=return_id,
        user_id=current_user.id,
        user_name=r.updated_by_name,
        user_group=role_name,
        action="status_change",
        details=f"статус: {old_status} → {data.status}",
    )
    db.add(log)

    db.commit()

    return {"message": f"Return request status changed to {data.status}"}


@router.delete("/returns/{return_id}")
async def delete_return(
    return_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Delete a return request and log it."""
    r = db.query(ReturnRequest).filter(ReturnRequest.id == return_id).first()

    if not r:
        raise HTTPException(404, "Return request not found")

    role_name = current_user.role.name if current_user.role else ""
    user_name = f"{current_user.last_name or ''} {current_user.first_name or ''}".strip()

    # Log deletion
    log = ReturnChangeLog(
        return_request_id=return_id,
        user_id=current_user.id,
        user_name=user_name,
        user_group=role_name,
        action="deleted",
        details="Возврат удалён",
    )
    db.add(log)

    # Delete items, logs, then the return itself
    db.query(ReturnItem).filter(ReturnItem.return_request_id == return_id).delete()
    db.flush()
    db.query(ReturnChangeLog).filter(ReturnChangeLog.return_request_id == return_id).delete()
    db.flush()
    db.delete(r)
    db.commit()

    return {"message": "Return request deleted"}
