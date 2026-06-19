"""
Service for Nova Poshta online lookup endpoints.

All lookups are performed live via NP API — no local caching.
Provides debounced searching for:
  - Settlements (cities)
  - Streets
  - Warehouses
  - Counterparties
  - Packaging types
  - Time intervals
  - Delivery dates
"""
import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.nova_poshta import NovaPoshtaSenderProfile
from app.schemas.nova_poshta_schemas import (
    NovaPoshtaLookupSettlement,
    NovaPoshtaLookupStreet,
    NovaPoshtaLookupWarehouse,
    NovaPoshtaLookupPackaging,
    NovaPoshtaLookupTimeInterval,
    NovaPoshtaLookupDeliveryDate,
    NovaPoshtaLookupCounterparty,
    NovaPoshtaCounterpartyDetails,
)
from app.services.nova_poshta.client import NovaPoshtaApiClient
from app.services.nova_poshta.sender_service import NovaPoshtaSenderService
from app.services.nova_poshta.errors import NovaPoshtaSenderNotFoundError, NovaPoshtaApiError
from app.services.nova_poshta.constants import (
    MODEL_ADDRESS,
    MODEL_COUNTERPARTY,
    MODEL_COMMON,
    METHOD_SEARCH_SETTLEMENTS,
    METHOD_SEARCH_STREETS,
    METHOD_GET_WAREHOUSES,
    METHOD_GET_PACK_TYPES,
    METHOD_GET_TIME_INTERVALS,
    METHOD_GET_DELIVERY_DATE,
    METHOD_GET_COUNTERPARTIES,
    METHOD_GET_COUNTERPARTY_OPTIONS,
)

logger = logging.getLogger(__name__)


