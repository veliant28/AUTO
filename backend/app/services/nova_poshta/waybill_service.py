"""
Service for managing Nova Poshta waybills (TTN).

Handles CRUD operations via NP API, event logging, printing, and
tracking sync. Works together with NovaPoshtaApiClient.
"""
import logging
from typing import Optional, List, Tuple
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func

from app.models.nova_poshta import (
    NovaPoshtaSenderProfile,
    OrderNovaPoshtaWaybill,
    OrderNovaPoshtaWaybillEvent,
)
from app.schemas.nova_poshta_schemas import (
    OrderNovaPoshtaWaybillUpsert,
    OrderNovaPoshtaWaybillResponse,
    OrderNovaPoshtaWaybillDetailResponse,
    OrderRecipientInfo,
    NovaPoshtaWaybillSummary,
    WaybillEventResponse,
    WaybillTrackingEvent,
    WaybillSeatOption,
    StaffActor,
    PrintResult,
)
from app.models import Order
from app.services.nova_poshta.client import NovaPoshtaApiClient
from app.services.nova_poshta.lookup_service import NovaPoshtaLookupService
from app.services.nova_poshta.sender_service import NovaPoshtaSenderService
from app.services.nova_poshta.waybill_payloads import NovaPoshtaWaybillPayloadBuilder
from app.services.nova_poshta.payment_rules import NovaPoshtaPaymentRuleResolver
from app.services.nova_poshta.error_mapper import NovaPoshtaErrorMapper
from app.services.nova_poshta.errors import (
    NovaPoshtaWaybillNotFoundError,
    NovaPoshtaSenderNotFoundError,
    NovaPoshtaApiError,
    NovaPoshtaValidationError,
)

logger = logging.getLogger(__name__)


