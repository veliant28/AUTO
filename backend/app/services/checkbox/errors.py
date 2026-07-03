class CheckboxError(Exception):
    """Base Checkbox error."""
    pass


class CheckboxApiError(CheckboxError):
    """Checkbox API returned an error response."""
    def __init__(self, message: str, status_code: int = 0, errors: list = None):
        self.status_code = status_code
        self.errors = errors or []
        super().__init__(message)


class CheckboxAuthError(CheckboxError):
    """Checkbox authentication failed."""
    pass


class CheckboxValidationError(CheckboxError):
    """Invalid request data for Checkbox."""
    pass


class CheckboxSettingsError(CheckboxError):
    """Checkbox not configured in site settings."""
    pass
