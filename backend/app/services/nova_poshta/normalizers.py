"""
Data normalisers for Nova Poshta API values.
"""
import re
from typing import Optional


class NovaPoshtaDataNormalizer:
    """Sanitise and standardise values before sending to NP API."""

    @staticmethod
    def phone(phone: str) -> str:
        """
        Normalise a phone number to NP format: 380XXXXXXXXX (12 digits, no +).

        Accepts various formats, strips non-digit characters.
        Always returns exactly 12 digits (380XXXXXXXXX) or empty string.
        """
        if not phone:
            return ""
        cleaned = re.sub(r"[^\d]", "", phone)
        if cleaned.startswith("380") and len(cleaned) == 12:
            return cleaned
        if cleaned.startswith("80") and len(cleaned) == 11:
            result = f"3{cleaned}"
            if len(result) > 12:
                result = result[:12]
            return result
        if cleaned.startswith("0") and len(cleaned) <= 11:
            result = f"380{cleaned[1:]}"
            if len(result) > 12:
                result = result[:12]
            return result
        if len(cleaned) >= 12:
            return cleaned[:12]
        if len(cleaned) >= 11:
            return f"38{cleaned}"[:12]
        if len(cleaned) >= 10:
            return f"38{cleaned}"[:12]
        return cleaned

    @staticmethod
    def weight(value: Optional[str]) -> str:
        """Normalize weight to NP format."""
        if not value:
            return "0.1"
        value = value.replace(",", ".")
        try:
            w = float(value)
            if w <= 0:
                return "0.1"
            return str(w).rstrip("0").rstrip(".")
        except (ValueError, TypeError):
            return "0.1"

    @staticmethod
    def cost(value: Optional[str]) -> str:
        """Normalize cost to integer (ціле число) as required by NP API."""
        if not value:
            return "0"
        value = value.replace(",", ".")
        try:
            c = float(value)
            return str(int(round(c)))
        except (ValueError, TypeError):
            return "0"

    @staticmethod
    def seats_amount(value: Optional[int]) -> int:
        """Normalize seats amount."""
        if not value or value < 1:
            return 1
        return value

    @staticmethod
    def description(value: Optional[str]) -> str:
        """Truncate description to NP max length (255 chars)."""
        if not value:
            return ""
        return value[:255]

    @staticmethod
    def full_name_surname(value: Optional[str]) -> str:
        """Capitalize first letter of surname."""
        if not value:
            return ""
        return value.strip().capitalize()

    @staticmethod
    def full_name_first(value: Optional[str]) -> str:
        """Capitalize first letter of first name."""
        if not value:
            return ""
        return value.strip().capitalize()

    @staticmethod
    def full_name_middle(value: Optional[str]) -> str:
        """Capitalize first letter of middle name."""
        if not value:
            return ""
        return value.strip().capitalize()
