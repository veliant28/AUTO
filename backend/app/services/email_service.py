"""Отправка писем (Resend) и фирменные HTML-шаблоны.

Все письма собираются единым шаблоном build_brand_email: шапка с логотипом
и названием бренда (логотип лежит в public фронтенда, адрес берётся из
настройки site_url), тело с заголовком и кнопкой, подвал с телефоном и
часами работы из настроек.
"""
import asyncio
import logging
from dataclasses import dataclass
from typing import List, Optional, Tuple

import resend

logger = logging.getLogger(__name__)

def send_email(
    to_email: str,
    subject: str,
    html: str,
    api_key: str,
    from_email: str = "noreply@svom.com.ua",
    from_name: Optional[str] = None,
) -> dict:
    """Отправить email через Resend API (синхронно)."""
    resend.api_key = api_key

    params = {
        "from": f"{from_name or 'SVOM'} <{from_email}>",
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    try:
        response = resend.Emails.send(params)
        logger.info("Email sent to %s: %s", to_email, response)
        return {"id": response.get("id") if isinstance(response, dict) else str(response)}
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, e)
        raise


@dataclass
class EmailBranding:
    """Реквизиты бренда для писем (из SiteSettings)."""

    brand_name: str = "SVOM"
    site_url: Optional[str] = None
    contact_phone: Optional[str] = None
    work_start: Optional[str] = None
    work_end: Optional[str] = None


# Подписи локалей: ru / ua / en
_LABELS = {
    "ru": {
        "phone": "Телефон",
        "work_hours": "Время работы",
        "rights": "Все права защищены",
    },
    "ua": {
        "phone": "Телефон",
        "work_hours": "Час роботи",
        "rights": "Усі права захищено",
    },
    "en": {
        "phone": "Phone",
        "work_hours": "Working hours",
        "rights": "All rights reserved",
    },
}


def normalize_locale(locale: Optional[str]) -> str:
    loc = (locale or "ru").strip().lower()
    if loc.startswith("uk") or loc.startswith("ua"):
        return "ua"
    if loc.startswith("en"):
        return "en"
    return "ru"


def build_brand_email(
    *,
    branding: EmailBranding,
    locale: str,
    title: str,
    paragraphs: List[str],
    button: Optional[Tuple[str, str]] = None,
    footnote: Optional[str] = None,
) -> str:
    """Собрать письмо по фирменному шаблону (логотип, телефон, часы работы)."""
    loc = normalize_locale(locale)
    labels = _LABELS[loc]
    brand = branding.brand_name or "SVOM"

    logo_html = ""
    if branding.site_url:
        logo_html = (
            f'<img src="{branding.site_url}/logo.png" width="46" height="46" alt="{brand}" '
            'style="display:block;margin:0 auto 10px;border-radius:10px;">'
        )
    brand_html = (
        f'<div style="text-align:center;">{logo_html}'
        f'<span style="color:#111827;font-size:20px;font-weight:700;letter-spacing:0.5px;">{brand}</span>'
        "</div>"
    )

    body_html = "".join(
        f'<p style="color:#555;line-height:1.6;margin:0 0 12px;">{p}</p>' for p in paragraphs
    )

    button_html = ""
    if button:
        text, url = button
        button_html = (
            '<div style="text-align:center;margin:24px 0;">'
            f'<a href="{url}" style="display:inline-block;background:#2563eb;color:#fff;'
            'text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;">'
            f"{text}</a></div>"
        )

    footnote_html = ""
    if footnote:
        footnote_html = (
            f'<p style="color:#999;font-size:13px;line-height:1.5;margin:0 0 8px;">{footnote}</p>'
        )

    # Подвал: телефон и часы работы из настроек (что задано — то и показываем)
    footer_lines = []
    if branding.contact_phone:
        footer_lines.append(f'{labels["phone"]}: {branding.contact_phone}')
    if branding.work_start and branding.work_end:
        footer_lines.append(
            f'{labels["work_hours"]}: {branding.work_start}&ndash;{branding.work_end}'
        )
    footer_info_html = ""
    if footer_lines:
        footer_info_html = (
            '<p style="color:#666;font-size:13px;line-height:1.7;text-align:center;margin:0 0 6px;">'
            + "<br>".join(footer_lines)
            + "</p>"
        )

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 36px 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="border-bottom: 1px solid #eee; padding-bottom: 18px; margin-bottom: 24px;">
      {brand_html}
    </div>
    <h2 style="color: #1a1a1a; margin: 0 0 16px; font-size: 22px;">{title}</h2>
    {body_html}
    {button_html}
    {footnote_html}
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0 16px;">
    {footer_info_html}
    <p style="color: #aaa; font-size: 12px; text-align: center; margin: 0;">
      &copy; {brand}. {labels["rights"]}.
    </p>
  </div>