class NovaPoshtaLookupService:
    """
    Live lookup service for Nova Poshta reference data.

    Every call is an API request — no local cache.
    """

    def __init__(self, db: Session):
        self.db = db

    def _resolve_sender(self, sender_profile_id: Optional[int] = None) -> NovaPoshtaSenderProfile:
        """Resolve a sender profile by ID or fall back to the default sender."""
        if sender_profile_id is not None:
            sender = self.db.get(NovaPoshtaSenderProfile, sender_profile_id)
            if not sender:
                raise NovaPoshtaSenderNotFoundError(f"Sender profile {sender_profile_id} not found")
            return sender
        # Fall back to default sender
        sender_service = NovaPoshtaSenderService(self.db)
        default = sender_service.get_default()
        if not default:
            raise NovaPoshtaSenderNotFoundError("No default sender profile configured")
        return default

    def _get_sender_client(self, sender_profile_id: Optional[int] = None) -> NovaPoshtaApiClient:
        """Get API client for a sender profile, falling back to default sender."""
        sender = self._resolve_sender(sender_profile_id)
        return NovaPoshtaApiClient(sender.api_token)

    # ─── Settlements / Cities ──────────────────────────────────────────────

    async def search_settlements(
        self,
        sender_profile_id: Optional[int] = None,
        query: str = "",
        locale: str = "uk",
        limit: int = 20,
    ) -> List[NovaPoshtaLookupSettlement]:
        """Search settlements by name."""
        client = self._get_sender_client(sender_profile_id)
        try:
            response = await client.call(
                MODEL_ADDRESS,
                METHOD_SEARCH_SETTLEMENTS,
                {
                    "CityName": query,
                    "Limit": str(limit),
                    "Page": "1",
                },
            )
        except NovaPoshtaApiError as e:
            logger.warning("Settlement search failed: %s", e)
            return []

        results: List[NovaPoshtaLookupSettlement] = []
        data = response.get("data", []) if isinstance(response.get("data"), list) else []
        for item in data:
            addresses = item.get("Addresses", []) or []
            for addr in addresses:
                results.append(NovaPoshtaLookupSettlement(
                    ref=addr.get("DeliveryCity", "") or addr.get("Ref", ""),
                    delivery_city_ref=addr.get("DeliveryCity", ""),
                    settlement_ref=addr.get("Ref", ""),
                    label=addr.get("Present", "") or addr.get("Description", ""),
                    main_description=addr.get("MainDescription", ""),
                    area=addr.get("Area", ""),
                    region=addr.get("Region", ""),
                    address_delivery_allowed=addr.get("AddressDeliveryAllowed", False) == "1",
                    streets_available=addr.get("StreetsAvailability", False) == "1",
                    warehouses_count=addr.get("Warehouses", "0"),
                    locale=locale,
                ))

        return results

    # ─── Streets ───────────────────────────────────────────────────────────

    async def search_streets(
        self,
        sender_profile_id: Optional[int] = None,
        settlement_ref: str = "",
        query: str = "",
        locale: str = "uk",
        limit: int = 20,
    ) -> List[NovaPoshtaLookupStreet]:
        """Search streets within a settlement."""
        client = self._get_sender_client(sender_profile_id)
        try:
            response = await client.call(
                MODEL_ADDRESS,
                METHOD_SEARCH_STREETS,
                {
                    "StreetName": query,
                    "SettlementRef": settlement_ref,
                    "Limit": str(limit),
                },
            )
        except NovaPoshtaApiError as e:
            logger.warning("Street search failed: %s", e)
            return []

        results: List[NovaPoshtaLookupStreet] = []
        data = response.get("data", []) if isinstance(response.get("data"), list) else []
        for item in data:
            results.append(NovaPoshtaLookupStreet(
                settlement_ref=item.get("SettlementRef", ""),
                street_ref=item.get("Ref", ""),
                label=item.get("Description", ""),
                street_name=item.get("StreetName", "") or item.get("Description", ""),
                street_type=item.get("StreetType", "") or item.get("StreetTypeDescription", ""),
            ))

        return results

    # ─── Warehouses ────────────────────────────────────────────────────────

    async def search_warehouses(
        self,
        sender_profile_id: Optional[int] = None,
        city_ref: str = "",
        query: str = "",
        warehouse_type_ref: str = "",
        locale: str = "uk",
        limit: int = 50,
    ) -> List[NovaPoshtaLookupWarehouse]:
        """Search warehouses in a city."""
        client = self._get_sender_client(sender_profile_id)
        props: dict = {
            "CityRef": city_ref,
            "Limit": str(limit),
        }
        if query:
            props["FindByString"] = query
        if warehouse_type_ref:
            props["TypeOfWarehouseRef"] = warehouse_type_ref

        try:
            response = await client.call(
                MODEL_ADDRESS,
                METHOD_GET_WAREHOUSES,
                props,
            )
        except NovaPoshtaApiError as e:
            logger.warning("Warehouse search failed: %s", e)
            return []

        results: List[NovaPoshtaLookupWarehouse] = []
        data = response.get("data", []) if isinstance(response.get("data"), list) else []
        for item in data:
            results.append(NovaPoshtaLookupWarehouse(
                ref=item.get("Ref", ""),
                number=item.get("Number", ""),
                city_ref=item.get("CityRef", ""),
                type=item.get("TypeOfWarehouse", ""),
                category=item.get("CategoryOfWarehouse", ""),
                label=item.get("Description", ""),
                description=item.get("ShortAddress", ""),
                full_description=item.get("Description", ""),
                post_finance=item.get("PostFinance", False) == "1",
            ))

        return results

    # ─── Packaging ─────────────────────────────────────────────────────────

    async def list_pack_types(
        self,
        sender_profile_id: Optional[int] = None,
        length_mm: int = 0,
        width_mm: int = 0,
        height_mm: int = 0,
    ) -> List[NovaPoshtaLookupPackaging]:
        """Get available packaging types."""
        client = self._get_sender_client(sender_profile_id)
        props: dict = {}
        if length_mm and width_mm and height_mm:
            props = {
                "Length": str(length_mm),
                "Width": str(width_mm),
                "Height": str(height_mm),
                "TypeOfPacking": "CardboardBox",
            }

        try:
            response = await client.call(
                MODEL_COMMON,
                METHOD_GET_PACK_TYPES,
                props,
            )
        except NovaPoshtaApiError as e:
            logger.warning("Pack type list failed: %s", e)
            return []

        results: List[NovaPoshtaLookupPackaging] = []
        data = response.get("data", []) if isinstance(response.get("data"), list) else []
        for item in data:
            results.append(NovaPoshtaLookupPackaging(
                ref=item.get("Ref", ""),
                label=item.get("Description", ""),
                description=item.get("DescriptionRu", ""),
                length_mm=item.get("Length", "0"),
                width_mm=item.get("Width", "0"),
                height_mm=item.get("Height", "0"),
                cost=item.get("PackingCost", "0"),
            ))

        return results

    # ─── Time intervals ────────────────────────────────────────────────────

    async def get_time_intervals(
        self,
        sender_profile_id: Optional[int] = None,
        recipient_city_ref: str = "",
        date_time: str = "",
        locale: str = "uk",
    ) -> List[NovaPoshtaLookupTimeInterval]:
        """Get delivery time intervals for a route."""
        client = self._get_sender_client(sender_profile_id)
        props: dict = {
            "RecipientCityRef": recipient_city_ref,
        }
        if date_time:
            props["DateTime"] = date_time

        try:
            response = await client.call(
                MODEL_COMMON,
                METHOD_GET_TIME_INTERVALS,
                props,
            )
        except NovaPoshtaApiError as e:
            logger.warning("Time intervals request failed: %s", e)
            return []

        results: List[NovaPoshtaLookupTimeInterval] = []
        data = response.get("data", []) if isinstance(response.get("data"), list) else []
        for item in data:
            results.append(NovaPoshtaLookupTimeInterval(
                number=item.get("Number", ""),
                start=item.get("Start", ""),
                end=item.get("End", ""),
                label=f"{item.get('Start', '')} - {item.get('End', '')}" if item.get("Start") else item.get("Number", ""),
            ))

        return results

    # ─── Delivery date ─────────────────────────────────────────────────────

    async def get_delivery_date(
        self,
        sender_profile_id: Optional[int] = None,
        recipient_city_ref: str = "",
        delivery_type: str = "warehouse",
        date_time: str = "",
        locale: str = "uk",
    ) -> List[NovaPoshtaLookupDeliveryDate]:
        """Get estimated delivery date."""
        client = self._get_sender_client(sender_profile_id)
        service_type_map = {
            "warehouse": "WarehouseWarehouse",
            "postomat": "WarehousePostomat",
            "address": "WarehouseDoors",
        }
        props: dict = {
            "RecipientCityRef": recipient_city_ref,
            "ServiceType": service_type_map.get(delivery_type, "WarehouseWarehouse"),
        }
        if date_time:
            props["DateTime"] = date_time

        try:
            response = await client.call(
                MODEL_COMMON,
                METHOD_GET_DELIVERY_DATE,
                props,
            )
        except NovaPoshtaApiError as e:
            logger.warning("Delivery date request failed: %s", e)
            return []

        results: List[NovaPoshtaLookupDeliveryDate] = []
        data = response.get("data", []) if isinstance(response.get("data"), list) else []
        for item in data:
            results.append(NovaPoshtaLookupDeliveryDate(
                date=item.get("Date", ""),
                raw_datetime=item.get("DateTime", ""),
            ))

        return results

    # ─── Counterparties ────────────────────────────────────────────────────

    async def search_counterparties(
        self,
        sender_profile_id: Optional[int] = None,
        query: str = "",
        counterparty_property: str = "Recipient",
        locale: str = "uk",
        limit: int = 20,
    ) -> List[NovaPoshtaLookupCounterparty]:
        """Search counterparties (recipients/senders) by name or phone."""
        client = self._get_sender_client(sender_profile_id)
        props: dict = {
            "CounterpartyProperty": counterparty_property,
            "Page": "1",
        }
        if query:
            props["FindByString"] = query

        try:
            response = await client.call(
                MODEL_COUNTERPARTY,
                METHOD_GET_COUNTERPARTIES,
                props,
            )
        except NovaPoshtaApiError as e:
            logger.warning("Counterparty search failed: %s", e)
            return []

        results: List[NovaPoshtaLookupCounterparty] = []
        data = response.get("data", []) if isinstance(response.get("data"), list) else []
        for item in data:
            results.append(NovaPoshtaLookupCounterparty(
                ref=item.get("Ref", ""),
                counterparty_ref=item.get("Ref", ""),
                city_ref=item.get("CityRef", ""),
                city_label=item.get("CityDescription", ""),
                label=item.get("Description", ""),
                full_name=item.get("FullName", "") or item.get("Description", ""),
                first_name=item.get("FirstName", ""),
                last_name=item.get("LastName", ""),
                middle_name=item.get("MiddleName", ""),
                phone=item.get("Phone", ""),
                address=item.get("Address", ""),
                edrpou=item.get("EDRPOU", ""),
                counterparty_type=item.get("CounterpartyType", ""),
            ))

        return results

    async def get_counterparty_details(
        self,
        sender_profile_id: Optional[int] = None,
        counterparty_ref: str = "",
        counterparty_property: str = "Recipient",
        locale: str = "uk",
    ) -> Optional[NovaPoshtaCounterpartyDetails]:
        """Get detailed info about a counterparty."""
        client = self._get_sender_client(sender_profile_id)
        try:
            response = await client.call(
                MODEL_COUNTERPARTY,
                METHOD_GET_COUNTERPARTY_OPTIONS,
                {
                    "CounterpartyRef": counterparty_ref,
                    "CounterpartyProperty": counterparty_property,
                },
            )
        except NovaPoshtaApiError as e:
            logger.warning("Counterparty details request failed: %s", e)
            return None

        data = response.get("data", [])
        if not data:
            return None

        item = data[0] if isinstance(data, list) else data
        if isinstance(item, list):
            item = item[0] if item else {}

        return NovaPoshtaCounterpartyDetails(
            contact_ref=item.get("ContactRef", "") or item.get("Ref", ""),
            contact_name=item.get("ContactName", "") or item.get("Name", ""),
            phone=item.get("Phone", ""),
            city_ref=item.get("CityRef", ""),
            city_label=item.get("CityDescription", ""),
            address_ref=item.get("AddressRef", ""),
            address_label=item.get("AddressDescription", ""),
        )
