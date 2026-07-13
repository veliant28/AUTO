import httpx
from app.core.config import settings

TELEGRAM_API_TEMPLATE = "https://api.telegram.org/bot{token}"


async def send_message(chat_id: int, text: str, bot_token: str | None = None) -> bool:
    """Send a message via Telegram Bot API.

    Args:
        chat_id: Telegram chat/group ID.
        text: Message text (HTML parse mode supported).
        bot_token: Bot token to use. Falls back to env TELEGRAM_BOT_TOKEN.

    Returns:
        True if the message was sent successfully.
    """
    token = bot_token or settings.TELEGRAM_BOT_TOKEN
    if not token:
        return False
    try:
        api_url = TELEGRAM_API_TEMPLATE.format(token=token)
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{api_url}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                },
            )
            return res.is_success
    except Exception:
        return False


async def set_webhook(url: str, bot_token: str | None = None) -> bool:
    """Set Telegram bot webhook URL."""
    token = bot_token or settings.TELEGRAM_BOT_TOKEN
    if not token:
        return False
    try:
        api_url = TELEGRAM_API_TEMPLATE.format(token=token)
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{api_url}/setWebhook", json={"url": url})
            return res.is_success
    except Exception:
        return False


async def get_me(bot_token: str) -> dict | None:
    """Get bot info (username, id) from Telegram via getMe.

    Returns dict with 'id' and 'username' keys, or None on failure.
    """
    try:
        api_url = TELEGRAM_API_TEMPLATE.format(token=bot_token)
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{api_url}/getMe")
            if res.is_success:
                data = res.json()
                return data.get("result")
    except Exception:
        return None
    return None


async def get_updates(bot_token: str, offset: int = 0, timeout: int = 5) -> list:
    """Poll Telegram for new updates (messages sent to the bot).

    Args:
        bot_token: Bot token.
        offset: Last update_id to acknowledge (next update will have offset+1).
        timeout: Long polling timeout in seconds.

    Returns:
        List of update objects from Telegram.
    """
    try:
        api_url = TELEGRAM_API_TEMPLATE.format(token=bot_token)
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{api_url}/getUpdates",
                params={"offset": offset, "timeout": timeout},
            )
            if res.is_success:
                data = res.json()
                return data.get("result", [])
    except Exception:
        return []
    return []
