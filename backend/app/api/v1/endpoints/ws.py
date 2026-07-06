import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.models.support import ChatConversation, ChatMessage, SenderRole, ChatStatus
from app.api.v1.endpoints.auth import verify_token
from app.services.ws_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket, token: str = Query(...)):
    """WebSocket endpoint for real-time chat.

    Authentication via token in query string.
    Messages are JSON-encoded:
      Client -> Server:
        {"type": "subscribe", "chat_id": 1}
        {"type": "message", "chat_id": 1, "text": "hello"}
        {"type": "typing", "chat_id": 1, "is_typing": true}

      Server -> Client:
        {"type": "new_message", "chat_id": 1, "message": {...}}
        {"type": "typing", "user_id": 1, "chat_id": 1, "is_typing": true}
        {"type": "status_changed", "chat_id": 1, "status": "active"}
        {"type": "error", "message": "..."}
    """
    # Authenticate
    try:
        token_data = verify_token(token)
        user_id = token_data["user_id"]
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Accept connection
    await manager.connect(user_id, websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            msg_type = data.get("type")

            if msg_type == "subscribe":
                chat_id = data.get("chat_id")
                if not chat_id:
                    await websocket.send_text(json.dumps({"type": "error", "message": "chat_id required"}))
                    continue
                # Verify user has access to this chat
                db: Session = next(get_db())
                try:
                    chat = db.query(ChatConversation).filter(ChatConversation.id == chat_id).first()
                    if not chat:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Chat not found"}))
                        continue
                    # User can subscribe if they're the owner, or if they're an admin
                    from app.models import User
                    user = db.query(User).filter(User.id == user_id).first()
                    is_admin = user and user.role.name in ("admin", "manager")
                    if chat.user_id != user_id and not is_admin:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Access denied"}))
                        continue
                    manager.subscribe(user_id, chat_id)
                    logger.info(f"User {user_id} subscribed to chat {chat_id}")
                finally:
                    db.close()

            elif msg_type == "message":
                chat_id = data.get("chat_id")
                text = data.get("text", "").strip()
                if not chat_id or not text:
                    await websocket.send_text(json.dumps({"type": "error", "message": "chat_id and text required"}))
                    continue

                # Save message to DB
                db: Session = next(get_db())
                try:
                    chat = db.query(ChatConversation).filter(ChatConversation.id == chat_id).first()
                    if not chat:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Chat not found"}))
                        continue

                    from app.models import User
                    user = db.query(User).filter(User.id == user_id).first()
                    is_admin = user and user.role.name in ("admin", "manager")

                    # Verify access
                    if chat.user_id != user_id and not is_admin:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Access denied"}))
                        continue

                    # Determine sender role based on source, not user role
                    source = data.get("source", "storefront")
                    sender_role = SenderRole.ADMIN if source == "admin" else SenderRole.USER

                    # Ensure subscription
                    manager.subscribe(user_id, chat_id)

                    # Auto-assign admin if not assigned (only for admin source)
                    if source == "admin" and not chat.assigned_to:
                        chat.assigned_to = user_id

                    # Update status to active if it was new (only for admin source)
                    if chat.status == ChatStatus.NEW and source == "admin":
                        chat.status = ChatStatus.ACTIVE

                    # Create the message
                    message = ChatMessage(
                        conversation_id=chat_id,
                        sender_id=user_id,
                        sender_role=sender_role,
                        message=text,
                    )
                    db.add(message)
                    chat.updated_at = message.created_at
                    db.commit()
                    db.refresh(message)
                    db.refresh(chat)

                    # Prepare message data for broadcast
                    sender_name = message.sender.full_name or f"{message.sender.first_name or ''} {message.sender.last_name or ''}".strip() or message.sender.email
                    msg_data = {
                        "id": message.id,
                        "conversation_id": message.conversation_id,
                        "sender_id": message.sender_id,
                        "sender_role": message.sender_role.value,
                        "sender_name": sender_name,
                        "sender_group": message.sender.role.name if message.sender.role else None,
                        "sender_avatar_index": message.sender.avatar_index,
                        "message": message.message,
                        "created_at": message.created_at.isoformat(),
                    }

                    # Ensure the other party is subscribed (admin subscribes on all chats)
                    # Broadcast to all subscribers (including sender for confirmation)
                    await manager.broadcast_new_message(chat_id, msg_data)

                    # If the other side is not subscribed, they won't see it until they refresh
                    # But that's fine - they'll get it when they open the chat or poll
                    logger.info(f"Message saved: chat={chat_id}, user={user_id}, role={sender_role.value}")

                except Exception as e:
                    db.rollback()
                    logger.error(f"Error saving message: {e}")
                    await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
                finally:
                    db.close()

            elif msg_type == "typing":
                chat_id = data.get("chat_id")
                is_typing = data.get("is_typing", False)
                if chat_id:
                    await manager.broadcast_typing(chat_id, user_id, is_typing)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: user={user_id}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
    finally:
        manager.disconnect(user_id, websocket)
