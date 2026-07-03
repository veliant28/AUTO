class PaymentError(Exception):
    """Base payment error."""
    pass


class PaymentProviderError(PaymentError):
    """Payment provider API returned an error."""
    def __init__(self, message: str, provider: str = "", status_code: int = 0):
        self.provider = provider
        self.status_code = status_code
        super().__init__(message)


class PaymentValidationError(PaymentError):
    """Invalid payment request data."""
    pass


class PaymentSettingsError(PaymentError):
    """Payment provider not configured."""
    pass


class PaymentAlreadyCompletedError(PaymentError):
    """Order already has a completed payment."""
    pass
