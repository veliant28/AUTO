"""
Nova Poshta admin API endpoints.

Covers:
  - Sender profile CRUD + validation
  - Online lookups (cities, streets, warehouses, counterparties, etc.)
  - Waybill CRUD + sync + print + events
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.api.v1.deps import require_role, require_permission
from app.models import User
from app.schemas.nova_poshta_schemas import (
    # Sender
    NovaPoshtaSenderProfileCreate,
    NovaPoshtaSenderProfileUpdate,
    NovaPoshtaSenderProfileResponse,
    NovaPoshtaSenderProfileValidateResult,
    NovaPoshtaSenderFetchFromToken,
    NovaPoshtaFetchFromTokenResult,
    # Lookup
    NovaPoshtaLookupQuery,
    NovaPoshtaStreetLookupQuery,
    NovaPoshtaWarehouseLookupQuery,
    NovaPoshtaCounterpartyLookupQuery,
    NovaPoshtaCounterpartyDetailsQuery,
    NovaPoshtaPackListLookupQuery,
    NovaPoshtaTimeIntervalsLookupQuery,
    NovaPoshtaDeliveryDateLookupQuery,
    NovaPoshtaLookupSettlement,
    NovaPoshtaLookupStreet,
    NovaPoshtaLookupWarehouse,
    NovaPoshtaLookupPackaging,
    NovaPoshtaLookupTimeInterval,
    NovaPoshtaLookupDeliveryDate,
    NovaPoshtaLookupCounterparty,
    NovaPoshtaCounterpartyDetails,
    NovaPoshtaCounterpartyAddress,
    NovaPoshtaServiceItem,
    NovaPoshtaServiceLookupQuery,
    # Price
    NovaPoshtaPriceRequest,
    NovaPoshtaPriceResponse,
    # Waybill
    OrderNovaPoshtaWaybillUpsert,
    OrderNovaPoshtaWaybillResponse,
    OrderNovaPoshtaWaybillDetailResponse,
    NovaPoshtaWaybillSummary,
    WaybillEventResponse,
    PrintResult,
)
from app.services.nova_poshta import (
    NovaPoshtaApiClient,
    NovaPoshtaSenderService,
    NovaPoshtaWaybillService,
    NovaPoshtaLookupService,
    NovaPoshtaTrackingService,
    NovaPoshtaErrorMapper,
    NovaPoshtaApiError,
    NovaPoshtaSenderNotFoundError,
    NovaPoshtaWaybillNotFoundError,
    NovaPoshtaValidationError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════════
# Sender Profiles
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/senders", response_model=List[NovaPoshtaSenderProfileResponse])
async def list_senders(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """List all Nova Poshta sender profiles."""
    service = NovaPoshtaSenderService(db)
    if include_inactive:
        profiles = service.list_all()
    else:
        profiles = service.list_active()

    return [
        _sender_to_response(p, service)
        for p in profiles
    ]


def _sender_to_response(p: NovaPoshtaSenderProfile, service: NovaPoshtaSenderService) -> NovaPoshtaSenderProfileResponse:
    """Map ORM profile to response schema."""
    return NovaPoshtaSenderProfileResponse(
        id=p.id,
        name=p.name,
        sender_type=p.sender_type,
        api_token_masked=service.mask_token(p.api_token),
        counterparty_ref=p.counterparty_ref or "",
        contact_ref=p.contact_ref or "",
        address_ref=p.address_ref or "",
        city_ref=p.city_ref or "",
        city_label=p.city_label or "",
        address_label=p.address_label or "",
        first_name=p.first_name or "",
        last_name=p.last_name or "",
        middle_name=p.middle_name or "",
        phone=p.phone or "",
        email=p.email or "",
        contact_name=p.contact_name or "",
        organization_name=p.organization_name or "",
        edrpou=p.edrpou or "",
        is_active=p.is_active if p.is_active is not None else True,
        is_default=p.is_default if p.is_default is not None else False,
        last_validated_at=p.last_validated_at,
        last_validation_ok=p.last_validation_ok or False,
        last_validation_message=p.last_validation_message or "",
        last_validation_payload=p.last_validation_payload or {},
        raw_meta=p.raw_meta or {},
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.post("/senders", response_model=NovaPoshtaSenderProfileResponse, status_code=201)
async def create_sender(
    data: NovaPoshtaSenderProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Create a new Nova Poshta sender profile."""
    service = NovaPoshtaSenderService(db)
    profile = service.create(data)
    db.commit()
    return _sender_to_response(profile, service)


