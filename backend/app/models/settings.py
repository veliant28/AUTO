from sqlalchemy import Column, Integer, String, Text
from .vehicles import Base

class SiteSettings(Base):
    __tablename__ = "site_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_name = Column(String, nullable=False, default="SVOM")
    timezone = Column(String, nullable=False, default="Europe/Kiev")
    resend_api_key_encrypted = Column(Text, nullable=True)
    email_from = Column(String, nullable=False, default="noreply@svom.com.ua")
    email_from_name = Column(String, nullable=True)
