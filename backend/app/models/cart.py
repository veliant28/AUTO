from sqlalchemy import Column, Integer, String, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from .vehicles import Base

class CartItem(Base):
    __tablename__ = "cart_items"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    quantity = Column(Integer, default=1)
    supplier_offer_id = Column(Integer, ForeignKey("supplier_offers.id"), nullable=True)
    
    user = relationship("User")
    part = relationship("Part")
    offer = relationship("SupplierOffer")