</body>
</html>"""


# ── Конкретные письма ───────────────────────────────────────────────────────

def branding_from_settings(settings) -> EmailBranding:
    """Реквизиты бренда из SiteSettings (логотип — {site_url}/logo.png)."""
    if settings is None:
        return EmailBranding()
    return EmailBranding(
        brand_name=settings.brand_name or "SVOM",
        site_url=(settings.site_url or "").strip().rstrip("/") or None,
        contact_phone=(settings.contact_phone or "").strip() or None,
        work_start=settings.work_start_time or "09:00",
        work_end=settings.work_end_time or "18:00",
    )


async def send_brand_email(db, to_email: str, subject: str, html: str) -> bool:
    """Отправить письмо через Resend с реквизитами из настроек.

    False — если ключ Resend не настроен (письмо не отправлено, без ошибки).
    """
    from app.core.config import settings as app_settings
    from app.models.settings import SiteSettings
    from app.services.crypto_util import decrypt_password

    site_settings = db.query(SiteSettings).first()
    api_key = None
    if site_settings and site_settings.resend_api_key_encrypted:
        try:
            api_key = decrypt_password(site_settings.resend_api_key_encrypted)
        except Exception:
            api_key = None
    api_key = api_key or app_settings.RESEND_API_KEY
    if not api_key:
        logger.warning("Resend API key is not configured — email to %s skipped", to_email)
        return False

    await asyncio.to_thread(
        send_email,
        to_email=to_email,
        subject=subject,
        html=html,
        api_key=api_key,
        from_email=site_settings.email_from if site_settings else "noreply@svom.com.ua",
        from_name=site_settings.email_from_name if site_settings else None,
    )
    return True


def build_password_reset_html(
    branding: EmailBranding,
    locale: str,
    reset_link: str,
    user_name: str,
) -> str:
    """Письмо сброса пароля."""
    loc = normalize_locale(locale)
    texts = {
        "ru": {
            "subject": "Восстановление пароля",
            "hello": "Здравствуйте, <strong>{name}</strong>!",
            "body": "Мы получили запрос на сброс пароля. Нажмите кнопку ниже, чтобы установить новый пароль.",
            "button": "Сбросить пароль",
            "note": "Ссылка действительна 1 час. Если вы не запрашивали сброс — просто проигнорируйте это письмо.",
        },
        "ua": {
            "subject": "Відновлення пароля",
            "hello": "Вітаємо, <strong>{name}</strong>!",
            "body": "Ми отримали запит на скидання пароля. Натисніть кнопку нижче, щоб встановити новий пароль.",
            "button": "Скинути пароль",
            "note": "Посилання дійсне 1 годину. Якщо ви не запитували скидання — просто проігноруйте цей лист.",
        },
        "en": {
            "subject": "Password Reset",
            "hello": "Hello, <strong>{name}</strong>!",
            "body": "We received a request to reset your password. Click the button below to set a new password.",
            "button": "Reset Password",
            "note": "The link expires in 1 hour. If you did not request a reset, you can safely ignore this email.",
        },
    }[loc]
    return build_brand_email(
        branding=branding,
        locale=loc,
        title=texts["subject"],
        paragraphs=[texts["hello"].format(name=user_name or ""), texts["body"]],
        button=(texts["button"], reset_link),
        footnote=texts["note"],
    )


def build_b2b_approved_html(
    branding: EmailBranding,
    locale: str,
    name: str,
    login: str,
    password: Optional[str],
) -> str:
    """Письмо одобрения B2B-заявки.

    password=None — клиент уже зарегистрирован, роль повышена: данные входа
    не отправляем, пароль у него уже есть (при забытом — сброс пароля).
    """
    loc = normalize_locale(locale)
    login_url = f"{branding.site_url}/auth/login" if branding.site_url else ""
    texts = {
        "ru": {
            "subject": "Заявка на B2B одобрена",
            "hello": "Здравствуйте, <strong>{name}</strong>!",
            "body": "Ваша заявка на корпоративный доступ (B2B) одобрена. Теперь для вас действуют B2B-цены.",
            "creds": "Данные для входа:<br>Логин: <strong>{login}</strong><br>Пароль: <strong>{password}</strong>",
            "creds_note": "Рекомендуем сменить пароль после первого входа в личном кабинете.",
            "existing": "Ваш существующий аккаунт повышен до корпоративного (B2B) — входите с прежним паролем.",
            "button": "Войти в личный кабинет",
        },
        "ua": {
            "subject": "Заявку на B2B схвалено",
            "hello": "Вітаємо, <strong>{name}</strong>!",
            "body": "Вашу заявку на корпоративний доступ (B2B) схвалено. Тепер для вас діють B2B-ціни.",
            "creds": "Дані для входу:<br>Логін: <strong>{login}</strong><br>Пароль: <strong>{password}</strong>",
            "creds_note": "Рекомендуємо змінити пароль після першого входу в особистий кабінет.",
            "existing": "Ваш наявний акаунт підвищено до корпоративного (B2B) — входьте зі старим паролем.",
            "button": "Увійти в особистий кабінет",
        },
        "en": {
            "subject": "Your B2B application is approved",
            "hello": "Hello, <strong>{name}</strong>!",
            "body": "Your corporate (B2B) access application has been approved. B2B prices now apply to your account.",
            "creds": "Sign-in details:<br>Login: <strong>{login}</strong><br>Password: <strong>{password}</strong>",
            "creds_note": "We recommend changing the password after your first sign-in.",
            "existing": "Your existing account has been upgraded to corporate (B2B) — sign in with your current password.",
            "button": "Sign in",
        },
    }[loc]

    paragraphs = [
        texts["hello"].format(name=name or ""),
        texts["body"],
        texts["creds"].format(login=login, password=password)
        if password
        else texts["existing"],
    ]
    footnote = texts["creds_note"] if password else None
    return build_brand_email(
        branding=branding,
        locale=loc,
        title=texts["subject"],
        paragraphs=paragraphs,
        button=(texts["button"], login_url) if login_url else None,
        footnote=footnote,
    )


def build_b2b_rejected_html(
    branding: EmailBranding,
    locale: str,
    name: str,
    reason: Optional[str] = None,
) -> str:
    """Письмо отклонения B2B-заявки."""
    loc = normalize_locale(locale)
    texts = {
        "ru": {
            "subject": "Заявка на B2B отклонена",
            "hello": "Здравствуйте, <strong>{name}</strong>!",
            "body": "К сожалению, ваша заявка на корпоративный доступ (B2B) отклонена.",
            "reason": "Причина: {reason}",
            "note": "Если считаете это ошибкой — свяжитесь с нами, мы разберёмся.",
        },
        "ua": {
            "subject": "Заявку на B2B відхилено",
            "hello": "Вітаємо, <strong>{name}</strong>!",
            "body": "На жаль, вашу заявку на корпоративний доступ (B2B) відхилено.",
            "reason": "Причина: {reason}",
            "note": "Якщо вважаєте це помилкою — зв'яжіться з нами, ми розберемося.",
        },
        "en": {
            "subject": "Your B2B application was rejected",
            "hello": "Hello, <strong>{name}</strong>!",
            "body": "Unfortunately, your corporate (B2B) access application has been rejected.",
            "reason": "Reason: {reason}",
            "note": "If you believe this is a mistake, contact us and we will look into it.",
        },
    }[loc]

    paragraphs = [texts["hello"].format(name=name or ""), texts["body"]]
    if reason:
        paragraphs.append(texts["reason"].format(reason=reason))
    return build_brand_email(
        branding=branding,
        locale=loc,
        title=texts["subject"],
        paragraphs=paragraphs,
        footnote=texts["note"],
    )
