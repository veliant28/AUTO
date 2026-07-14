from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.models import User
from app.models.orders import Order, OrderStatus
from app.models.returns import ReturnRequest, ReturnStatus
from app.models.support import ChatConversation, ChatMessage, SenderRole, ChatStatus
from pydantic import BaseModel
from datetime import datetime


router = APIRouter()


class NotificationOrderItem(BaseModel):
    id: int
    order_number: str | None = None
    full_name: str | None = None
    total: float | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class NotificationReturnItem(BaseModel):
    id: int
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class NotificationMessageItem(BaseModel):
    conversation_id: int
    ticket_number: str | None = None
    message: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class NotificationsResponse(BaseModel):
    new_orders: list[NotificationOrderItem] = []
    new_returns: list[NotificationReturnItem] = []
    unread_messages: list[NotificationMessageItem] = []


@router.get("/notifications", response_model=NotificationsResponse)
async def get_notifications(
    current_user: User = Depends(require_permission("orders.view")),
    db: Session = Depends(get_db),
):
    """Get new orders, returns, and unread support messages."""
    new_orders = (
        db.query(Order)
        .filter(Order.status == OrderStatus.PENDING)
        .order_by(desc(Order.created_at))
        .limit(20)
        .all()
    )

    new_returns = (
        db.query(ReturnRequest)
        .filter(ReturnRequest.status == ReturnStatus.PENDING)
        .order_by(desc(ReturnRequest.created_at))
        .limit(20)
        .all()
    )

    # Conversations where the latest message was sent by a user (not admin)
    unread_messages = []
    conversations = (
        db.query(ChatConversation)
        .filter(ChatConversation.status != ChatStatus.CLOSED)
        .order_by(desc(ChatConversation.updated_at))
        .limit(20)
        .all()
    )

    for conv in conversations:
        last_msg = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conv.id)
            .order_by(desc(ChatMessage.created_at))
            .first()
        )
        if last_msg and last_msg.sender_role == SenderRole.USER:
            unread_messages.append(
                NotificationMessageItem(
                    conversation_id=conv.id,
                    ticket_number=conv.ticket_number,
                    message=last_msg.message[:200] if last_msg.message else None,
                    created_at=last_msg.created_at,
                )
            )

    return NotificationsResponse(
        new_orders=[NotificationOrderItem.model_validate(o) for o in new_orders],
        new_returns=[NotificationReturnItem.model_validate(r) for r in new_returns],
        unread_messages=unread_messages,
    )
