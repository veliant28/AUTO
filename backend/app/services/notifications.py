import logging
from app.core.db import SessionLocal
from app.models.settings import SiteSettings
from app.models.telegram import TelegramLink
from app.services.crypto_util import decrypt_password
from app.telegram.client import send_message

logger = logging.getLogger(__name__)


async def send_telegram_notification(message: str) -> None:
    """Send a notification message via Telegram bot to the configured group chat.

    Reads bot token and chat ID from the SiteSettings table in the database.
    """
    try:
        db = SessionLocal()
        try:
            s: SiteSettings | None = db.query(SiteSettings).first()
            if not s:
                logger.warning("Telegram notification skipped: SiteSettings not found")
                return

            chat_id_str = s.telegram_chat_id
            if not chat_id_str:
                logger.debug("Telegram notification skipped: chat_id not configured")
                return

            if not s.telegram_bot_token_encrypted:
                logger.debug("Telegram notification skipped: bot token not configured")
                return

            try:
                chat_id = int(chat_id_str)
            except (ValueError, TypeError):
                logger.warning("Telegram notification skipped: invalid chat_id=%r", chat_id_str)
                return

            bot_token = decrypt_password(s.telegram_bot_token_encrypted)
            if not bot_token:
                logger.warning("Telegram notification skipped: failed to decrypt bot token")
                return

            ok = await send_message(chat_id, message, bot_token=bot_token)
            if ok:
                logger.info("Telegram notification sent to chat %s", chat_id)
            else:
                logger.warning("Telegram notification failed to send to chat %s", chat_id)
        finally:
            db.close()
    except Exception:
        logger.exception("Telegram notification error")


async def send_customer_telegram_notification(user_id: int, message: str) -> None:
    """Send a notification message to a specific customer via Telegram.

    Looks up the customer's linked Telegram account (TelegramLink) and
    sends the message directly to their chat. Silently skips if the
    customer hasn't connected Telegram or the bot is not configured.
    """
    try:
        db = SessionLocal()
        try:
            # Get bot token from settings
            s: SiteSettings | None = db.query(SiteSettings).first()
            if not s or not s.telegram_bot_token_encrypted:
                return

            bot_token = decrypt_password(s.telegram_bot_token_encrypted)
            if not bot_token:
                return

            # Find customer's Telegram link
            link = db.query(TelegramLink).filter(
                TelegramLink.user_id == user_id,
                TelegramLink.connected == True,
            ).first()

            if not link or not link.chat_id:
                return

            ok = await send_message(link.chat_id, message, bot_token=bot_token)
            if ok:
                logger.info("Telegram notification sent to customer %s (chat %s)", user_id, link.chat_id)
            else:
                logger.warning("Telegram notification failed for customer %s (chat %s)", user_id, link.chat_id)
        finally:
            db.close()
    except Exception:
        logger.exception("Customer Telegram notification error")