@router.put("/senders/{sender_id}", response_model=NovaPoshtaSenderProfileResponse)
async def update_sender(
    sender_id: int,
    data: NovaPoshtaSenderProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Update a sender profile."""
    service = NovaPoshtaSenderService(db)
    try:
        profile = service.update(sender_id, data)
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))

    db.commit()
    return _sender_to_response(profile, service)


@router.delete("/senders/{sender_id}")
async def delete_sender(
    sender_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Delete (or deactivate if used in waybills) a sender profile."""
    service = NovaPoshtaSenderService(db)
    try:
        service.delete(sender_id)
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    db.commit()
    return {"message": "Відправника деактивовано"}


@router.post("/senders/{sender_id}/validate", response_model=NovaPoshtaSenderProfileValidateResult)
async def validate_sender(
    sender_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Validate a sender profile against NP API."""
    service = NovaPoshtaSenderService(db)
    try:
        result = await service.validate_profile(sender_id)
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    db.commit()
    return result


@router.post("/senders/fetch-from-token", response_model=NovaPoshtaFetchFromTokenResult)
async def fetch_sender_from_token(
    data: NovaPoshtaSenderFetchFromToken,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """Fetch sender counterparty data from NP API using a raw token.

    Used on frontend to auto-populate sender form fields after token entry.
    Does NOT persist anything.
    """
    service = NovaPoshtaSenderService(db)
    result = await service.fetch_sender_from_token(data.api_token)
    return result


@router.get("/senders/{sender_id}/addresses", response_model=List[NovaPoshtaCounterpartyAddress])
async def get_sender_addresses(
    sender_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager")),
):
    """List all addresses for a sender's counterparty from NP API.

    Used on frontend to let the user pick a different sender address
    when creating/editing a waybill.
    """
    service = NovaPoshtaSenderService(db)
    try:
        profile = service.get_by_id(sender_id)
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))

    if not profile.counterparty_ref:
        return []

    lookup = NovaPoshtaLookupService(db)
    addresses = await lookup.get_counterparty_addresses(
        sender_profile_id=sender_id,
        counterparty_ref=profile.counterparty_ref,
    )
    return addresses


# ═══════════════════════════════════════════════════════════════════════════════
# Lookups
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/lookup/settlements", response_model=List[NovaPoshtaLookupSettlement])
async def lookup_settlements(
    data: NovaPoshtaLookupQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """Search settlements (cities) by name."""
    service = NovaPoshtaLookupService(db)
    try:
        results = await service.search_settlements(
            sender_profile_id=data.sender_profile_id,
            query=data.query,
            locale=data.locale,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results


@router.post("/lookup/streets", response_model=List[NovaPoshtaLookupStreet])
async def lookup_streets(
    data: NovaPoshtaStreetLookupQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """Search streets within a settlement."""
    service = NovaPoshtaLookupService(db)
    try:
        results = await service.search_streets(
            sender_profile_id=data.sender_profile_id,
            settlement_ref=data.settlement_ref,
            query=data.query,
            locale=data.locale,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results


@router.post("/lookup/warehouses", response_model=List[NovaPoshtaLookupWarehouse])
async def lookup_warehouses(
    data: NovaPoshtaWarehouseLookupQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """Search warehouses in a city."""
    service = NovaPoshtaLookupService(db)
    try:
        results = await service.search_warehouses(
            sender_profile_id=data.sender_profile_id,
            city_ref=data.city_ref,
            query=data.query,
            warehouse_type_ref=data.warehouse_type_ref,
            locale=data.locale,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results


@router.post("/lookup/pack-types", response_model=List[NovaPoshtaLookupPackaging])
async def lookup_pack_types(
    data: NovaPoshtaPackListLookupQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """List available packaging types."""
    service = NovaPoshtaLookupService(db)
    try:
        results = await service.list_pack_types(
            sender_profile_id=data.sender_profile_id,
            length_mm=data.length_mm,
            width_mm=data.width_mm,
            height_mm=data.height_mm,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results


@router.post("/lookup/services", response_model=List[NovaPoshtaServiceItem])
async def lookup_services(
    data: NovaPoshtaServiceLookupQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """List available additional services."""
    service = NovaPoshtaLookupService(db)
    try:
        results = await service.get_service_list(
            sender_profile_id=data.sender_profile_id,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results


@router.post("/lookup/time-intervals", response_model=List[NovaPoshtaLookupTimeInterval])
async def lookup_time_intervals(
    data: NovaPoshtaTimeIntervalsLookupQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """Get delivery time intervals for a route."""
    service = NovaPoshtaLookupService(db)
    try:
        results = await service.get_time_intervals(
            sender_profile_id=data.sender_profile_id,
            recipient_city_ref=data.recipient_city_ref,
            date_time=data.date_time,
            locale=data.locale,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results


@router.post("/lookup/delivery-date", response_model=List[NovaPoshtaLookupDeliveryDate])
async def lookup_delivery_date(
    data: NovaPoshtaDeliveryDateLookupQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """Get estimated delivery date."""
    service = NovaPoshtaLookupService(db)
    try:
        results = await service.get_delivery_date(
            sender_profile_id=data.sender_profile_id,
            recipient_city_ref=data.recipient_city_ref,
            delivery_type=data.delivery_type,
            date_time=data.date_time,
            locale=data.locale,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results


@router.post("/lookup/counterparties", response_model=List[NovaPoshtaLookupCounterparty])
async def lookup_counterparties(
    data: NovaPoshtaCounterpartyLookupQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """Search counterparties (recipients/senders)."""
    service = NovaPoshtaLookupService(db)
    try:
        results = await service.search_counterparties(
            sender_profile_id=data.sender_profile_id,
            query=data.query,
            counterparty_property=data.counterparty_property,
            locale=data.locale,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))
    return results


@router.post("/lookup/counterparty-details", response_model=Optional[NovaPoshtaCounterpartyDetails])
async def lookup_counterparty_details(
    data: NovaPoshtaCounterpartyDetailsQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """Get detailed info about a counterparty."""
    service = NovaPoshtaLookupService(db)
    try:
        result = await service.get_counterparty_details(
            sender_profile_id=data.sender_profile_id,
            counterparty_ref=data.counterparty_ref,
            counterparty_property=data.counterparty_property,
            locale=data.locale,
        )
    except NovaPoshtaSenderNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))

    if not result:
        raise HTTPException(404, "Контрагента не знайдено")
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# Price calculation
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/calculate-price", response_model=NovaPoshtaPriceResponse)
async def calculate_price(
    data: NovaPoshtaPriceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "manager", "operator")),
):
    """Calculate delivery price via NP API's getDocumentPrice."""
    sender_service = NovaPoshtaSenderService(db)
    sender = sender_service.get_by_id(data.sender_profile_id)
    if not sender.is_active:
        raise HTTPException(400, "Відправника деактивовано")

    client = NovaPoshtaApiClient(sender.api_token)

    props: dict = {
        "CitySender": data.city_sender_ref,
        "CityRecipient": data.city_recipient_ref,
        "Weight": data.weight,
        "ServiceType": data.service_type,
        "Cost": data.cost,
        "CargoType": data.cargo_type,
        "SeatsAmount": str(data.seats_amount),
    }

    # Build OptionsSeat — NP API expects numeric types for these fields
    seat: dict = {
        "weight": float(data.weight),
        "volumetricWidth": float(data.volumetric_width or "1"),
        "volumetricLength": float(data.volumetric_length or "1"),
        "volumetricHeight": float(data.volumetric_height or "1"),
    }
    if data.pack_ref:
        seat["packRef"] = data.pack_ref
    props["OptionsSeat"] = [seat]

    # Afterpayment / redelivery
    if data.afterpayment_amount:
        props["RedeliveryCalculate"] = {
            "CargoType": "Money",
            "Amount": data.afterpayment_amount,
        }

    # Packaging
    if data.pack_ref:
        props["PackRef"] = data.pack_ref
        props["PackCount"] = str(data.pack_count or 1)

    logger.info("getDocumentPrice payload: %s", props)

    try:
        response = await client.call("InternetDocumentGeneral", "getDocumentPrice", props)
        logger.info("getDocumentPrice response: %s", response)
    except NovaPoshtaApiError as e:
        logger.warning("getDocumentPrice failed: %s", e)
        raise HTTPException(502, detail=str(e))

    if not response.get("data"):
        logger.warning("getDocumentPrice returned empty data — all costs zero")
        return NovaPoshtaPriceResponse()

    item = response["data"][0]
    result = NovaPoshtaPriceResponse(
        delivery_cost=str(item.get("Cost", "0") or "0"),
        packaging_cost=str(item.get("CostPack", "0") or "0"),
        redelivery_cost=str(item.get("CostRedelivery", "0") or "0"),
        assessed_cost=str(item.get("AssessedCost", "0") or "0"),
    )
    logger.info("getDocumentPrice result: %s", result.model_dump())
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# Waybills
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/orders/{order_id}/waybill", response_model=OrderNovaPoshtaWaybillDetailResponse)
async def get_order_waybill(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("novaposhta.view")),
):
    """Get waybill detail for an order (includes tracking events)."""
    service = NovaPoshtaWaybillService(db)
    return service.get_order_waybill_detail(order_id)


@router.post("/orders/{order_id}/waybill", response_model=OrderNovaPoshtaWaybillResponse, status_code=201)
async def create_waybill(
    order_id: int,
    data: OrderNovaPoshtaWaybillUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("novaposhta.create")),
):
    """Create a new waybill (TTN) for an order."""
    service = NovaPoshtaWaybillService(db)
    try:
        wb = await service.create_waybill(
            order_id=order_id,
            data=data,
            user_id=current_user.id,
        )
    except NovaPoshtaValidationError as e:
        raise HTTPException(400, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))

    db.commit()
    return service._waybill_to_response(wb)


