"""
Maps Nova Poshta status codes to human-readable labels and descriptions.

Based on NP official documentation as of 2025.
"""
from typing import Optional, Dict


class NovaPoshtaTrackingStatusCatalog:
    """Lookup table for NP status codes → labels."""

    # Primary status groups → label
    STATUS_LABELS: Dict[str, str] = {
        # ─── Pre-processing ────────────────────────────────────────────
        "1": "Створено",                      # Created
        "2": "Відправлено",                   # Sent
        "3": "Прийнято",                      # Accepted
        "4": "Прибуло",                       # Arrived
        "5": "В обробці",                     # Processing
        "6": "Видано",                        # Issued (ready for pickup)
        "7": "Отримано",                      # Received
        "8": "Відмовлено",                    # Refused / Cancelled
        "9": "Повернення",                    # Return
        "10": "Доставлено",                   # Delivered

        # ─── 3-digit granular codes (most common) ─────────────────────
        "101": "Відправлення створено",
        "102": "Відправлення видалено",
        "103": "Відправлення прийнято до обробки",
        "104": "Відправлення зареєстровано",
        "105": "Відправлення передано до служби доставки",
        "106": "Відправлення прибуло до відділення",
        "107": "Відправлення прибуло до міста отримувача",
        "108": "Відправлення прибуло до поштомату",
        "109": "Відправлення видалено з поштомату",
        "110": "Відправлення очікує отримувача",
        "111": "Отримана",
        "112": "Отримана через поштомат",
        "113": "Отримана особисто",
        "114": "Отримана представником",
        "115": "Відмова",
        "116": "Відмова через поштомат",
        "117": "Відправлення вилучено",
        "118": "Відправлення прямує до міста отримувача",
        "119": "Відправлення прямує до відділення отримувача",
        "120": "Відправлення знищено",
        "121": "Відправлення затримано",
        "122": "Відправлення тимчасово заблоковано",
        "123": "Відправлення повернено",
        "124": "Відправлення повернено за зворотною адресою",
        "125": "Відправлення повернено відправнику",
        "200": "Відправлення прямує до пункту призначення",
        "201": "Відправлення вручено",
    }

    # Status groups for UI coloring
    STATUS_GROUP_CREATED = "created"
    STATUS_GROUP_IN_TRANSIT = "in_transit"
    STATUS_GROUP_ARRIVED = "arrived"
    STATUS_GROUP_DELIVERED = "delivered"
    STATUS_GROUP_RETURNED = "returned"
    STATUS_GROUP_ERROR = "error"

    # 3-digit → group mapping
    STATUS_GROUPS: Dict[str, str] = {
        "101": STATUS_GROUP_CREATED,
        "102": STATUS_GROUP_CREATED,
        "103": STATUS_GROUP_IN_TRANSIT,
        "104": STATUS_GROUP_CREATED,
        "105": STATUS_GROUP_IN_TRANSIT,
        "106": STATUS_GROUP_ARRIVED,
        "107": STATUS_GROUP_IN_TRANSIT,
        "108": STATUS_GROUP_ARRIVED,
        "109": STATUS_GROUP_ERROR,
        "110": STATUS_GROUP_ARRIVED,
        "111": STATUS_GROUP_DELIVERED,
        "112": STATUS_GROUP_DELIVERED,
        "113": STATUS_GROUP_DELIVERED,
        "114": STATUS_GROUP_DELIVERED,
        "115": STATUS_GROUP_ERROR,
        "116": STATUS_GROUP_ERROR,
        "117": STATUS_GROUP_RETURNED,
        "118": STATUS_GROUP_IN_TRANSIT,
        "119": STATUS_GROUP_IN_TRANSIT,
        "120": STATUS_GROUP_ERROR,
        "121": STATUS_GROUP_ERROR,
        "122": STATUS_GROUP_ERROR,
        "123": STATUS_GROUP_RETURNED,
        "124": STATUS_GROUP_RETURNED,
        "125": STATUS_GROUP_RETURNED,
        "200": STATUS_GROUP_IN_TRANSIT,
        "201": STATUS_GROUP_DELIVERED,
    }

    # Short single-digit mapping
    STATUS_GROUPS_SIMPLE: Dict[str, str] = {
        "1": STATUS_GROUP_CREATED,
        "2": STATUS_GROUP_IN_TRANSIT,
        "3": STATUS_GROUP_IN_TRANSIT,
        "4": STATUS_GROUP_ARRIVED,
        "5": STATUS_GROUP_IN_TRANSIT,
        "6": STATUS_GROUP_ARRIVED,
        "7": STATUS_GROUP_DELIVERED,
        "8": STATUS_GROUP_ERROR,
        "9": STATUS_GROUP_RETURNED,
        "10": STATUS_GROUP_DELIVERED,
    }

    @classmethod
    def get_label(cls, status_code: str) -> str:
        """Return human-readable label for a status code."""
        if not status_code:
            return ""
        return cls.STATUS_LABELS.get(status_code, f"Код {status_code}")

    @classmethod
    def get_group(cls, status_code: str) -> str:
        """Return status group for UI styling."""
        if not status_code:
            return cls.STATUS_GROUP_CREATED

        group = cls.STATUS_GROUPS.get(status_code)
        if group:
            return group

        group = cls.STATUS_GROUPS_SIMPLE.get(status_code)
        if group:
            return group

        return cls.STATUS_GROUP_IN_TRANSIT

    @classmethod
    def is_final(cls, status_code: str) -> bool:
        """Check if status code is terminal (delivered/returned/error)."""
        from app.services.nova_poshta.constants import NOVA_POSHTA_FINAL_STATUSES
        return status_code in NOVA_POSHTA_FINAL_STATUSES

    @classmethod
    def status_code_to_label(cls, status_code: str, status_text: Optional[str] = None) -> str:
        """Convert NP status code + optional text to label."""
        if status_text:
            return status_text
        return cls.get_label(status_code)
