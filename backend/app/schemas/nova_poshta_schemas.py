"""
Pydantic schemas for Nova Poshta integration.

Covers:
  - Sender profiles (CRUD + validation)
  - Online lookups (settlements, streets, warehouses, counterparties, etc.)
  - Waybills (TTN) CRUD
  - Events
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from decimal import Decimal

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════════
# Sender Profiles
# ═══════════════════════════════════════════════════════════════════════════════

class NovaPoshtaSenderProfileCreate(BaseModel):
    """Create a new NP sender profile.

    Per NP API documentation:
      - PrivatePerson: FirstName*, LastName*, MiddleName*, Phone*
      - Organization:  EDRPOU*, plus ContactPerson (FirstName*, LastName*, MiddleName*, Phone*)
    """
    sender_type: str = Field(..., pattern=r"^(private_person|fop|business)$")
    api_token: str = Field(..., min_length=1)

    # PrivatePerson fields
    first_name: str = ""
    last_name: str = ""
    middle_name: str = ""

    # Organization fields
    organization_name: str = ""
    edrpou: str = ""

    # Common fields
    phone: str = ""
    email: str = ""

    # Auto-generated on backend
    name: Optional[str] = None
    contact_name: Optional[str] = None

    counterparty_ref: str = ""
    contact_ref: str = ""
    address_ref: str = ""
    city_ref: str = ""
    city_label: str = ""
    address_label: str = ""

    is_active: bool = True
    is_default: bool = False
    raw_meta: dict = {}


class NovaPoshtaSenderProfileUpdate(BaseModel):
    """Update an existing NP sender profile. All fields optional."""
    sender_type: Optional[str] = None
    api_token: Optional[str] = None

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None

    organization_name: Optional[str] = None
    edrpou: Optional[str] = None

    phone: Optional[str] = None
    email: Optional[str] = None

    name: Optional[str] = None
    contact_name: Optional[str] = None

    counterparty_ref: Optional[str] = None
    contact_ref: Optional[str] = None
    address_ref: Optional[str] = None
    city_ref: Optional[str] = None
    city_label: Optional[str] = None
    address_label: Optional[str] = None

    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    raw_meta: Optional[dict] = None


class NovaPoshtaSenderProfileResponse(BaseModel):
    """Full sender profile returned to frontend."""
    id: int
    name: str
    sender_type: str
    api_token_masked: str

    counterparty_ref: str
    contact_ref: str
    address_ref: str
    city_ref: str
    city_label: str
    address_label: str

    first_name: str
    last_name: str
    middle_name: str
    phone: str
    email: str
    contact_name: str
    organization_name: str
    edrpou: str

    is_active: bool
    is_default: bool

    last_validated_at: Optional[datetime] = None
    last_validation_ok: bool = False
    last_validation_message: str = ""
    last_validation_payload: dict = {}
    raw_meta: dict = {}

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class NovaPoshtaSenderProfileValidateResult(BaseModel):
    """Result of validating a sender profile against NP API."""
    success: bool
    message: str = ""
    counterparty_ref: str = ""
    contact_ref: str = ""
    address_ref: str = ""
    city_ref: str = ""
    city_label: str = ""
    address_label: str = ""


class NovaPoshtaSenderFetchFromToken(BaseModel):
    """Fetch sender counterparty data from NP API using a raw token."""
    api_token: str = Field(..., min_length=1)


class NovaPoshtaFetchFromTokenResult(BaseModel):
    """Result of fetching sender data from NP API by token."""
    success: bool
    message: str = ""
    first_name: str = ""
    last_name: str = ""
    middle_name: str = ""
    phone: str = ""
    email: str = ""
    counterparty_type: str = ""  # "PrivatePerson" | "Organization"
    counterparty_ref: str = ""
    contact_ref: str = ""
    city_ref: str = ""
    city_label: str = ""
    address_label: str = ""
    edrpou: str = ""
    ownership_form_description: str = ""
    description: str = ""  # Full name or company name from NP "Description"


# ═══════════════════════════════════════════════════════════════════════════════
# Lookups
# ═══════════════════════════════════════════════════════════════════════════════

class NovaPoshtaLookupQuery(BaseModel):
    """Base query for NP reference lookups."""
    sender_profile_id: Optional[int] = None
    query: str = ""
    locale: str = "uk"


class NovaPoshtaStreetLookupQuery(NovaPoshtaLookupQuery):
    """Street search query."""
    settlement_ref: str = ""


class NovaPoshtaWarehouseLookupQuery(NovaPoshtaLookupQuery):
    """Warehouse search query."""
    city_ref: str = ""
    warehouse_type_ref: Optional[str] = None


class NovaPoshtaCounterpartyLookupQuery(NovaPoshtaLookupQuery):
    """Counterparty search query."""
    counterparty_property: str = "Recipient"


class NovaPoshtaCounterpartyDetailsQuery(BaseModel):
    """Query for counterparty details."""
    sender_profile_id: Optional[int] = None
    counterparty_ref: str
    counterparty_property: str = "Recipient"
    locale: str = "uk"


class NovaPoshtaPackListLookupQuery(BaseModel):
    """Packaging types query."""
    sender_profile_id: Optional[int] = None
    length_mm: int = 0
    width_mm: int = 0
    height_mm: int = 0
    locale: str = "uk"


class NovaPoshtaTimeIntervalsLookupQuery(BaseModel):
    """Time intervals query."""
    sender_profile_id: Optional[int] = None
    recipient_city_ref: str = ""
    date_time: str = ""
    locale: str = "uk"


class NovaPoshtaDeliveryDateLookupQuery(BaseModel):
    """Delivery date query."""
    sender_profile_id: Optional[int] = None
    recipient_city_ref: str = ""
    delivery_type: str = "warehouse"
    date_time: str = ""
    locale: str = "uk"


# ─── Lookup Response Types ───────────────────────────────────────────────────

class NovaPoshtaLookupSettlement(BaseModel):
    ref: str = ""
    delivery_city_ref: str = ""
    settlement_ref: str = ""
    label: str = ""
    main_description: str = ""
    area: str = ""
    region: str = ""
    address_delivery_allowed: bool = False
    streets_available: bool = False
    warehouses_count: str = "0"
    locale: str = ""


class NovaPoshtaLookupStreet(BaseModel):
    settlement_ref: str = ""
    street_ref: str = ""
    label: str = ""
    street_name: str = ""
    street_type: str = ""


class NovaPoshtaLookupWarehouse(BaseModel):
    ref: str = ""
    number: str = ""
    city_ref: str = ""
    type: str = ""
    category: str = ""
    label: str = ""
    description: str = ""
    full_description: str = ""
    post_finance: bool = False


class NovaPoshtaLookupPackaging(BaseModel):
    ref: str = ""
    label: str = ""
    description: str = ""
    length_mm: str = "0"
    width_mm: str = "0"
    height_mm: str = "0"
    cost: str = "0"


class NovaPoshtaLookupTimeInterval(BaseModel):
    number: str = ""
    start: str = ""
    end: str = ""
    label: str = ""


class NovaPoshtaLookupDeliveryDate(BaseModel):
    date: str = ""
    raw_datetime: str = ""


class NovaPoshtaLookupCounterparty(BaseModel):
    ref: str = ""
    counterparty_ref: str = ""
    city_ref: str = ""
    city_label: str = ""
    label: str = ""
    full_name: str = ""
    first_name: str = ""
    last_name: str = ""
    middle_name: str = ""
    phone: str = ""
    address: str = ""
    edrpou: str = ""
    counterparty_type: str = ""
    counterparty_property: str = ""


class NovaPoshtaCounterpartyDetails(BaseModel):
    contact_ref: str = ""
    contact_name: str = ""
    phone: str = ""
    city_ref: str = ""
    city_label: str = ""
    address_ref: str = ""
    address_label: str = ""


class NovaPoshtaCounterpartyAddress(BaseModel):
    """A single address of a counterparty from NP API."""
    ref: str = ""
    description: str = ""
    city_ref: str = ""
    city_description: str = ""
    street_ref: str = ""
    street_name: str = ""
    building_number: str = ""
    flat: str = ""


class NovaPoshtaServiceItem(BaseModel):
    """Additional service item from NP API."""
    ref: str = ""
    description: str = ""
    description_ru: str = ""
    code: str = ""
    price: str = "0"


class NovaPoshtaServiceLookupQuery(BaseModel):
    """Additional services query."""
    sender_profile_id: Optional[int] = None


# ═══════════════════════════════════════════════════════════════════════════════
# Price calculation
# ═══════════════════════════════════════════════════════════════════════════════

class NovaPoshtaPriceRequest(BaseModel):
    """Request to calculate delivery price via InternetDocument/getDocumentPrice."""
    sender_profile_id: int
    city_sender_ref: str = ""
    city_recipient_ref: str = ""
    weight: str = "0.1"
    service_type: str = "WarehouseWarehouse"
    cost: str = "0"
    cargo_type: str = "Cargo"
    seats_amount: int = 1
    afterpayment_amount: Optional[str] = None
    pack_ref: Optional[str] = None
    pack_count: Optional[int] = None
    volumetric_width: Optional[str] = None
    volumetric_length: Optional[str] = None
    volumetric_height: Optional[str] = None


class NovaPoshtaPriceResponse(BaseModel):
    """Price calculation result from NP API."""
    delivery_cost: str = "0"
    packaging_cost: str = "0"
    redelivery_cost: str = "0"
    assessed_cost: str = "0"


# ═══════════════════════════════════════════════════════════════════════════════
# Waybills (TTN)
# ═══════════════════════════════════════════════════════════════════════════════

class WaybillSeatOptionPayload(BaseModel):
    description: Optional[str] = None
    cost: Optional[str] = None
    weight: Optional[str] = None
    pack_ref: Optional[str] = None
    pack_refs: Optional[List[str]] = None
    volumetric_width: Optional[str] = None
    volumetric_length: Optional[str] = None
    volumetric_height: Optional[str] = None
    volumetric_volume: Optional[str] = None
    cargo_type: Optional[str] = None
    special_cargo: Optional[bool] = None


class OrderNovaPoshtaWaybillUpsert(BaseModel):
    """Create or update a waybill (TTN)."""
    sender_profile_id: int
    delivery_type: str = Field(..., pattern=r"^(warehouse|postomat|address)$")
    payer_type: str = "Recipient"
    payment_method: str = "Cash"
    cargo_type: str = "Cargo"

    description: str = ""

    sender_address_ref: Optional[str] = None

    recipient_city_ref: str
    recipient_city_label: str = ""
    recipient_address_ref: str
    recipient_address_label: str = ""
    recipient_counterparty_ref: Optional[str] = None
    recipient_contact_ref: Optional[str] = None
    third_person_ref: Optional[str] = None
    recipient_name: str
    recipient_first_name: Optional[str] = None
    recipient_last_name: Optional[str] = None
    recipient_middle_name: Optional[str] = None
    recipient_phone: str
    recipient_street_ref: Optional[str] = None
    recipient_street_label: Optional[str] = None
    recipient_house: Optional[str] = None
    recipient_apartment: Optional[str] = None

    seats_amount: int = 1
    weight: str = "1"
    volume_general: Optional[str] = None
    pack_ref: Optional[str] = None
    pack_refs: Optional[List[str]] = None
    volumetric_width: Optional[str] = None
    volumetric_length: Optional[str] = None
    volumetric_height: Optional[str] = None
    cost: str = "0"
    afterpayment_amount: Optional[str] = None

    saturday_delivery: bool = False
    local_express: bool = False
    preferred_delivery_date: Optional[str] = None
    time_interval: Optional[str] = None
    info_reg_client_barcodes: Optional[str] = None
    accompanying_documents: Optional[str] = None
    red_box_barcode: Optional[str] = None
    number_of_floors_lifting: Optional[str] = None
    number_of_floors_descent: Optional[str] = None
    forwarding_count: Optional[str] = None
    delivery_by_hand: bool = False
    delivery_by_hand_recipients: Optional[str] = None
    special_cargo: bool = False
    packing_number: Optional[str] = None
    additional_information: Optional[str] = None

    options_seat: Optional[List[WaybillSeatOptionPayload]] = None

    # New unified services approach
    service_refs: List[str] = []
    service_params: Optional[dict] = None


class WaybillSeatOption(BaseModel):
    description: str = ""
    cost: str = ""
    weight: str = ""
    pack_ref: str = ""
    pack_refs: List[str] = []
    volumetric_width: str = ""
    volumetric_length: str = ""
    volumetric_height: str = ""
    volumetric_volume: str = ""
    cargo_type: str = ""
    special_cargo: bool = False


class StaffActor(BaseModel):
    user_id: Optional[int] = None
    full_name: str = ""
    role_code: str = ""


class WaybillTrackingEvent(BaseModel):
    id: int
    event_type: str
    status_code: str
    status_text: str
    location: str
    warehouse: str
    note: str
    comment: str
    event_at: str
    synced_at: str


class OrderNovaPoshtaWaybillResponse(BaseModel):
    id: int
    order_id: int
    sender_profile_id: int
    sender_profile_name: str = ""
    sender_profile_type: str = ""
    np_ref: str = ""
    np_number: str = ""
    status_code: str = ""
    status_text: str = ""
    status_synced_at: Optional[datetime] = None
    payer_type: str = ""
    payment_method: str = ""
    service_type: str = ""
    cargo_type: str = ""
    cost: str = "0"
    weight: str = "0"
    seats_amount: int = 1
    afterpayment_amount: Optional[str] = None
    recipient_city_ref: str = ""
    recipient_city_label: str = ""
    recipient_address_ref: str = ""
    recipient_address_label: str = ""
    recipient_counterparty_ref: str = ""
    recipient_contact_ref: str = ""
    third_person_ref: str = ""
    recipient_name: str = ""
    recipient_first_name: str = ""
    recipient_last_name: str = ""
    recipient_middle_name: str = ""
    recipient_phone: str = ""
    recipient_street_ref: str = ""
    recipient_street_label: str = ""
    recipient_house: str = ""
    recipient_apartment: str = ""
    description_snapshot: str = ""
    additional_information_snapshot: str = ""
    info_reg_client_barcodes: Optional[str] = None
    saturday_delivery: Optional[bool] = None
    local_express: Optional[bool] = None
    delivery_by_hand: Optional[bool] = None
    delivery_by_hand_recipients: Optional[str] = None
    special_cargo: Optional[bool] = None
    preferred_delivery_date: Optional[str] = None
    time_interval: Optional[str] = None
    accompanying_documents: Optional[str] = None
    red_box_barcode: Optional[str] = None
    number_of_floors_lifting: Optional[str] = None
    number_of_floors_descent: Optional[str] = None
    forwarding_count: Optional[str] = None
    packing_number: str = ""
    additional_information: str = ""
    error_codes: List[str] = []
    warning_codes: List[str] = []
    info_codes: List[str] = []
    can_edit: bool = True
    last_sync_error: str = ""
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    last_actor: Optional[StaffActor] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    events_count: int = 0
    options_seat: List[WaybillSeatOption] = []
    tracking_events: List[WaybillTrackingEvent] = []

    # New unified services approach
    service_refs: List[str] = []
    service_params: Optional[dict] = None


class OrderRecipientInfo(BaseModel):
    """Customer data from the Order model, used to pre-fill recipient fields."""
    full_name: str = ""
    phone: str = ""
    first_name: str = ""
    last_name: str = ""
    middle_name: str = ""


class NovaPoshtaWaybillSummary(BaseModel):
    exists: bool = False
    is_deleted: bool = False
    np_number: str = ""
    status_code: str = ""
    status_text: str = ""
    has_sync_error: bool = False


class OrderNovaPoshtaWaybillDetailResponse(BaseModel):
    waybill: Optional[OrderNovaPoshtaWaybillResponse] = None
    summary: NovaPoshtaWaybillSummary = NovaPoshtaWaybillSummary()
    recipient_from_order: Optional[OrderRecipientInfo] = None


class WaybillEventResponse(BaseModel):
    id: int
    waybill_id: int
    event_type: str
    message: str = ""
    status_code: str = ""
    status_text: str = ""
    payload: dict = {}
    errors: List[str] = []
    warnings: List[str] = []
    info: List[str] = []
    created_by_name: str = ""
    created_by_group: str = ""
    created_at: Optional[datetime] = None


class PrintResult(BaseModel):
    url: str = ""
    content_type: str = ""
