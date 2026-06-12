from sqlalchemy import Column, Integer, String
from .vehicles import Base

class SiteSettings(Base):
    __tablename__ = "site_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_name = Column(String, nullable=False, default="SVOM")
    timezone = Column(String, nullable=False, default="Europe/Kiev")
