import httpx
from app.core.config import settings

TELEGRAM_API = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}"

async def send_message(chat_id: int, text: str) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{TELEGRAM_API}/sendMessage", json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
            })
            return res.is_success
    except Exception:
        return False

async def set_webhook(url: str) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{TELEGRAM_API}/setWebhook", json={"url": url})
            return res.is_success
    except Exception:
        return False