@router.put("/waybills/{waybill_id}", response_model=OrderNovaPoshtaWaybillResponse)
async def update_waybill(
    waybill_id: int,
    data: OrderNovaPoshtaWaybillUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("novaposhta.edit")),
):
    """Update an existing waybill."""
    service = NovaPoshtaWaybillService(db)
    try:
        wb = await service.update_waybill(
            waybill_id=waybill_id,
            data=data,
            user_id=current_user.id,
        )
    except NovaPoshtaWaybillNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaValidationError as e:
        raise HTTPException(400, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))

    db.commit()
    return service._waybill_to_response(wb)


@router.delete("/waybills/{waybill_id}")
async def delete_waybill(
    waybill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("novaposhta.delete")),
):
    """Delete a waybill via NP API and soft-delete locally."""
    service = NovaPoshtaWaybillService(db)
    try:
        await service.delete_waybill(
            waybill_id=waybill_id,
            user_id=current_user.id,
        )
    except NovaPoshtaWaybillNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaValidationError as e:
        raise HTTPException(400, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))

    db.commit()
    return {"message": "TTN видалено"}


@router.post("/waybills/{waybill_id}/sync", response_model=OrderNovaPoshtaWaybillResponse)
async def sync_waybill_status(
    waybill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("novaposhta.tracking")),
):
    """Sync tracking status for a waybill from NP API."""
    service = NovaPoshtaWaybillService(db)
    try:
        wb = await service.sync_tracking_status(waybill_id=waybill_id, user_id=current_user.id)
    except NovaPoshtaWaybillNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))

    if not wb:
        raise HTTPException(404, "Waybill not found or deleted")

    db.commit()
    return service._waybill_to_response(wb)


