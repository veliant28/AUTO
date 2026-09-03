from sqlalchemy import Column, Integer, String, Text, Boolean, text
from .vehicles import Base

class SiteSettings(Base):
    __tablename__ = "site_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_name = Column(String, nullable=False, default="SVOM")
    timezone = Column(String, nullable=False, default="Europe/Kiev")
    resend_api_key_encrypted = Column(Text, nullable=True)
    email_from = Column(String, nullable=False, default="noreply@svom.com.ua")
    email_from_name = Column(String, nullable=True)
    google_client_id = Column(String, nullable=True)
    google_client_secret_encrypted = Column(Text, nullable=True)
    checkbox_api_key_encrypted = Column(Text, nullable=True)
    checkbox_organization_id = Column(String, nullable=True)
    checkbox_is_test = Column(Boolean, nullable=False, default=True, server_default=text('true'))

    # Payment method toggles
    payment_cod_enabled = Column(Boolean, nullable=False, default=True, server_default=text('true'))
    payment_monobank_enabled = Column(Boolean, nullable=False, default=True, server_default=text('true'))
    payment_novapay_enabled = Column(Boolean, nullable=False, default=True, server_default=text('true'))
    payment_liqpay_enabled = Column(Boolean, nullable=False, default=True, server_default=text('true'))

    # Monobank
    monobank_token_encrypted = Column(Text, nullable=True)
    monobank_monopay_key_id = Column(String, nullable=True)
    monobank_ecdsa_private_key_encrypted = Column(Text, nullable=True)

    # LiqPay
    liqpay_public_key_encrypted = Column(Text, nullable=True)
    liqpay_private_key_encrypted = Column(Text, nullable=True)

    # NovaPay
    novapay_merchant_id = Column(String, nullable=True)
    novapay_private_key_encrypted = Column(Text, nullable=True)
    # Публичный ключ NovaPay — для проверки подписи постбеков (x-sign-v2)
    novapay_public_key = Column(Text, nullable=True)
    # True = тестовая среда api-qecom.novapay.ua, False = прод api-ecom
    novapay_is_test = Column(Boolean, nullable=False, default=True, server_default=text('true'))

    # Telegram notifications
    telegram_bot_token_encrypted = Column(Text, nullable=True)
    telegram_chat_id = Column(String, nullable=True)

    # Backup schedule
    backup_run_at_time = Column(String, nullable=False, default="02:00")

    # Work-time tracking (фиксация рабочего времени)
    work_start_time = Column(String, nullable=False, default="09:00")
    work_end_time = Column(String, nullable=False, default="18:00")
    # Автофиксация выхода (HH:MM); NULL = «конец смены + 15 минут»
    work_auto_clockout_time = Column(String, nullable=True)
    track_admin = Column(Boolean, nullable=False, default=False, server_default=text('false'))
    track_manager = Column(Boolean, nullable=False, default=False, server_default=text('false'))
    track_operator = Column(Boolean, nullable=False, default=False, server_default=text('false'))
