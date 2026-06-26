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

class SettingsUpdate(BaseModel):
    brand_name: Optional[str] = None
    timezone: Optional[str] = None
    resend_api_key: Optional[str] = None
    email_from: Optional[str] = None
    email_from_name: Optional[str] = None
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None

class EmailTestRequest(BaseModel):
    to_email: str