class NovaPoshtaWaybillService:
    """CRUD, sync, print and event tracking for NP waybills."""

    def __init__(self, db: Session):
        self.db = db
        self.sender_service = NovaPoshtaSenderService(db)
        self.payload_builder = NovaPoshtaWaybillPayloadBuilder()

    # ─── Queries ──────────────────────────────────────────────────────────────

    def get_waybill(self, waybill_id: int) -> OrderNovaPoshtaWaybill:
        """Get waybill by ID or raise."""
        wb = self.db.get(OrderNovaPoshtaWaybill, waybill_id)
        if not wb:
            raise NovaPoshtaWaybillNotFoundError(f"Waybill {waybill_id} not found")
        return wb

    def get_order_waybill(self, order_id: int) -> Optional[OrderNovaPoshtaWaybill]:
        """Get the active (non-deleted) waybill for an order."""
        stmt = (
            select(OrderNovaPoshtaWaybill)
            .where(
                OrderNovaPoshtaWaybill.order_id == order_id,
                OrderNovaPoshtaWaybill.is_deleted == False,
            )
            .order_by(OrderNovaPoshtaWaybill.created_at.desc())
            .limit(1)
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def get_order_summary(self, order_id: int) -> NovaPoshtaWaybillSummary:
        """Get lightweight summary of waybill status for an order."""
        wb = self.get_order_waybill(order_id)
        if not wb:
            return NovaPoshtaWaybillSummary(exists=False)
        return NovaPoshtaWaybillSummary(
            exists=True,
            is_deleted=wb.is_deleted,
            np_number=wb.np_number,
            status_code=wb.status_code,
            status_text=wb.status_text,
            has_sync_error=bool(wb.last_sync_error),
        )

    def get_order_waybill_detail(self, order_id: int) -> OrderNovaPoshtaWaybillDetailResponse:
        """Get full waybill detail for an order, including tracking events."""
        wb = self.get_order_waybill(order_id)
        summary = NovaPoshtaWaybillSummary(exists=False)

        # Fetch order data to pre-fill recipient fields
        order = self.db.get(Order, order_id)
        recipient_from_order = None
        if order:
            recipient_from_order = OrderRecipientInfo(
                full_name=order.full_name or "",
                phone=order.phone or "",
                first_name=order.first_name or "",
                last_name=order.last_name or "",
                middle_name=order.middle_name or "",
            )

        if not wb:
            return OrderNovaPoshtaWaybillDetailResponse(
                waybill=None,
                summary=summary,
                recipient_from_order=recipient_from_order,
            )

        return OrderNovaPoshtaWaybillDetailResponse(
            waybill=self._waybill_to_response(wb),
            summary=self.get_order_summary(order_id),
            recipient_from_order=recipient_from_order,
        )

    def list_events(self, waybill_id: int) -> List[OrderNovaPoshtaWaybillEvent]:
        """Get all events for a waybill, newest first."""
        stmt = (
            select(OrderNovaPoshtaWaybillEvent)
            .where(OrderNovaPoshtaWaybillEvent.waybill_id == waybill_id)
            .order_by(OrderNovaPoshtaWaybillEvent.created_at.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    # ─── Counterparty auto-creation ─────────────────────────────────────────

    async def _ensure_counterparty(
        self,
        data: OrderNovaPoshtaWaybillUpsert,
        sender_profile_id: int,
    ) -> None:
        """
        If no counterparty ref is set, auto-create a PrivatePerson/Recipient
        via NP API and update data in-place.
        """
        if data.recipient_counterparty_ref:
            return  # already selected

        # Parse name parts: prefer parsed fields, fall back to full name
        first_name = data.recipient_first_name or ""
        middle_name = data.recipient_middle_name or ""
        last_name = data.recipient_last_name or ""
        if not last_name and data.recipient_name:
            parts = data.recipient_name.strip().split(None, 2)
            last_name = parts[0] if len(parts) > 0 else ""
            first_name = parts[1] if len(parts) > 1 else ""
            middle_name = parts[2] if len(parts) > 2 else ""

        if not last_name or not first_name or not data.recipient_phone:
            logger.warning(
                "_ensure_counterparty: insufficient recipient data — "
                "last=%r first=%r phone=%r",
                last_name, first_name, data.recipient_phone,
            )
            return

        lookup = NovaPoshtaLookupService(self.db)
        result = await lookup.create_counterparty(
            sender_profile_id=sender_profile_id,
            first_name=first_name,
            middle_name=middle_name,
            last_name=last_name,
            phone=data.recipient_phone,
        )
        if result:
            counterparty_ref, contact_ref = result
            data.recipient_counterparty_ref = counterparty_ref
            data.recipient_contact_ref = contact_ref
            logger.info(
                "Auto-created counterparty ref=%s contact=%s for %s %s",
                counterparty_ref, contact_ref, last_name, first_name,
            )

    # ─── Create ───────────────────────────────────────────────────────────────

    async def create_waybill(
        self,
        order_id: int,
        data: OrderNovaPoshtaWaybillUpsert,
        user_id: Optional[int] = None,
    ) -> OrderNovaPoshtaWaybill:
        """
        Create a new waybill (TTN) via NP API and persist locally.

        Steps:
        1. Validate and resolve sender
        2. Check delivery feasibility via checkPossibilityCreateDocument
        3. Call NP InternetDocument/save
        4. Persist waybill + log event
        """
        sender = self.sender_service.get_by_id(data.sender_profile_id)
        if not sender.is_active:
            raise NovaPoshtaValidationError(f"Відправник '{sender.name}' деактивовано")

        # Build API client with sender's token
        client = NovaPoshtaApiClient(sender.api_token)

        # Auto-create counterparty if not selected by user
        await self._ensure_counterparty(data, sender.id)

        # Build payload
        payload = self.payload_builder.build_save_payload(
            data, sender,
            recipient_counterparty_ref=data.recipient_counterparty_ref or "",
            recipient_contact_ref=data.recipient_contact_ref or "",
        )

        # Optionally check possibility first (catch errors early)
        try:
            check_payload = self.payload_builder.build_check_possible_payload(data, sender)
            await client.call("InternetDocument", "checkPossibilityCreateDocument", check_payload)
        except NovaPoshtaApiError:
            # Non-fatal — NP allows creation even if check fails in some cases
            logger.warning("checkPossibilityCreateDocument failed, proceeding anyway")

        # Call NP API to create the document
        try:
            response = await client.save("InternetDocument", payload)
        except NovaPoshtaApiError as e:
            # Log the error event
            self._log_event(
                order_id=order_id,
                waybill_id=0,
                event_type=OrderNovaPoshtaWaybillEvent.EVENT_ERROR,
                message=e.message or "Помилка створення TTN",
                errors=[],
                error_codes=e.errors or [],
                user_id=user_id,
            )
            raise

        # Parse response
        data_list = response.get("data", [])
        if not data_list:
            raise NovaPoshtaApiError(
                message="NP API повернув порожню відповідь при створенні TTN",
                errors=[],
            )

        np_data = data_list[0]
        np_ref = np_data.get("Ref", "")
        np_number = np_data.get("IntDocNumber", "") or np_data.get("Number", "")

        # Persist waybill
        wb = OrderNovaPoshtaWaybill(
            order_id=order_id,
            sender_profile_id=sender.id,
            np_ref=np_ref,
            np_number=np_number,
            status_code=np_data.get("StatusCode", "1"),
            status_text=np_data.get("Status", ""),
            status_synced_at=datetime.utcnow(),
            payer_type=data.payer_type or "Recipient",
            payment_method=data.payment_method or "Cash",
            service_type=self._delivery_type_to_np(data.delivery_type),
            cargo_type=data.cargo_type or "Parcel",
            cost=Decimal(str(data.cost or "0")),
            weight=Decimal(str(data.weight or "0.001")),
            seats_amount=data.seats_amount or 1,
            afterpayment_amount=Decimal(str(data.afterpayment_amount)) if data.afterpayment_amount else None,
            recipient_city_ref=data.recipient_city_ref,
            recipient_city_label=data.recipient_city_label,
            recipient_address_ref=data.recipient_address_ref,
            recipient_address_label=data.recipient_address_label,
            recipient_counterparty_ref=data.recipient_counterparty_ref,
            recipient_contact_ref=data.recipient_contact_ref,
            recipient_name=data.recipient_name,
            recipient_phone=data.recipient_phone,
            recipient_street_ref=data.recipient_street_ref or "",
            recipient_street_label=data.recipient_street_label or "",
            recipient_house=data.recipient_house or "",
            recipient_apartment=data.recipient_apartment or "",
            description_snapshot=data.description or "",
            service_params=data.service_params or {},
            raw_request_json=payload,
            raw_response_json=np_data,
            created_by_id=user_id,
        )
        self.db.add(wb)
        self.db.flush()

        # Log create event
        self._log_event(
            order_id=order_id,
            waybill_id=wb.id,
            event_type=OrderNovaPoshtaWaybillEvent.EVENT_CREATE,
            message=f"TTN {np_number} створено",
            status_code=np_data.get("StatusCode", "1"),
            status_text=np_data.get("Status", ""),
            payload=payload,
            raw_response=np_data,
            user_id=user_id,
        )

        logger.info("Created NP waybill id=%d order=%d ttn=%s", wb.id, order_id, np_number)
        return wb

    # ─── Update ───────────────────────────────────────────────────────────────

    async def update_waybill(
        self,
        waybill_id: int,
        data: OrderNovaPoshtaWaybillUpsert,
        user_id: Optional[int] = None,
    ) -> OrderNovaPoshtaWaybill:
        """Update an existing waybill via NP API and persist changes."""
        wb = self.get_waybill(waybill_id)
        if wb.is_deleted:
            raise NovaPoshtaValidationError("TTN видалено, редагування неможливе")
        if not wb.can_edit:
            raise NovaPoshtaValidationError("TTN не можна редагувати в поточному статусі")

        sender = self.sender_service.get_by_id(data.sender_profile_id)
        client = NovaPoshtaApiClient(sender.api_token)

        # Auto-create counterparty if not selected by user
        await self._ensure_counterparty(data, sender.id)

        payload = self.payload_builder.build_update_payload(
            data, wb.np_ref, sender,
            recipient_counterparty_ref=data.recipient_counterparty_ref or "",
            recipient_contact_ref=data.recipient_contact_ref or "",
        )

        try:
            response = await client.update("InternetDocument", payload)
        except NovaPoshtaApiError as e:
            self._log_event(
                order_id=wb.order_id,
                waybill_id=wb.id,
                event_type=OrderNovaPoshtaWaybillEvent.EVENT_ERROR,
                message=e.message or "Помилка оновлення TTN",
                errors=[],
                error_codes=e.errors or [],
                user_id=user_id,
            )
            raise

        # Update local record
        data_list = response.get("data", [])
        if data_list:
            np_data = data_list[0]
            wb.np_ref = np_data.get("Ref", wb.np_ref)
            wb.np_number = np_data.get("IntDocNumber", "") or np_data.get("Number", wb.np_number)
            wb.status_code = np_data.get("StatusCode", wb.status_code)
            wb.status_text = np_data.get("Status", wb.status_text)

        # Update editable fields from request
        wb.payer_type = data.payer_type or wb.payer_type
        wb.payment_method = data.payment_method or wb.payment_method
        wb.cargo_type = data.cargo_type or wb.cargo_type
        wb.cost = Decimal(str(data.cost)) if data.cost else wb.cost
        wb.weight = Decimal(str(data.weight)) if data.weight else wb.weight
        wb.seats_amount = data.seats_amount or wb.seats_amount
        wb.afterpayment_amount = Decimal(str(data.afterpayment_amount)) if data.afterpayment_amount else wb.afterpayment_amount
        wb.recipient_city_ref = data.recipient_city_ref or wb.recipient_city_ref
        wb.recipient_city_label = data.recipient_city_label or wb.recipient_city_label
        wb.recipient_address_ref = data.recipient_address_ref or wb.recipient_address_ref
        wb.recipient_address_label = data.recipient_address_label or wb.recipient_address_label
        wb.recipient_name = data.recipient_name or wb.recipient_name
        wb.recipient_phone = data.recipient_phone or wb.recipient_phone
        wb.description_snapshot = data.description or wb.description_snapshot
        wb.service_params = data.service_params or {}
        wb.updated_by_id = user_id
        wb.updated_at = datetime.utcnow()
        wb.raw_request_json = payload
        if data_list:
            wb.raw_response_json = data_list[0]

        self.db.flush()

        self._log_event(
            order_id=wb.order_id,
            waybill_id=wb.id,
            event_type=OrderNovaPoshtaWaybillEvent.EVENT_UPDATE,
            message=f"TTN {wb.np_number} оновлено",
            payload=payload,
            raw_response=response,
            user_id=user_id,
        )

        logger.info("Updated NP waybill id=%d ttn=%s", wb.id, wb.np_number)
        return wb

    # ─── Delete ───────────────────────────────────────────────────────────────

    async def delete_waybill(
        self,
        waybill_id: int,
        user_id: Optional[int] = None,
    ) -> None:
        """Delete a waybill via NP API and mark as deleted locally."""
        wb = self.get_waybill(waybill_id)
        if wb.is_deleted:
            raise NovaPoshtaValidationError("TTN вже видалено")

        sender = self.sender_service.get_by_id(wb.sender_profile_id)
        client = NovaPoshtaApiClient(sender.api_token)

        payload = self.payload_builder.build_delete_payload([wb.np_ref])

        try:
            await client.delete("InternetDocument", payload)
        except NovaPoshtaApiError as e:
            self._log_event(
                order_id=wb.order_id,
                waybill_id=wb.id,
                event_type=OrderNovaPoshtaWaybillEvent.EVENT_ERROR,
                message=e.message or "Помилка видалення TTN",
                errors=[],
                error_codes=e.errors or [],
                user_id=user_id,
            )
            raise

        # Soft delete locally
        wb.mark_deleted()
        wb.updated_by_id = user_id
        wb.updated_at = datetime.utcnow()
        self.db.flush()

        self._log_event(
            order_id=wb.order_id,
            waybill_id=wb.id,
            event_type=OrderNovaPoshtaWaybillEvent.EVENT_DELETE,
            message=f"TTN {wb.np_number} видалено",
            user_id=user_id,
        )

        logger.info("Deleted NP waybill id=%d ttn=%s", wb.id, wb.np_number)

    # ─── Sync tracking status ─────────────────────────────────────────────────

    async def sync_tracking_status(
        self,
        waybill_id: Optional[int] = None,
        order_id: Optional[int] = None,
    ) -> Optional[OrderNovaPoshtaWaybill]:
        """
        Sync a waybill's tracking status from NP API.

        Call with waybill_id OR order_id.
        Returns the updated waybill or None if no active waybill found.
        """
        wb: Optional[OrderNovaPoshtaWaybill] = None
        if waybill_id:
            wb = self.get_waybill(waybill_id)
        elif order_id:
            wb = self.get_order_waybill(order_id)

        if not wb or wb.is_deleted:
            return None

        if not wb.np_ref:
            return None

        sender = self.sender_service.get_by_id(wb.sender_profile_id)
        client = NovaPoshtaApiClient(sender.api_token)

        try:
            response = await client.get_status({
                "Documents": [{"DocumentNumber": wb.np_number}],
            })
        except NovaPoshtaApiError as e:
            wb.last_sync_error = e.message
            wb.status_synced_at = datetime.utcnow()
            self.db.flush()

            self._log_event(
                order_id=wb.order_id,
                waybill_id=wb.id,
                event_type=OrderNovaPoshtaWaybillEvent.EVENT_SYNC,
                message=f"Помилка синхронізації: {e.message}",
                errors=e.errors or [],
                error_codes=[],
                user_id=None,
            )
            return wb

        # Update tracking data
        data_list = response.get("data", [])
        if data_list:
            tracking = data_list[0]
            old_status = wb.status_code
            wb.status_code = tracking.get("StatusCode", wb.status_code)
            wb.status_text = tracking.get("Status", wb.status_text)
            wb.raw_last_tracking_json = tracking

            if wb.status_code != old_status:
                self._log_event(
                    order_id=wb.order_id,
                    waybill_id=wb.id,
                    event_type=OrderNovaPoshtaWaybillEvent.EVENT_SYNC,
                    message=f"Статус оновлено: {wb.status_text or NovaPoshtaWaybillService._status_label(wb.status_code)}",
                    status_code=wb.status_code,
                    status_text=wb.status_text,
                    raw_response=tracking,
                    user_id=None,
                )

        wb.last_sync_error = ""
        wb.status_synced_at = datetime.utcnow()
        self.db.flush()

        return wb

    # ─── Print ─────────────────────────────────────────────────────────────────

    async def print_waybill(
        self,
        waybill_id: int,
        document_type: str = "html",
        user_id: Optional[int] = None,
    ) -> PrintResult:
        """Generate a printable document for a waybill."""
        wb = self.get_waybill(waybill_id)
        if wb.is_deleted:
            raise NovaPoshtaValidationError("TTN видалено, друк неможливий")

        if not wb.np_ref:
            # Use the number instead if ref is missing
            raise NovaPoshtaValidationError("Ref відсутній для друку")

        sender = self.sender_service.get_by_id(wb.sender_profile_id)
        client = NovaPoshtaApiClient(sender.api_token)

        payload = self.payload_builder.build_print_payload([wb.np_ref], document_type)

        try:
            response = await client.call("InternetDocument", "generateReport", payload)
        except NovaPoshtaApiError as e:
            self._log_event(
                order_id=wb.order_id,
                waybill_id=wb.id,
                event_type=OrderNovaPoshtaWaybillEvent.EVENT_ERROR,
                message=e.message or "Помилка друку TTN",
                user_id=user_id,
            )
            raise

        data_list = response.get("data", [])
        url = ""
        if data_list and isinstance(data_list[0], dict):
            url = data_list[0].get("DocumentRef", "") or data_list[0].get("Url", "")

        # Also check for direct URL reference
        if not url:
            url = response.get("info", "") or ""

        # Update print URLs on waybill
        if document_type == "html" and url:
            wb.print_url_html = url
        elif document_type == "pdf" and url:
            wb.print_url_pdf = url

        self.db.flush()

        self._log_event(
            order_id=wb.order_id,
            waybill_id=wb.id,
            event_type=OrderNovaPoshtaWaybillEvent.EVENT_PRINT,
            message=f"Друк TTN {wb.np_number}",
            user_id=user_id,
        )

        content_type = "application/pdf" if document_type == "pdf" else "text/html"
        return PrintResult(url=url, content_type=content_type)

    # ─── Tracking events ──────────────────────────────────────────────────────

    def get_tracking_events(self, waybill_id: int) -> List[WaybillTrackingEvent]:
        """Get tracking events from raw tracking JSON for display."""
        wb = self.get_waybill(waybill_id)
        tracking = wb.raw_last_tracking_json or {}
        events = []

        # NP returns status documents array
        documents = tracking.get("StatusDocuments", [])
        if not documents and tracking.get("data"):
            documents = tracking["data"]

        if isinstance(documents, list):
            for doc in documents:
                event = WaybillTrackingEvent(
                    id=0,
                    status_code=doc.get("StatusCode", ""),
                    status_text=doc.get("Status", ""),
                    location=doc.get("CityRecipient", "") or doc.get("CitySender", ""),
                    warehouse=doc.get("WarehouseRecipient", "") or doc.get("WarehouseSender", ""),
                    note=doc.get("Note", ""),
                    comment=doc.get("Comment", ""),
                    event_at=doc.get("Date", ""),
                )
                events.append(event)

        return events

    # ─── Internal helpers ─────────────────────────────────────────────────────

    def _log_event(
        self,
        order_id: int,
        waybill_id: int,
        event_type: str,
        message: str = "",
        status_code: str = "",
        status_text: str = "",
        payload: Optional[dict] = None,
        raw_response: Optional[dict] = None,
        errors: Optional[list] = None,
        warnings: Optional[list] = None,
        info: Optional[list] = None,
        error_codes: Optional[list] = None,
        warning_codes: Optional[list] = None,
        info_codes: Optional[list] = None,
        user_id: Optional[int] = None,
    ) -> OrderNovaPoshtaWaybillEvent:
        """Create a waybill event log entry."""
        event = OrderNovaPoshtaWaybillEvent(
            waybill_id=waybill_id,
            order_id=order_id,
            event_type=event_type,
            message=message,
            status_code=status_code,
            status_text=status_text,
            payload=payload or {},
            raw_response=raw_response or {},
            errors=errors or [],
            warnings=warnings or [],
            info=info or [],
            error_codes=error_codes or [],
            warning_codes=warning_codes or [],
            info_codes=info_codes or [],
            created_by_id=user_id,
        )
        self.db.add(event)
        self.db.flush()
        return event

    def _waybill_to_response(self, wb: OrderNovaPoshtaWaybill) -> OrderNovaPoshtaWaybillResponse:
        """Convert an ORM waybill to full response schema."""
        sender = wb.sender_profile

        events = self.list_events(wb.id)
        tracking_events = self.get_tracking_events(wb.id)

        return OrderNovaPoshtaWaybillResponse(
            id=wb.id,
            order_id=wb.order_id,
            sender_profile_id=wb.sender_profile_id,
            sender_profile_name=sender.name if sender else "",
            sender_profile_type=sender.sender_type if sender else "",
            np_ref=wb.np_ref,
            np_number=wb.np_number,
            status_code=wb.status_code,
            status_text=wb.status_text,
            status_synced_at=wb.status_synced_at,
            payer_type=wb.payer_type,
            payment_method=wb.payment_method,
            service_type=wb.service_type,
            cargo_type=wb.cargo_type,
            cost=str(wb.cost),
            weight=str(wb.weight),
            seats_amount=wb.seats_amount,
            afterpayment_amount=str(wb.afterpayment_amount) if wb.afterpayment_amount else None,
            recipient_city_ref=wb.recipient_city_ref,
            recipient_city_label=wb.recipient_city_label,
            recipient_address_ref=wb.recipient_address_ref,
            recipient_address_label=wb.recipient_address_label,
            recipient_counterparty_ref=wb.recipient_counterparty_ref,
            recipient_contact_ref=wb.recipient_contact_ref,
            recipient_name=wb.recipient_name,
            recipient_phone=wb.recipient_phone,
            recipient_street_ref=wb.recipient_street_ref,
            recipient_street_label=wb.recipient_street_label,
            recipient_house=wb.recipient_house,
            recipient_apartment=wb.recipient_apartment,
            description_snapshot=wb.description_snapshot,
            additional_information_snapshot=wb.additional_information_snapshot,
            error_codes=wb.error_codes or [],
            warning_codes=wb.warning_codes or [],
            info_codes=wb.info_codes or [],
            can_edit=wb.can_edit and not wb.is_deleted,
            last_sync_error=wb.last_sync_error or "",
            is_deleted=wb.is_deleted,
            deleted_at=wb.deleted_at,
            created_by_id=wb.created_by_id,
            updated_by_id=wb.updated_by_id,
            last_actor=self._get_actor(wb),
            created_at=wb.created_at,
            updated_at=wb.updated_at,
            events_count=len(events),
            options_seat=[],  # NP doesn't persist options_seat separately
            service_params=wb.service_params or {},
            service_refs=list((wb.service_params or {}).keys()),
            tracking_events=tracking_events,
        )

    def _get_actor(self, wb: OrderNovaPoshtaWaybill) -> Optional[StaffActor]:
        """Get the last actor (user) who modified this waybill."""
        if wb.updated_by_id:
            from app.models.base import User
            user = self.db.get(User, wb.updated_by_id)
            if user:
                return StaffActor(
                    user_id=user.id,
                    full_name=getattr(user, "full_name", "") or getattr(user, "name", "") or "",
                    role_code=getattr(user, "role_code", "") or "",
                )
        if wb.created_by_id:
            from app.models.base import User
            user = self.db.get(User, wb.created_by_id)
            if user:
                return StaffActor(
                    user_id=user.id,
                    full_name=getattr(user, "full_name", "") or getattr(user, "name", "") or "",
                    role_code=getattr(user, "role_code", "") or "",
                )
        return None

    @staticmethod
    def _status_label(status_code: str) -> str:
        """Get a human-readable status label."""
        from app.services.nova_poshta.tracking_status_catalog import NovaPoshtaTrackingStatusCatalog
        return NovaPoshtaTrackingStatusCatalog.get_label(status_code)

    @staticmethod
    def _delivery_type_to_np(delivery_type: str) -> str:
        """Map delivery type to NP service type."""
        mapping = {
            "warehouse": "WarehouseWarehouse",
            "postomat": "WarehousePostomat",
            "address": "WarehouseDoors",
        }
        return mapping.get(delivery_type, "WarehouseWarehouse")

    @staticmethod
    def _event_orm_to_response(event: OrderNovaPoshtaWaybillEvent) -> WaybillEventResponse:
        """Convert an event ORM to response schema."""
        actor_name = ""
        actor_group = ""
        if event.created_by:
            actor_name = getattr(event.created_by, "full_name", "") or getattr(event.created_by, "name", "") or ""
            actor_group = getattr(event.created_by, "role_code", "") or ""

        return WaybillEventResponse(
            id=event.id,
            waybill_id=event.waybill_id,
            event_type=event.event_type,
            message=event.message,
            status_code=event.status_code,
            status_text=event.status_text,
            payload=event.payload or {},
            errors=event.errors or [],
            warnings=event.warnings or [],
            info=event.info or [],
            created_by_name=actor_name,
            created_by_group=actor_group,
            created_at=event.created_at,
        )
