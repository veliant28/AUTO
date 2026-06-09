from pydantic import BaseModel
from typing import Optional

class SettingsResponse(BaseModel):
    brand_name: str
    timezone: str = "Europe/Kiev"

class SettingsUpdate(BaseModel):
    brand_name: Optional[str] = None
    timezone: Optional[str] = None
