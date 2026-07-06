import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.db import get_db
from app.api.v1.endpoints.auth import get_current_user, get_optional_user
from app.models.support import ChatConversation, ChatMessage, ChatStatus, SenderRole
from app.schemas.support_schemas import (
    CreateChatRequest,
    ChatConversationOut,
    ChatConversationDetail,
    ChatMessageOut,
)
from app.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["Support"])


def _chat_to_out(chat: ChatConversation) -> ChatConversationOut:
    """Convert a ChatConversation to its output schema."""
    user = chat.user
    last_msg = chat.messages[-1] if chat.messages else None
    assignee = chat.assignee
    # Count unread messages (messages from admin that user hasn't seen - simplified)
    unread = 0  # For now, we don't track read status
    
    return ChatConversationOut(
        id=chat.id,
        ticket_number=chat.ticket_number,
        user_id=chat.user_id,
        user_name=user.full_name or f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
        user_phone=user.phone,
        user_email=user.email,
        status=chat.status.value,
        assigned_to=chat.assigned_to,
        assignee_name=assignee.full_name if assignee else None,
        last_message=last_msg.message if last_msg else None,
        last_message_at=last_msg.created_at if last_msg else None,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
    )


@router.get("/chats", response_model=list[ChatConversationOut])
def list_my_chats(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all chats for the current user."""
    chats = (
        db.query(ChatConversation)
        .filter(ChatConversation.user_id == user_id)
        .order_by(desc(ChatConversation.updated_at))
        .all()
    )
    return [_chat_to_out(c) for c in chats]


@router.post("/chats", response_model=ChatConversationOut, status_code=201)
def create_chat(
    req: CreateChatRequest,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new support chat with the first message."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    import uuid
    chat = ChatConversation(
        user_id=user_id,
        status=ChatStatus.NEW,
        ticket_number=f"TMP-{uuid.uuid4().hex[:8]}",
    )
    db.add(chat)
    db.flush()
    chat.ticket_number = f"TKT-{chat.id:010d}"

    message = ChatMessage(
        conversation_id=chat.id,
        sender_id=user_id,
        sender_role=SenderRole.USER,
        message=req.message,
    )
    db.add(message)
    db.commit()
    db.refresh(chat)

    return _chat_to_out(chat)


@router.get("/chats/{chat_id}/messages", response_model=list[ChatMessageOut])
def get_chat_messages(
    chat_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all messages for a specific chat (with access check)."""
    chat = db.query(ChatConversation).filter(ChatConversation.id == chat_id).first()
    if not chat:
        raise HTTPException(404, "Chat not found")
    if chat.user_id != user_id:
        raise HTTPException(403, "Access denied")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == chat_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    result = []
    for m in messages:
        result.append(ChatMessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            sender_id=m.sender_id,
            sender_role=m.sender_role.value,
            sender_name=m.sender.full_name or f"{m.sender.first_name or ''} {m.sender.last_name or ''}".strip() or m.sender.email,
            sender_avatar_index=m.sender.avatar_index,
            message=m.message,
            created_at=m.created_at,
        ))
    return result
