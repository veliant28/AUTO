from pydantic import BaseModel
from typing import Optional

class SettingsResponse(BaseModel):
    brand_name: str
    timezone: str = "Europe/Kiev"
    email_from: str = "noreply@svom.com.ua"
    email_from_name: Optional[str] = None
    has_resend_api_key: bool = False
    resend_api_key_masked: Optional[str] = None
    google_client_id: Optional[str] = None
    has_google_secret: bool = False
    google_client_secret_masked: Optional[str] = None
    has_checkbox_api_key: bool = False
    checkbox_api_key_masked: Optional[str] = None
    checkbox_organization_id: Optional[str] = None
    checkbox_is_test: bool = True
    # Payment method toggles
    payment_cod_enabled: bool = True
    payment_monobank_enabled: bool = True
    payment_novapay_enabled: bool = True
    payment_liqpay_enabled: bool = True
    # Monobank
    has_monobank_token: bool = False
    monobank_token_masked: Optional[str] = None
    # LiqPay
    has_liqpay_public_key: bool = False
    liqpay_public_key_masked: Optional[str] = None
    has_liqpay_private_key: bool = False
    liqpay_private_key_masked: Optional[str] = None
    # NovaPay
    has_novapay_private_key: bool = False
    novapay_private_key_masked: Optional[str] = None
    novapay_merchant_id: Optional[str] = None

class SettingsUpdate(BaseModel):
    brand_name: Optional[str] = None
    timezone: Optional[str] = None
    resend_api_key: Optional[str] = None
    email_from: Optional[str] = None
    email_from_name: Optional[str] = None
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    checkbox_api_key: Optional[str] = None
    checkbox_organization_id: Optional[str] = None
    checkbox_is_test: Optional[bool] = None
    # Payment method toggles
    payment_cod_enabled: Optional[bool] = None
    payment_monobank_enabled: Optional[bool] = None
    payment_novapay_enabled: Optional[bool] = None
    payment_liqpay_enabled: Optional[bool] = None
    # Monobank
    monobank_token: Optional[str] = None
    # LiqPay
    liqpay_public_key: Optional[str] = None
    liqpay_private_key: Optional[str] = None
    # NovaPay
    novapay_merchant_id: Optional[str] = None
    novapay_private_key: Optional[str] = None

class EmailTestRequest(BaseModel):
    to_email: str
