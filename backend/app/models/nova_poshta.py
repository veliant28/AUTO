from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Numeric, Text, Enum as SAEnum, JSON, Index
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .vehicles import Base


class NovaPoshtaSenderProfile(Base):
    __tablename__ = "nova_poshta_sender_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    sender_type = Column(String(32), nullable=False)  # private_person, fop, business

    api_token = Column(String(255), nullable=False)

    counterparty_ref = Column(String(36), default="")
    contact_ref = Column(String(36), default="")
    address_ref = Column(String(36), default="")
    city_ref = Column(String(36), default="")

    first_name = Column(String(36), default="")
    last_name = Column(String(36), default="")
    middle_name = Column(String(36), default="")
    phone = Column(String(32), default="")
    email = Column(String(36), default="")
    contact_name = Column(String(255), default="")
    organization_name = Column(String(255), default="")
    edrpou = Column(String(32), default="")

    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)

    last_validated_at = Column(DateTime, nullable=True)
    last_validation_ok = Column(Boolean, default=False)
    last_validation_message = Column(String(500), default="")
    last_validation_payload = Column(JSON, default=dict)

    raw_meta = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("np_sender_act_def", "is_active", "is_default"),
        Index("np_sender_type", "sender_type"),
    )

    def __str__(self) -> str:
        return self.name


class OrderNovaPoshtaWaybill(Base):
    __tablename__ = "order_nova_poshta_waybills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, index=True)
    sender_profile_id = Column(Integer, ForeignKey("nova_poshta_sender_profiles.id"), nullable=False)

    np_ref = Column(String(36), default="")
    np_number = Column(String(64), default="")

    status_code = Column(String(64), default="")
    status_text = Column(String(255), default="")
    status_synced_at = Column(DateTime, nullable=True)

    payer_type = Column(String(32), default="")
    payment_method = Column(String(32), default="")
    service_type = Column(String(32), default="")
    cargo_type = Column(String(32), default="Cargo")

    cost = Column(Numeric(12, 2), default=0)
    weight = Column(Numeric(10, 3), default=0)
    seats_amount = Column(Integer, default=1)
    afterpayment_amount = Column(Numeric(12, 2), nullable=True)

    recipient_city_ref = Column(String(36), default="")
    recipient_city_label = Column(String(255), default="")
    recipient_address_ref = Column(String(36), default="")
    recipient_address_label = Column(String(255), default="")
    recipient_counterparty_ref = Column(String(36), default="")
    recipient_contact_ref = Column(String(36), default="")
    recipient_name = Column(String(255), default="")
    recipient_phone = Column(String(32), default="")
    recipient_street_ref = Column(String(36), default="")
    recipient_street_label = Column(String(255), default="")
    recipient_house = Column(String(32), default="")
    recipient_apartment = Column(String(32), default="")

    description_snapshot = Column(String(255), default="")
    additional_information_snapshot = Column(String(255), default="")

    raw_request_json = Column(JSON, default=dict)
    raw_response_json = Column(JSON, default=dict)
    raw_last_tracking_json = Column(JSON, default=dict)

    error_codes = Column(JSON, default=list)
    warning_codes = Column(JSON, default=list)
    info_codes = Column(JSON, default=list)

    print_url_html = Column(String(1024), default="")
    print_url_pdf = Column(String(1024), default="")

    can_edit = Column(Boolean, default=True)
    last_sync_error = Column(Text, default="")

    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    order = relationship("Order", foreign_keys=[order_id])
    sender_profile = relationship("NovaPoshtaSenderProfile", foreign_keys=[sender_profile_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])

    __table_args__ = (
        Index("np_wb_order_del", "order_id", "is_deleted"),
        Index("np_wb_number", "np_number"),
        Index("np_wb_status", "status_code"),
    )

    def __str__(self) -> str:
        return self.np_number or str(self.id)

    def mark_deleted(self) -> None:
        self.is_deleted = True
        self.deleted_at = datetime.utcnow()


class OrderNovaPoshtaWaybillEvent(Base):
    __tablename__ = "order_nova_poshta_waybill_events"

    EVENT_CREATE = "create"
    EVENT_UPDATE = "update"
    EVENT_DELETE = "delete"
    EVENT_SYNC = "sync"
    EVENT_ERROR = "error"
    EVENT_PRINT = "print"

    id = Column(Integer, primary_key=True, autoincrement=True)
    waybill_id = Column(Integer, ForeignKey("order_nova_poshta_waybills.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    event_type = Column(String(32), nullable=False)
    message = Column(String(500), default="")
    status_code = Column(String(64), default="")
    status_text = Column(String(255), default="")

    payload = Column(JSON, default=dict)
    raw_response = Column(JSON, default=dict)
    errors = Column(JSON, default=list)
    warnings = Column(JSON, default=list)
    info = Column(JSON, default=list)
    error_codes = Column(JSON, default=list)
    warning_codes = Column(JSON, default=list)
    info_codes = Column(JSON, default=list)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    waybill = relationship("OrderNovaPoshtaWaybill", foreign_keys=[waybill_id])
    order = relationship("Order", foreign_keys=[order_id])
    created_by = relationship("User", foreign_keys=[created_by_id])

    __table_args__ = (
        Index("np_wbe_order_type", "order_id", "event_type"),
        Index("np_wbe_wb_created", "waybill_id", "created_at"),
    )

    def __str__(self) -> str:
        return f"{self.event_type}:{self.order_id}"
