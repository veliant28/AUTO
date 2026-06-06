from sqlalchemy import Column, Integer, String, JSON
from .vehicles import Base

class FooterContent(Base):
    __tablename__ = "footer_content"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    locale = Column(String(2), unique=True, nullable=False)
    data = Column(JSON, nullable=False, default={})
