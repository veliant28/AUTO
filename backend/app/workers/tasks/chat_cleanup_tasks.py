import logging
from datetime import datetime, timedelta
from sqlalchemy import delete
from app.core.db import SessionLocal
from app.core.config import settings
from app.models.support import ChatMessage, ChatConversation, ChatStatus
from app.workers import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="cleanup_old_chat_messages")
def cleanup_old_chat_messages():
    """Delete chat messages older than CHAT_HISTORY_DAYS and close orphaned conversations."""
    cutoff = datetime.utcnow() - timedelta(days=settings.CHAT_HISTORY_DAYS)
    logger.info(f"Cleaning up chat messages older than {cutoff} ({settings.CHAT_HISTORY_DAYS} days)")

    db = SessionLocal()
    try:
        # Delete old messages
        result = db.execute(
            delete(ChatMessage).where(ChatMessage.created_at < cutoff)
        )
        deleted_count = result.rowcount
        logger.info(f"Deleted {deleted_count} old chat messages")

        # Close conversations that have no messages at all
        from sqlalchemy.orm import joinedload
        orphaned = (
            db.query(ChatConversation)
            .outerjoin(ChatMessage, ChatMessage.conversation_id == ChatConversation.id)
            .filter(ChatMessage.id.is_(None))
            .filter(ChatConversation.status != ChatStatus.CLOSED)
            .all()
        )
        for chat in orphaned:
            chat.status = ChatStatus.CLOSED
            logger.info(f"Closed orphaned conversation #{chat.id} (no messages)")
        db.commit()
        logger.info(f"Closed {len(orphaned)} orphaned conversations")

    except Exception as e:
        db.rollback()
        logger.error(f"Chat cleanup failed: {e}")
        raise
    finally:
        db.close()