@router.post("/orders/{order_id}/waybill/sync", response_model=OrderNovaPoshtaWaybillDetailResponse)
async def sync_order_waybill_status(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("novaposhta.tracking")),
):
    """Sync tracking status for an order's waybill."""
    service = NovaPoshtaWaybillService(db)
    try:
        wb = await service.sync_tracking_status(order_id=order_id, user_id=current_user.id)
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))

    if not wb:
        return service.get_order_waybill_detail(order_id)

    return service.get_order_waybill_detail(order_id)


@router.post("/waybills/{waybill_id}/print", response_model=PrintResult)
async def print_waybill(
    waybill_id: int,
    document_type: str = Query("ttn", regex="^(markings|ttn|html|pdf)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("novaposhta.print")),
):
    """Generate a printable document for a waybill."""
    service = NovaPoshtaWaybillService(db)
    try:
        result = await service.print_waybill(
            waybill_id=waybill_id,
            document_type=document_type,
            user_id=current_user.id,
        )
    except NovaPoshtaWaybillNotFoundError as e:
        raise HTTPException(404, str(e))
    except NovaPoshtaValidationError as e:
        raise HTTPException(400, str(e))
    except NovaPoshtaApiError as e:
        raise HTTPException(502, detail=str(e))

    if not result.url:
        raise HTTPException(502, "Не вдалося отримати посилання для друку")

    db.commit()
    return result


@router.get("/waybills/{waybill_id}/events", response_model=List[WaybillEventResponse])
async def get_waybill_events(
    waybill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("novaposhta.view")),
):
    """Get event history for a waybill."""
    service = NovaPoshtaWaybillService(db)
    try:
        events = service.list_events(waybill_id)
    except NovaPoshtaWaybillNotFoundError as e:
        raise HTTPException(404, str(e))

    return [service._event_orm_to_response(e) for e in events]


@router.get("/orders/{order_id}/waybill/summary", response_model=NovaPoshtaWaybillSummary)
async def get_order_waybill_summary(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("novaposhta.view")),
):
    """Get lightweight waybill summary for an order (used by orders list)."""
    service = NovaPoshtaWaybillService(db)
    return service.get_order_summary(order_id)


# ═══════════════════════════════════════════════════════════════════════════════
# Bulk tracking sync
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/sync-all")
async def sync_all_waybills(
    max_waybills: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("novaposhta.tracking")),
):
    """Sync tracking status for all active waybills."""
    service = NovaPoshtaTrackingService(db)
    count = await service.sync_all_active(max_waybills=max_waybills)
    return {"message": f"Синхронізовано {count} TTN", "synced_count": count}
