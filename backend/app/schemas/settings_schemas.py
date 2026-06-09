from pydantic import BaseModel
from typing import Optional

class SettingsResponse(BaseModel):
    brand_name: str

class SettingsUpdate(BaseModel):
    brand_name: Optional[str] = None
