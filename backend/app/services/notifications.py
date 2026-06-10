import logging

logger = logging.getLogger(__name__)


def send_telegram_notification(message: str) -> None:
    """Send a notification message via Telegram bot (stub for now)."""
    logger.info("Notification: %s", message)
