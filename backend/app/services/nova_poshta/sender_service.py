"""
Service for managing Nova Poshta sender profiles.

Handles CRUD, validation against NP API, and token masking.
"""
import logging
from typing import Optional, List
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.nova_poshta import NovaPoshtaSenderProfile
from app.schemas.nova_poshta_schemas import (
    NovaPoshtaSenderProfileCreate,
    NovaPoshtaSenderProfileUpdate,
    NovaPoshtaSenderProfileValidateResult,
    NovaPoshtaFetchFromTokenResult,
)
from app.services.nova_poshta.client import NovaPoshtaApiClient
from app.services.nova_poshta.errors import (
    NovaPoshtaSenderNotFoundError,
    NovaPoshtaApiError,
)

logger = logging.getLogger(__name__)


class NovaPoshtaSenderService:
    """CRUD and validation for sender profiles."""

    def __init__(self, db: Session):
        self.db = db

    # ─── CRUD ──────────────────────────────────────────────────────────────────

    def list_active(self) -> List[NovaPoshtaSenderProfile]:
        """Return all active sender profiles, ordered by is_default DESC, name ASC."""
        stmt = (
            select(NovaPoshtaSenderProfile)
            .where(NovaPoshtaSenderProfile.is_active == True)
            .order_by(NovaPoshtaSenderProfile.is_default.desc(), NovaPoshtaSenderProfile.name.asc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def list_all(self) -> List[NovaPoshtaSenderProfile]:
        """Return all sender profiles, ordered by is_default DESC, name ASC."""
        stmt = (
            select(NovaPoshtaSenderProfile)
            .order_by(NovaPoshtaSenderProfile.is_default.desc(), NovaPoshtaSenderProfile.name.asc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_by_id(self, profile_id: int) -> NovaPoshtaSenderProfile:
        """Get a sender profile by ID or raise."""
        profile = self.db.get(NovaPoshtaSenderProfile, profile_id)
        if not profile:
            raise NovaPoshtaSenderNotFoundError(f"Sender profile {profile_id} not found")
        return profile

    def get_default(self) -> Optional[NovaPoshtaSenderProfile]:
        """Return the default active sender profile, or None."""
        stmt = (
            select(NovaPoshtaSenderProfile)
            .where(
                NovaPoshtaSenderProfile.is_active == True,
                NovaPoshtaSenderProfile.is_default == True,
            )
            .limit(1)
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def create(self, data: NovaPoshtaSenderProfileCreate) -> NovaPoshtaSenderProfile:
        """Create a new sender profile.

        Auto-generates `name` and `contact_name` per NP API conventions:
          - PrivatePerson: name = "LastName FirstName", contact_name = "LastName FirstName MiddleName"
          - Organization (fop/business): name = organization_name, contact_name = "LastName FirstName MiddleName"
        """
        # If is_default=True, unset all others
        if data.is_default:
            self._clear_default()

        # Auto-generate name & contact_name if not provided
        name = data.name
        contact_name = data.contact_name

        if data.sender_type == "private_person":
            # Build display name from last/first/middle
            parts = [data.last_name, data.first_name]
            name = name or " ".join(p for p in parts if p) or "Без имени"
            cp_parts = [data.last_name, data.first_name, data.middle_name]
            contact_name = contact_name or " ".join(p for p in cp_parts if p)
        else:
            # Organization or FOP — use organization_name as display name
            name = name or data.organization_name or data.edrpou or "Без имени"
            cp_parts = [data.last_name, data.first_name, data.middle_name]
            contact_name = contact_name or " ".join(p for p in cp_parts if p)

        profile = NovaPoshtaSenderProfile(
            name=name,
            sender_type=data.sender_type,
            api_token=data.api_token,
            first_name=data.first_name or "",
            last_name=data.last_name or "",
            middle_name=data.middle_name or "",
            counterparty_ref=data.counterparty_ref or "",
            contact_ref=data.contact_ref or "",
            address_ref=data.address_ref or "",
            city_ref=data.city_ref or "",
            city_label=data.city_label or "",
            address_label=data.address_label or "",
            phone=data.phone or "",
            email=data.email or "",
            contact_name=contact_name,
            organization_name=data.organization_name or "",
            edrpou=data.edrpou or "",
            is_active=data.is_active,
            is_default=data.is_default,
            raw_meta=data.raw_meta or {},
        )
        self.db.add(profile)
        self.db.flush()
        logger.info("Created NP sender profile id=%d name=%s", profile.id, profile.name)
        return profile

    def update(self, profile_id: int, data: NovaPoshtaSenderProfileUpdate) -> NovaPoshtaSenderProfile:
        """Update an existing sender profile."""
        profile = self.get_by_id(profile_id)

        update_data = data.model_dump(exclude_unset=True)

        # If is_default=True, unset all others
        if update_data.get("is_default"):
            self._clear_default(exclude_id=profile_id)

        # Masked token means "keep existing" on frontend, so skip update
        if update_data.get("api_token") and update_data["api_token"].startswith("•"):
            del update_data["api_token"]

        for field, value in update_data.items():
            setattr(profile, field, value)

        profile.updated_at = datetime.utcnow()
        self.db.flush()
        logger.info("Updated NP sender profile id=%d", profile.id)
        return profile

    def delete(self, profile_id: int) -> None:
        """Delete or deactivate a sender profile.

        If no waybills reference this sender, the row is hard-deleted.
        Otherwise, soft-delete by setting is_active=False to preserve FK integrity.
        """
        profile = self.get_by_id(profile_id)

        # Check if any waybills reference this sender
        from app.models.nova_poshta import OrderNovaPoshtaWaybill
        stmt = select(OrderNovaPoshtaWaybill).where(
            OrderNovaPoshtaWaybill.sender_profile_id == profile_id
        ).limit(1)
        has_waybills = self.db.execute(stmt).first() is not None

        if has_waybills:
            # Soft-delete — keep the record for FK integrity
            profile.is_active = False
            profile.updated_at = datetime.utcnow()
            self.db.flush()
            logger.info("Deactivated NP sender profile id=%d (has waybills)", profile.id)
        else:
            # Hard-delete — no waybills reference this sender
            self.db.delete(profile)
            self.db.flush()
            logger.info("Deleted NP sender profile id=%d", profile.id)

    # ─── Validation ───────────────────────────────────────────────────────────

    async def validate_profile(
        self, profile_id: int
    ) -> NovaPoshtaSenderProfileValidateResult:
        """
        Validate a sender profile by calling NP Counterparty/getCounterparties.

        Updates the profile's validation fields on success, including
        resolving human-readable city_label and address_label.
        """
        profile = self.get_by_id(profile_id)
        client = NovaPoshtaApiClient(profile.api_token)

        try:
            # Test basic API connectivity by listing counterparties
            resp = await client.call(
                "Counterparty",
                "getCounterparties",
                {"CounterpartyProperty": "Sender", "Page": "1"},
            )
            data = resp.get("data", [])
            if not data:
                result = NovaPoshtaSenderProfileValidateResult(
                    success=False,
                    message="Контрагентів не знайдено. Спочатку створіть відправника в кабінеті НП",
                )
            else:
                # Pick first counterparty as our sender
                cp = data[0]

                # NP API returns field "City" (not "CityRef") for getCounterparties
                # A zero GUID means "no city assigned" — treat as empty
                raw_city = cp.get("CityRef") or cp.get("City") or ""
                if raw_city == "00000000-0000-0000-0000-000000000000":
                    raw_city = ""

                profile.counterparty_ref = cp.get("Ref", profile.counterparty_ref)
                profile.contact_ref = cp.get("Contacts", "") or profile.contact_ref
                profile.city_ref = raw_city or profile.city_ref
                profile.organization_name = cp.get("Description", profile.organization_name)

                # If Contacts field was empty (common for Organization-type counterparties),
                # try to fetch contact person via getCounterpartyContactPersons
                if not profile.contact_ref and profile.counterparty_ref:
                    try:
                        cp_resp = await client.call(
                            "CounterpartyGeneral",
                            "getCounterpartyContactPersons",
                            {"Ref": profile.counterparty_ref, "Page": "1"},
                        )
                        cp_data = cp_resp.get("data", [])
                        if cp_data:
                            profile.contact_ref = cp_data[0].get("Ref", "")
                            if not profile.phone:
                                profile.phone = cp_data[0].get("Phones", "")
                            if not profile.email:
                                profile.email = cp_data[0].get("Email", "")
                    except Exception:
                        logger.debug(
                            "Could not fetch contact persons for counterparty %s during validation",
                            profile.counterparty_ref,
                        )

                # Resolve human-readable city label
                if profile.city_ref:
                    profile.city_label = await self._resolve_city_label(client, profile.city_ref)

                # Fetch counterparty addresses to get address_ref and address_label
                if profile.counterparty_ref:
                    try:
                        addr_resp = await client.call(
                            "CounterpartyGeneral",
                            "getCounterpartyAddresses",
                            {"Ref": profile.counterparty_ref, "CounterpartyProperty": "Sender"},
                        )
                        addr_data = addr_resp.get("data", [])
                        if addr_data:
                            addr = addr_data[0]
                            profile.address_ref = addr.get("Ref", profile.address_ref)
                            profile.address_label = addr.get("Description", "")
                    except Exception:
                        logger.debug(
                            "Could not fetch addresses for counterparty %s during validation",
                            profile.counterparty_ref,
                        )

                result = NovaPoshtaSenderProfileValidateResult(
                    success=True,
                    message="Відправника перевірено успішно",
                    counterparty_ref=profile.counterparty_ref or "",
                    contact_ref=profile.contact_ref or "",
                    address_ref=profile.address_ref or "",
                    city_ref=profile.city_ref or "",
                    city_label=profile.city_label or "",
                    address_label=profile.address_label or "",
                )

            profile.last_validated_at = datetime.utcnow()
            profile.last_validation_ok = result.success
            profile.last_validation_message = result.message
            profile.last_validation_payload = {
                "counterparty_ref": profile.counterparty_ref or "",
                "contact_ref": profile.contact_ref or "",
                "address_ref": profile.address_ref or "",
                "city_ref": profile.city_ref or "",
                "city_label": profile.city_label or "",
                "address_label": profile.address_label or "",
            }
            self.db.flush()
            return result

        except NovaPoshtaApiError as e:
            logger.warning("Validation failed for sender id=%d: %s", profile_id, str(e))
            result = NovaPoshtaSenderProfileValidateResult(
                success=False,
                message=str(e) or "Помилка при перевірці API ключа",
            )
            profile.last_validated_at = datetime.utcnow()
            profile.last_validation_ok = False
            profile.last_validation_message = result.message
            profile.last_validation_payload = {"errors": e.errors}
            self.db.flush()
            return result

    async def fetch_sender_from_token(self, api_token: str) -> NovaPoshtaFetchFromTokenResult:
        """
        Fetch sender counterparty data from NP API using a raw API token.

        Calls Counterparty/getCounterparties with CounterpartyProperty=Sender,
        then additionally fetches contact persons (Phone, Email) via
        Counterparty/getCounterpartyContactPersons.

        Returns the first counterparty's data for form auto-population.
        Does NOT persist anything.
        """
        client = NovaPoshtaApiClient(api_token)
        try:
            resp = await client.call(
                "Counterparty",
                "getCounterparties",
                {"CounterpartyProperty": "Sender", "Page": "1"},
            )
            data = resp.get("data", [])
            if not data:
                return NovaPoshtaFetchFromTokenResult(
                    success=False,
                    message="Контрагентів не знайдено. Спочатку створіть відправника в кабінеті НП",
                )
            cp = data[0]

            # NP API returns "City" not "CityRef"; zero GUID = no city assigned
            raw_city = cp.get("CityRef") or cp.get("City") or ""
            if raw_city == "00000000-0000-0000-0000-000000000000":
                raw_city = ""

            result = NovaPoshtaFetchFromTokenResult(
                success=True,
                message="Дані відправника отримано",
                first_name=cp.get("FirstName", ""),
                last_name=cp.get("LastName", ""),
                middle_name=cp.get("MiddleName", ""),
                phone=cp.get("Phone", ""),
                email=cp.get("Email", ""),
                counterparty_type=cp.get("CounterpartyType", ""),
                counterparty_ref=cp.get("Ref", ""),
                city_ref=raw_city,
                edrpou=cp.get("EDRPOU", ""),
                ownership_form_description=cp.get("OwnershipFormDescription", ""),
                description=cp.get("Description", ""),
            )

            # Also try to fetch contact persons — NP API may return phone/email there
            if result.counterparty_ref:
                try:
                    cp_resp = await client.call(
                        "CounterpartyGeneral",
                        "getCounterpartyContactPersons",
                        {"Ref": result.counterparty_ref, "Page": "1"},
                    )
                    cp_data = cp_resp.get("data", [])
                    if cp_data:
                        contact = cp_data[0]
                        if not result.phone and contact.get("Phones"):
                            result.phone = contact["Phones"]
                        if not result.email and contact.get("Email"):
                            result.email = contact["Email"]
                        if not result.first_name and contact.get("FirstName"):
                            result.first_name = contact["FirstName"]
                        if not result.last_name and contact.get("LastName"):
                            result.last_name = contact["LastName"]
                        if not result.middle_name and contact.get("MiddleName"):
                            result.middle_name = contact["MiddleName"]
                        if not result.contact_ref and contact.get("Ref"):
                            result.contact_ref = contact["Ref"]
                except Exception:
                    logger.debug("Could not fetch contact persons for counterparty %s", result.counterparty_ref)

            # Resolve human-readable labels
            if result.city_ref:
                result.city_label = await self._resolve_city_label(client, result.city_ref)
            if result.counterparty_ref:
                # Fetch addresses to get label for the default address
                try:
                    addr_resp = await client.call(
                        "CounterpartyGeneral",
                        "getCounterpartyAddresses",
                        {"Ref": result.counterparty_ref, "CounterpartyProperty": "Sender"},
                    )
                    addr_data = addr_resp.get("data", [])
                    if addr_data:
                        # Use first address description as label
                        result.address_label = addr_data[0].get("Description", "")
                except Exception:
                    logger.debug("Could not fetch addresses for counterparty %s", result.counterparty_ref)

            return result

        except NovaPoshtaApiError as e:
            logger.warning("fetch_sender_from_token failed: %s", str(e))
            return NovaPoshtaFetchFromTokenResult(
                success=False,
                message=str(e) or "Помилка при перевірці API ключа",
            )

    # ─── Label resolution helpers ─────────────────────────────────────────────

    async def _resolve_city_label(
        self, client: NovaPoshtaApiClient, city_ref: str
    ) -> str:
        """Resolve a city Ref to a human-readable name via NP API."""
        if not city_ref:
            return ""
        try:
            resp = await client.call(
                "AddressGeneral",
                "getCities",
                {"Ref": city_ref},
            )
            data = resp.get("data", [])
            if data:
                return data[0].get("Description", "")
        except Exception:
            logger.debug("Could not resolve city label for ref %s", city_ref)
        return ""

    async def _resolve_address_label(
        self,
        client: NovaPoshtaApiClient,
        counterparty_ref: str,
        address_ref: str,
    ) -> str:
        """Resolve an address Ref to a human-readable description via NP API."""
        if not address_ref or not counterparty_ref:
            return ""
        try:
            resp = await client.call(
                "CounterpartyGeneral",
                "getCounterpartyAddresses",
                {"Ref": counterparty_ref, "CounterpartyProperty": "Sender"},
            )
            data = resp.get("data", [])
            for addr in data:
                if addr.get("Ref") == address_ref:
                    return addr.get("Description", "")
            if data:
                return data[0].get("Description", "")
        except Exception:
            logger.debug(
                "Could not resolve address label for ref %s (counterparty %s)",
                address_ref, counterparty_ref,
            )
        return ""

    # ─── Helpers ──────────────────────────────────────────────────────────────

    def _clear_default(self, exclude_id: Optional[int] = None) -> None:
        """Unset is_default for all profiles, optionally excluding one."""
        stmt = select(NovaPoshtaSenderProfile).where(NovaPoshtaSenderProfile.is_default == True)
        if exclude_id:
            stmt = stmt.where(NovaPoshtaSenderProfile.id != exclude_id)
        profiles = list(self.db.execute(stmt).scalars().all())
        for p in profiles:
            p.is_default = False

    @staticmethod
    def mask_token(token: str) -> str:
        """Mask an API token for frontend display — returns same-length mask."""
        if not token:
            return ""
        return "•" * len(token)

    @staticmethod
    def is_masked(token: str) -> bool:
        """Check if a token value is a masked placeholder."""
        return token.startswith("•") if token else False
