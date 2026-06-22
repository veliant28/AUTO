"""
Builds request payloads (methodProperties) for Nova Poshta API
InternetDocument operations.

Covers:
  - save   (create new waybill)
  - update (edit existing)
  - delete
  - getDocumentList
  - generateReport (print)
"""
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from app.schemas.nova_poshta_schemas import OrderNovaPoshtaWaybillUpsert
from app.models.nova_poshta import NovaPoshtaSenderProfile
from app.services.nova_poshta.normalizers import NovaPoshtaDataNormalizer
from app.services.nova_poshta.constants import MODEL_INTERNET_DOCUMENT

logger = logging.getLogger(__name__)


class NovaPoshtaWaybillPayloadBuilder:
    """Build NP API payloads for InternetDocument operations."""

    @staticmethod
    def build_save_payload(
        data: OrderNovaPoshtaWaybillUpsert,
        sender: NovaPoshtaSenderProfile,
        recipient_counterparty_ref: str = "",
        recipient_contact_ref: str = "",
        third_person_ref: str = "",
    ) -> dict:
        """
        Build methodProperties dict for InternetDocument/save.

        Reference: https://developers.novaposhta.ua/documentation
        """
        normalizer = NovaPoshtaDataNormalizer()

        # Sender address: use provided one, fall back to profile default
        sender_address_ref = data.sender_address_ref or sender.address_ref

        props: Dict[str, Any] = {
            # ─── Sender ─────────────────────────────────────────────────
            "SenderRef": sender.counterparty_ref,
            "SenderContactRef": sender.contact_ref,
            "SenderAddressRef": sender_address_ref,
            "SenderCityRef": sender.city_ref,
            "SenderPhone": normalizer.phone(sender.phone),

            # ─── Sender person info ────────────────────────────────────
            "SenderSurname": "",
            "SenderFirstname": "",
            "SenderMiddleName": "",
            "SenderName": sender.contact_name,
            "SenderOrganizationName": sender.organization_name,
            "SenderEDRPOU": sender.edrpou,

            # ─── Recipient ─────────────────────────────────────────────
            "RecipientCityRef": data.recipient_city_ref,
            "RecipientAddressRef": data.recipient_address_ref,
            "RecipientContactName": data.recipient_name,
            "RecipientSurname": data.recipient_last_name or "",
            "RecipientFirstname": data.recipient_first_name or "",
            "RecipientMiddleName": data.recipient_middle_name or "",
            "RecipientPhone": normalizer.phone(data.recipient_phone),

            # ─── Delivery type ─────────────────────────────────────────
            "ServiceType": NovaPoshtaWaybillPayloadBuilder._delivery_type_to_service(data.delivery_type),
            "CargoType": data.cargo_type or "Parcel",
            "DateTime": datetime.now().strftime("%d.%m.%Y"),

            # ─── Payment ───────────────────────────────────────────────
            "PaymentMethod": data.payment_method or "Cash",
            "PayerType": data.payer_type or "Recipient",
            "Cost": normalizer.cost(data.cost),
            "AfterpaymentOnGoodsCost": normalizer.cost(data.afterpayment_amount) if data.afterpayment_amount else "",

            # ─── Cargo ─────────────────────────────────────────────────
            "Weight": normalizer.weight(data.weight),
            "SeatsAmount": str(normalizer.seats_amount(data.seats_amount)),
            "Description": normalizer.description(data.description),
            "AdditionalInformation": "",

            # ─── Volume ────────────────────────────────────────────────
            "VolumeGeneral": data.volume_general or "",

            # ─── Seats ─────────────────────────────────────────────────
            "OptionsSeat": NovaPoshtaWaybillPayloadBuilder._build_options_seat(data),
        }

        # ─── Counterparty refs (if known) ────────────────────────────────
        if recipient_counterparty_ref:
            props["RecipientRef"] = recipient_counterparty_ref
        if recipient_contact_ref:
            props["RecipientContactRef"] = recipient_contact_ref

        # ─── ThirdPerson ref (if payer is ThirdPerson) ──────────────────
        if data.payer_type == "ThirdPerson" and third_person_ref:
            props["ThirdPersonRef"] = third_person_ref

        # ─── Address delivery fields ────────────────────────────────────
        if data.delivery_type == "address":
            props["RecipientHouse"] = data.recipient_house or ""
            props["RecipientApartment"] = data.recipient_apartment or ""
            props["RecipientStreetRef"] = data.recipient_street_ref or ""
            props["RecipientStreetName"] = data.recipient_street_label or ""

        # ─── Optional flags ──────────────────────────────────────────────
        if data.saturday_delivery:
            props["SaturdayDelivery"] = "1"
        if data.local_express:
            props["LocalDelivery"] = "1"
        if data.preferred_delivery_date:
            # NP API expects DD.MM.YYYY; frontend sends YYYY-MM-DD
            try:
                dt = datetime.strptime(data.preferred_delivery_date, "%Y-%m-%d")
                props["PreferredDeliveryDate"] = dt.strftime("%d.%m.%Y")
            except ValueError:
                logger.warning("Invalid preferred_delivery_date format: %s, sending as-is", data.preferred_delivery_date)
                props["PreferredDeliveryDate"] = data.preferred_delivery_date
        if data.time_interval:
            props["TimeInterval"] = data.time_interval
        if data.info_reg_client_barcodes:
            props["InfoRegClientBarcodes"] = data.info_reg_client_barcodes
        if data.accompanying_documents:
            props["AccompanyingDocuments"] = data.accompanying_documents
        if data.red_box_barcode:
            props["RedBoxBarcode"] = data.red_box_barcode
        if data.number_of_floors_lifting:
            props["NumberOfFloorsLifting"] = data.number_of_floors_lifting
        if data.number_of_floors_descent:
            props["NumberOfFloorsDescent"] = data.number_of_floors_descent
        if data.forwarding_count:
            props["ForwardingCount"] = data.forwarding_count
        if data.delivery_by_hand:
            props["DeliveryByHand"] = "1"
            if data.delivery_by_hand_recipients:
                props["DeliveryByHandRecipients"] = data.delivery_by_hand_recipients
        if data.special_cargo:
            props["SpecialCargo"] = "1"
        if data.packing_number:
            props["PackingNumber"] = data.packing_number
        if data.additional_information:
            props["AdditionalInformation"] = data.additional_information

        return props

    @staticmethod
    def build_update_payload(
        data: OrderNovaPoshtaWaybillUpsert,
        waybill_ref: str,
        sender: NovaPoshtaSenderProfile,
        recipient_counterparty_ref: str = "",
        recipient_contact_ref: str = "",
        third_person_ref: str = "",
    ) -> dict:
        """
        Build methodProperties for InternetDocument/update.

        Reuses save payload but adds Ref.
        """
        props = NovaPoshtaWaybillPayloadBuilder.build_save_payload(
            data, sender,
            recipient_counterparty_ref=recipient_counterparty_ref,
            recipient_contact_ref=recipient_contact_ref,
            third_person_ref=third_person_ref,
        )
        props["Ref"] = waybill_ref
        return props

    @staticmethod
    def build_delete_payload(waybill_refs: list) -> dict:
        """Build methodProperties for InternetDocument/delete."""
        return {
            "DocumentRefs": waybill_refs,
        }

    @staticmethod
    def build_list_payload(
        sender_ref: str,
        page: int = 1,
        limit: int = 50,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> dict:
        """Build methodProperties for InternetDocument/getDocumentList."""
        props: Dict[str, Any] = {
            "SenderRef": sender_ref,
            "Page": str(page),
            "Limit": str(limit),
        }
        if date_from:
            props["DateTimeFrom"] = date_from
        if date_to:
            props["DateTimeTo"] = date_to
        return props

    @staticmethod
    def build_print_payload(waybill_refs: list, document_type: str = "pdf") -> dict:
        """
        Build methodProperties for InternetDocument/generateReport.

        document_type: "pdf" or "html"
        """
        return {
            "DocumentRefs[]": waybill_refs,
            "Type": document_type,
        }

    @staticmethod
    def build_check_possible_payload(
        data: OrderNovaPoshtaWaybillUpsert,
        sender: NovaPoshtaSenderProfile,
    ) -> dict:
        """Build methodProperties for checkPossibilityCreateDocument."""
        # Same as save payload
        return NovaPoshtaWaybillPayloadBuilder.build_save_payload(data, sender)

    # ─── Private helpers ─────────────────────────────────────────────────

    @staticmethod
    def _delivery_type_to_service(delivery_type: str) -> str:
        """Map our delivery_type to NP ServiceType."""
        mapping = {
            "warehouse": "WarehouseWarehouse",
            "postomat": "WarehousePostomat",
            "address": "WarehouseDoors",
        }
        return mapping.get(delivery_type, "WarehouseWarehouse")

    @staticmethod
    def _build_options_seat(data: OrderNovaPoshtaWaybillUpsert) -> list:
        """Build OptionsSeat array from seat data."""
        if data.options_seat:
            seats = []
            for seat in data.options_seat:
                seat_dict: Dict[str, Any] = {
                    "description": seat.description or "",
                    "cost": seat.cost or "0",
                    "weight": seat.weight or "0.001",
                }
                if seat.pack_ref:
                    seat_dict["packRef"] = seat.pack_ref
                if seat.volumetric_width:
                    seat_dict["volumetricWidth"] = seat.volumetric_width
                if seat.volumetric_length:
                    seat_dict["volumetricLength"] = seat.volumetric_length
                if seat.volumetric_height:
                    seat_dict["volumetricHeight"] = seat.volumetric_height
                if seat.volumetric_volume:
                    seat_dict["volumetricVolume"] = seat.volumetric_volume
                seats.append(seat_dict)
            return seats

        # Fallback: build a single OptionsSeat from top-level fields
        seat: Dict[str, Any] = {
            "description": data.description or "",
            "cost": data.cost or "0",
            "weight": data.weight or "0.001",
        }
        if data.pack_ref:
            seat["packRef"] = data.pack_ref
        if data.volumetric_width:
            seat["volumetricWidth"] = data.volumetric_width
        if data.volumetric_length:
            seat["volumetricLength"] = data.volumetric_length
        if data.volumetric_height:
            seat["volumetricHeight"] = data.volumetric_height
        if data.volume_general:
            seat["volumetricVolume"] = data.volume_general
        return [seat]

    @staticmethod
    def _build_recipient(data: OrderNovaPoshtaWaybillUpsert) -> dict:
        """Build recipient info sub-dict for some NP API versions."""
        return {
            "RecipientCityRef": data.recipient_city_ref,
            "RecipientAddressRef": data.recipient_address_ref,
            "RecipientContactName": data.recipient_name,
            "RecipientSurname": data.recipient_last_name or "",
            "RecipientFirstname": data.recipient_first_name or "",
            "RecipientMiddleName": data.recipient_middle_name or "",
            "RecipientPhone": data.recipient_phone,
        }
