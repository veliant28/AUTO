from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Numeric, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from .vehicles import Base


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    payment_method = Column(String(32), nullable=False, comment="cod | monobank | novapay | liqpay")
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(
        String(20),
        nullable=False,
        default="pending",
        comment="pending | paid | failed | refunded | expired",
    )
    provider_tx_id = Column(String(255), nullable=True, comment="ID транзакции в банке")
    payment_url = Column(Text, nullable=True, comment="Ссылка на оплату")
    invoice_url = Column(Text, nullable=True, comment="Ссылка на инвойс")
    receipt_url = Column(Text, nullable=True, comment="Ссылка на квитанцию")
    meta = Column(JSON, nullable=True, comment="Банк-специфичные данные")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    order = relationship("Order", backref="payment_transactions")
