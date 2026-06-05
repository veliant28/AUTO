from pydantic import BaseModel
from typing import Optional

class BrandSchema(BaseModel):
    id: int
    name: str
    tecdoc_id: Optional[int]
    group: str

    class Config:
        from_attributes = True

class ModelSchema(BaseModel):
    id: int
    brand_id: int
    name: str
    tecdoc_id: Optional[int]

    class Config:
        from_attributes = True

class ModSchema(BaseModel):
    id: int
    model_id: int
    name: str
    tecdoc_id: Optional[int]

    class Config:
        from_attributes = True
