from sqlalchemy import Column, Integer, String, Boolean, DateTime, Numeric, JSON, BigInteger
from sqlalchemy.sql import func
from .vehicles import Base


class TecDocConfig(Base):
    __tablename__ = "tecdoc_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    api_url = Column(String, nullable=False, default="https://auto-db.pro/api/v1/")
    auth_user = Column(String, nullable=False, default="")
    auth_pass = Column(String, nullable=False, default="")
    db_host = Column(String, nullable=False, default="")
    db_name = Column(String, nullable=False, default="")
    db_user = Column(String, nullable=False, default="")
    db_pass = Column(String, nullable=False, default="")
    updated_at = Column(DateTime, nullable=True)


class TecDocRateLog(Base):
    __tablename__ = "tecdoc_rate_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    called_at = Column(DateTime, server_default=func.now(), nullable=False)
    endpoint = Column(String, nullable=False)
    article = Column(String, nullable=True)
    brand_id = Column(Integer, nullable=True)
    success = Column(Boolean, default=True, nullable=False)
    response_ms = Column(Integer, nullable=True)


class SupplierPrice(Base):
    __tablename__ = "supplier_prices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sku = Column(String, unique=True, nullable=True, index=True)
    supplier = Column(String, nullable=False)
    article = Column(String, nullable=False)
    brand = Column(String, nullable=True)
    name = Column(String, nullable=True)
    price = Column(Numeric(10, 2), nullable=True)
    currency = Column(String, nullable=True)
    stock_total = Column(Integer, default=0, nullable=False)
    stock_regions = Column(JSON, nullable=True)
    tecdoc_article = Column(String, nullable=True)
    tecdoc_brand_id = Column(Integer, nullable=True)
    match_status = Column(String, default="pending", nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    last_attempt_at = Column(DateTime, nullable=True)
