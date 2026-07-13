from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets
from app.core.db import get_db
from app.core.config import settings
from app.models import TelegramLink, User
from app.models.settings import SiteSettings
from app.api.v1.endpoints.auth import get_current_user
from app.telegram.client import send_message, get_me
from app.services.crypto_util import decrypt_password

router = APIRouter()


@router.post("/start")
async def start_connection(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    """Начать привязку Telegram аккаунта (генерирует код)."""
    existing = db.query(TelegramLink).filter(
        TelegramLink.user_id == user_id,
        TelegramLink.connected == True
    ).first()
    if existing:
        return {"message": "Telegram уже подключён", "connected": True}

    code = str(secrets.randbelow(900000) + 100000)
    link = db.query(TelegramLink).filter(TelegramLink.user_id == user_id).first()
    if link:
        link.code = code
        link.code_expires_at = datetime.utcnow() + timedelta(minutes=5)
        link.connected = False
    else:
        link = TelegramLink(
            user_id=user_id,
            code=code,
            code_expires_at=datetime.utcnow() + timedelta(minutes=5),
        )
        db.add(link)
    db.commit()

    # Get actual bot username from the configured token
    bot_username = settings.TELEGRAM_BOT_USERNAME or "SVOMBot"
    try:
        s = db.query(SiteSettings).first()
        if s and s.telegram_bot_token_encrypted:
            token = decrypt_password(s.telegram_bot_token_encrypted)
            if token:
                me = await get_me(token)
                if me and me.get("username"):
                    bot_username = me["username"]
    except Exception:
        pass

    return {
        "message": "Код сгенерирован",
        "code": code,
        "bot_username": bot_username,
        "connected": False,
    }

@router.get("/status")
async def connection_status(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    """Получить статус подключения Telegram."""
    link = db.query(TelegramLink).filter(
        TelegramLink.user_id == user_id,
        TelegramLink.connected == True
    ).first()
    if link:
        return {
            "connected": True,
            "username": link.telegram_username if link else None,
        }

    # If not connected, try polling Telegram directly in case webhook wasn't received
    try:
        from app.models.settings import SiteSettings
        from app.services.crypto_util import decrypt_password
        from app.telegram.client import get_updates, send_message

        s = db.query(SiteSettings).first()
        if not s or not s.telegram_bot_token_encrypted:
            return {"connected": False, "username": None}

        token = decrypt_password(s.telegram_bot_token_encrypted)
        if not token:
            return {"connected": False, "username": None}

        # Find any pending or expired link for this user (to get their code)
        pending = db.query(TelegramLink).filter(
            TelegramLink.user_id == user_id,
            TelegramLink.connected == False,
            TelegramLink.code.isnot(None),
        ).first()

        if pending and pending.code:
            updates = await get_updates(token)
            for update in updates:
                msg = update.get("message", {})
                chat = msg.get("chat", {})
                chat_id = chat.get("id")
                text = msg.get("text", "")
                username = chat.get("username") or msg.get("from", {}).get("first_name", "")
                if text == f"/start {pending.code}":
                    pending.chat_id = chat_id
                    pending.telegram_username = username
                    pending.connected = True
                    pending.code = None
                    pending.code_expires_at = None
                    db.commit()

                    user = db.query(User).filter(User.id == user_id).first()
                    email = user.email if user else "?"
                    await send_message(chat_id,
                        f"🔗 Аккаунт <b>{email}</b> привязан!\n"
                        "Теперь вы будете получать уведомления о статусе заказов.",
                        bot_token=token,
                    )

                    return {"connected": True, "username": username}
    except Exception:
        pass

    return {"connected": False, "username": None}

@router.post("/disconnect")
async def disconnect(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    """Отключить Telegram аккаунт."""
    link = db.query(TelegramLink).filter(
        TelegramLink.user_id == user_id,
        TelegramLink.connected == True
    ).first()
    if not link:
        raise HTTPException(400, "Telegram не подключён")
    link.connected = False
    link.chat_id = None
    link.telegram_username = None
    db.commit()
    return {"message": "Telegram отключён"}

@router.post("/webhook")
async def telegram_webhook(request: Request, db: Session = Depends(get_db)):
    """Обработчик вебхука от Telegram Bot API."""
    body = await request.json()
    message = body.get("message", {})
    chat = message.get("chat", {})
    chat_id = chat.get("id")
    text = message.get("text", "")
    username = chat.get("username") or message.get("from", {}).get("first_name", "")

    if not chat_id or not text:
        return {"ok": True}

    if text.startswith("/start"):
        parts = text.split()
        code = parts[1] if len(parts) > 1 else ""

        if code:
            link = db.query(TelegramLink).filter(
                TelegramLink.code == code,
                TelegramLink.connected == False
            ).first()
            if link and link.code_expires_at > datetime.utcnow():
                link.chat_id = chat_id
                link.telegram_username = username
                link.connected = True
                link.code = None
                link.code_expires_at = None
                db.commit()

                user = db.query(User).filter(User.id == link.user_id).first()
                email = user.email if user else "?"

                await send_message(chat_id,
                    f"🔗 Аккаунт <b>{email}</b> привязан!\n"
                    "Теперь вы будете получать уведомления о статусе заказов."
                )
            else:
                await send_message(chat_id,
                    "❌ Код недействителен или истёк.\n"
                    "Запросите новый код в настройках профиля."
                )
        else:
            await send_message(chat_id,
                "👋 Добро пожаловать в SVOM Bot!\n\n"
                "Чтобы привязать аккаунт:\n"
                "1. Откройте Настройки профиля на сайте\n"
                "2. Нажмите «Подключить Telegram»\n"
                "3. Отправьте полученный код сюда"
            )
    elif text == "/stop":
        link = db.query(TelegramLink).filter(
            TelegramLink.chat_id == chat_id,
            TelegramLink.connected == True
        ).first()
        if link:
            link.connected = False
            link.chat_id = None
            db.commit()
            await send_message(chat_id, "✅ Уведомления отключены. Чтобы подключить снова — используйте код на сайте.")

    return {"ok": True}
