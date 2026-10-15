from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from app.core.db import get_db
from app.api.v1.deps import require_permission
from app.models import User, Permission, RolePermission
from app.models.orders import Order, OrderStatus
from app.models.returns import ReturnRequest, ReturnStatus
from app.models.support import ChatConversation, ChatMessage, SenderRole, ChatStatus
from pydantic import BaseModel
from datetime import datetime


router = APIRouter()


def _has_requests_view(db: Session, user: User) -> bool:
    """Есть ли у роли пользователя право requests.view (журнал заявок)."""
    return bool(
        db.query(RolePermission)
        .join(Permission)
        .filter(
            RolePermission.role_id == user.role_id,
            Permission.codename == "requests.view",
        )
        .first()
    )


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


class NotificationRequestItem(BaseModel):
    id: int
    number: str | None = None
    title: str | None = None
    category_name: str | None = None
    status: str | None = None
    created_at: datetime | None = None
    deadline_state: str = "ok"


class NotificationsResponse(BaseModel):
    new_orders: list[NotificationOrderItem] = []
    new_returns: list[NotificationReturnItem] = []
    unread_messages: list[NotificationMessageItem] = []
    new_requests: list[NotificationRequestItem] = []


@router.get("/notifications", response_model=NotificationsResponse)
async def get_notifications(
    current_user: User = Depends(require_permission("orders.view")),
    db: Session = Depends(get_db),
):
    """Get new orders, returns, unread support messages and requests."""
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

    # Заявки журнала: новые и просроченные (с учётом видимости по роли).
    # Пользователю без права requests.view секция не отдаётся вовсе.
    new_requests = []
    if _has_requests_view(db, current_user):
        from app.models.requests import OPEN_STATUSES, Request, RequestStatus
        from app.services import requests_service as rs

        open_items = (
            rs.visible_requests_query(db, current_user)
            .options(joinedload(Request.category))
            .filter(Request.status.in_([RequestStatus.NEW, RequestStatus.IN_PROGRESS]))
            .order_by(desc(Request.created_at))
            .limit(30)
            .all()
        )
        for r in open_items:
            state = rs.deadline_state(r)
            if state["state"] == "ok" and r.status != RequestStatus.NEW:
                continue
            new_requests.append(
                NotificationRequestItem(
                    id=r.id,
                    number=r.number,
                    title=r.title,
                    category_name=r.category.name if r.category else None,
                    status=r.status.value if hasattr(r.status, "value") else str(r.status),
                    created_at=r.created_at,
                    deadline_state=state["state"],
                )
            )

    return NotificationsResponse(
        new_orders=[NotificationOrderItem.model_validate(o) for o in new_orders],
        new_returns=[NotificationReturnItem.model_validate(r) for r in new_returns],
        unread_messages=unread_messages,
        new_requests=new_requests,
    )
