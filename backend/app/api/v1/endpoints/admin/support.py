import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta
from typing import Optional, List
from app.core.db import get_db
from app.api.v1.deps import require_role
from app.models.support import ChatConversation, ChatMessage, ChatStatus, SenderRole
from app.schemas.support_schemas import (
    ChatConversationOut,
    ChatConversationDetail,
    ChatMessageOut,
    UpdateStatusRequest,
    AssignRequest,
)
from app.models import User
from app.services.ws_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["Admin Support"])


def _chat_to_out(chat: ChatConversation) -> ChatConversationOut:
    """Convert a ChatConversation to its output schema."""
    user = chat.user
    last_msg = chat.messages[-1] if chat.messages else None
    assignee = chat.assignee
    return ChatConversationOut(
        id=chat.id,
        user_id=chat.user_id,
        user_name=user.full_name or f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
        user_phone=user.phone,
        user_email=user.email,
        status=chat.status.value,
        subject=chat.subject,
        assigned_to=chat.assigned_to,
        assignee_name=assignee.full_name if assignee else None,
        last_message=last_msg.message if last_msg else None,
        last_message_at=last_msg.created_at if last_msg else None,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
    )


def _msg_to_out(m: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=m.id,
        conversation_id=m.conversation_id,
        sender_id=m.sender_id,
        sender_role=m.sender_role.value,
        message=m.message,
        created_at=m.created_at,
    )


def get_period_range(period: str, from_date: Optional[str] = None, to_date: Optional[str] = None):
    """Return (from_dt, to_dt) based on period or custom range."""
    now = datetime.utcnow()
    if from_date and to_date:
        return datetime.fromisoformat(from_date).replace(tzinfo=None), datetime.fromisoformat(to_date).replace(tzinfo=None)
    if period == "day":
        return now.replace(hour=0, minute=0, second=0, microsecond=0), now
    elif period == "week":
        return now - timedelta(days=7), now
    elif period == "year":
        return now - timedelta(days=365), now
    else:  # month
        return now - timedelta(days=30), now


@router.get("/chats", response_model=List[ChatConversationOut])
def list_chats(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    period: str = Query("month"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    admin: User = Depends(require_role("admin", "manager")),
    db: Session = Depends(get_db),
):
    """List all support chats with filters."""
    query = db.query(ChatConversation)

    # Filter by status
    if status:
        try:
            chat_status = ChatStatus(status)
            query = query.filter(ChatConversation.status == chat_status)
        except ValueError:
            raise HTTPException(400, f"Invalid status: {status}")

    # Filter by period
    from_dt, to_dt = get_period_range(period, from_date, to_date)
    query = query.filter(ChatConversation.created_at >= from_dt)
    if to_dt:
        query = query.filter(ChatConversation.created_at <= to_dt)

    # Search by user name, phone, or email
    if search:
        search_term = f"%{search}%"
        query = query.join(User, ChatConversation.user_id == User.id).filter(
            func.concat(User.first_name, ' ', User.last_name).ilike(search_term)
            | func.coalesce(User.full_name, '').ilike(search_term)
            | func.coalesce(User.phone, '').ilike(search_term)
            | func.coalesce(User.email, '').ilike(search_term)
        )

    chats = query.order_by(desc(ChatConversation.updated_at)).all()
    return [_chat_to_out(c) for c in chats]


@router.get("/chats/{chat_id}", response_model=ChatConversationDetail)
def get_chat_detail(
    chat_id: int,
    admin: User = Depends(require_role("admin", "manager")),
    db: Session = Depends(get_db),
):
    """Get full chat detail with messages."""
    chat = db.query(ChatConversation).filter(ChatConversation.id == chat_id).first()
    if not chat:
        raise HTTPException(404, "Chat not found")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == chat_id)
        .order_by(ChatMessage.created_at)
        .all()
    )

    return ChatConversationDetail(
        id=chat.id,
        user_id=chat.user_id,
        status=chat.status.value,
        subject=chat.subject,
        assigned_to=chat.assigned_to,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        messages=[_msg_to_out(m) for m in messages],
    )


@router.patch("/chats/{chat_id}/status")
async def update_chat_status(
    chat_id: int,
    req: UpdateStatusRequest,
    admin: User = Depends(require_role("admin", "manager")),
    db: Session = Depends(get_db),
):
    """Update chat status (new -> active -> closed)."""
    chat = db.query(ChatConversation).filter(ChatConversation.id == chat_id).first()
    if not chat:
        raise HTTPException(404, "Chat not found")

    try:
        new_status = ChatStatus(req.status)
    except ValueError:
        raise HTTPException(400, f"Invalid status: {req.status}")

    chat.status = new_status
    chat.updated_at = datetime.utcnow()
    db.commit()

    # Broadcast status change via WebSocket
    await manager.broadcast_status_change(chat_id, req.status)

    return {"status": "ok", "chat_id": chat_id, "new_status": req.status}


@router.patch("/chats/{chat_id}/assign")
def assign_chat(
    chat_id: int,
    req: AssignRequest,
    admin: User = Depends(require_role("admin", "manager")),
    db: Session = Depends(get_db),
):
    """Assign or unassign a chat to an admin."""
    chat = db.query(ChatConversation).filter(ChatConversation.id == chat_id).first()
    if not chat:
        raise HTTPException(404, "Chat not found")

    if req.assigned_to is not None:
        assignee = db.query(User).filter(User.id == req.assigned_to).first()
        if not assignee:
            raise HTTPException(404, "Assignee not found")

    chat.assigned_to = req.assigned_to
    chat.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "ok", "chat_id": chat_id, "assigned_to": req.assigned_to}
