import resend
import logging
from typing import Optional

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


def build_password_reset_html(reset_link: str, user_name: str) -> str:
    """Собрать HTML-шаблон письма для сброса пароля (английский)."""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; background: #2563eb; color: white; font-size: 28px; font-weight: bold; padding: 12px 20px; border-radius: 10px;">
        SVOM
      </div>
    </div>
    <h2 style="color: #1a1a1a; margin-bottom: 12px;">Password Reset</h2>
    <p style="color: #555; line-height: 1.6; margin-bottom: 8px;">Hello, <strong>{user_name}</strong>!</p>
    <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
      We received a request to reset your password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
    </p>
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="{reset_link}"
         style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
        Reset Password
      </a>
    </div>
    <p style="color: #999; font-size: 13px; line-height: 1.5;">
      If you did not request a password reset, you can safely ignore this email.<br>
      The link will expire in 1 hour.
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
    <p style="color: #aaa; font-size: 12px; text-align: center;">
      &copy; SVOM Auto Parts. All rights reserved.
    </p>
  </div>
</body>
</html>"""


def build_password_reset_html_ru(reset_link: str, user_name: str) -> str:
    """Собрать HTML-шаблон письма для сброса пароля (русский)."""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; background: #2563eb; color: white; font-size: 28px; font-weight: bold; padding: 12px 20px; border-radius: 10px;">
        SVOM
      </div>
    </div>
    <h2 style="color: #1a1a1a; margin-bottom: 12px;">Восстановление пароля</h2>
    <p style="color: #555; line-height: 1.6; margin-bottom: 8px;">Здравствуйте, <strong>{user_name}</strong>!</p>
    <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">
      Мы получили запрос на сброс пароля. Нажмите кнопку ниже, чтобы установить новый пароль. Ссылка действительна <strong>1 час</strong>.
    </p>
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="{reset_link}"
         style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
        Сбросить пароль
      </a>
    </div>
    <p style="color: #999; font-size: 13px; line-height: 1.5;">
      Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.<br>
      Ссылка действительна в течение 1 часа.
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
    <p style="color: #aaa; font-size: 12px; text-align: center;">
      &copy; SVOM Auto Parts. Все права защищены.
    </p>
  </div>
</body>
</html>"""
