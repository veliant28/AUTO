from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from .vehicles import Base

class Favorite(Base):
    __tablename__ = "favorites"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    
    user = relationship("User")
    part = relationship("Part")
