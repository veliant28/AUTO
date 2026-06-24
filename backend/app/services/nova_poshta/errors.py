"""
Nova Poshta custom exceptions.
"""


class NovaPoshtaError(Exception):
    """Base exception for Nova Poshta integration."""
    pass


class NovaPoshtaApiError(NovaPoshtaError):
    """Raised when NP API returns an error response."""

    SEVERITY_ERROR = "error"
    SEVERITY_WARNING = "warning"
    SEVERITY_INFO = "info"

    def __init__(self, message: str, status_code: int = 0, errors: list = None, severity: str = "error"):
        self.status_code = status_code
        self.errors = errors or []
        self.severity = severity
        super().__init__(message)


class NovaPoshtaValidationError(NovaPoshtaError):
    """Raised when input validation fails before sending to API."""
    pass


class NovaPoshtaSenderNotFoundError(NovaPoshtaError):
    """Raised when the requested sender profile does not exist."""
    pass


class NovaPoshtaWaybillNotFoundError(NovaPoshtaError):
    """Raised when the requested waybill does not exist."""
    pass


class NovaPoshtaTokenMaskedError(NovaPoshtaError):
    """Raised when trying to use a sender profile whose token is masked."""
    pass
