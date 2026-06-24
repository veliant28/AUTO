"""
Maps Nova Poshta API error codes to user-friendly messages.
"""
from typing import List, Optional, Tuple
from app.core.middleware import locale_ctx
from app.services.nova_poshta.error_translations import ERROR_TRANSLATIONS


class NovaPoshtaErrorMapper:
    """Resolve NP API error codes into human-readable text."""

    @classmethod
    def classify_severity(cls, error_codes: List[str]) -> str:
        """Classify error codes by severity.

        Returns one of: "error", "warning", "info"
        """
        if not error_codes:
            return "error"  # default for unknown errors

        # Check prefixes
        for code in error_codes:
            if code.startswith("200"):  # 200001-2000xx = hard errors
                return "error"
            if code.startswith("300"):  # 300001-3000xx = warnings
                return "warning"
            if code.startswith("400"):  # 400001-4000xx = info
                return "info"

        return "error"

    @classmethod
    def translate(cls, error_code: str, locale: Optional[str] = None) -> str:
        """Translate a single error code to the given locale (default: from request context)."""
        if locale is None:
            locale = locale_ctx.get()
        translations = ERROR_TRANSLATIONS.get(error_code, {})
        if locale in translations:
            return translations[locale]
        if "uk" in translations:
            return translations["uk"]
        return f"Помилка {error_code}"

    @classmethod
    def translate_list(cls, error_codes: List[str], locale: Optional[str] = None) -> List[str]:
        """Translate a list of error codes."""
        if locale is None:
            locale = locale_ctx.get()
        return [cls.translate(code, locale) for code in error_codes]

    @classmethod
    def flatten_errors(cls, api_response: dict, locale: Optional[str] = None) -> List[str]:
        """
        Extract error messages from a standard NP API response dict.

        NP error format:
        {
            "success": False,
            "errors": ["..."],
            "errorCodes": ["..."],
            "errorMessage": "..."
        }
        """
        if locale is None:
            locale = locale_ctx.get()
        messages: List[str] = []

        # ── Collect and translate error codes first ─────────────────────
        # errorCodes list
        error_codes = api_response.get("errorCodes", [])
        if isinstance(error_codes, list):
            for code in error_codes:
                if isinstance(code, str):
                    translated = cls.translate(code, locale)
                    if translated not in messages:
                        messages.append(translated)

        # Error codes embedded in data[0] (common for document operations)
        data = api_response.get("data", [])
        if isinstance(data, list) and data:
            first = data[0] if isinstance(data[0], dict) else {}
            for code_list_key in ("ErrorCodes", "errorCodes"):
                codes = first.get(code_list_key, [])
                if isinstance(codes, list):
                    for code in codes:
                        if isinstance(code, str):
                            translated = cls.translate(code, locale)
                            if translated not in messages:
                                messages.append(translated)

        had_codes = bool(messages)  # we already have translated codes
        
        # errors list — skip if we already have translated codes (redundant English duplicates)
        if not had_codes:
            errors = api_response.get("errors", [])
            if isinstance(errors, list):
                for err in errors:
                    if isinstance(err, str) and err:
                        if err.isdigit():
                            translated = cls.translate(err, locale)
                        else:
                            translated = err
                        if translated not in messages:
                            messages.append(translated)

        # errorMessage — raw English text from NP API, only if nothing else was found
        if not messages:
            error_msg = api_response.get("errorMessage") or api_response.get("message")
            if error_msg and isinstance(error_msg, str):
                messages.append(error_msg)

        return messages

    @classmethod
    def flatten_warnings(cls, api_response: dict) -> List[str]:
        """Extract warning messages from a NP API response."""
        warnings: List[str] = []
        data = api_response.get("data", [])
        if isinstance(data, list) and data:
            first = data[0] if isinstance(data[0], dict) else {}
            for key in ("Warnings", "warnings"):
                items = first.get(key, [])
                if isinstance(items, list):
                    for w in items:
                        if isinstance(w, str) and w and w not in warnings:
                            warnings.append(w)
        return warnings

    @classmethod
    def flatten_info(cls, api_response: dict) -> List[str]:
        """Extract info messages from a NP API response."""
        info_list: List[str] = []
        data = api_response.get("data", [])
        if isinstance(data, list) and data:
            first = data[0] if isinstance(data[0], dict) else {}
            for key in ("Info", "info"):
                items = first.get(key, [])
                if isinstance(items, list):
                    for i in items:
                        if isinstance(i, str) and i and i not in info_list:
                            info_list.append(i)
        return info_list

    @classmethod
    def is_success(cls, api_response: dict) -> bool:
        """Check if NP API response indicates success."""
        if not isinstance(api_response, dict):
            return False
        success = api_response.get("success", False)
        if isinstance(success, str):
            return success.lower() == "true"
        return bool(success)
