"""
Resolves payer type and other payment-related rules for Nova Poshta waybills.

NP payer rules differ by delivery type (warehouse vs address), cargo type,
and whether the recipient has a contract with NP.
"""
from typing import Optional
from dataclasses import dataclass


@dataclass
class PaymentRuleResult:
    """Resolved payment rules for a waybill."""
    payer_type: str           # Sender | Recipient | ThirdPerson
    payment_method: str       # Cash | NonCash
    who_pays: str             # sender | recipient
    can_be_recipient: bool    # Whether Recipient-pay is allowed


class NovaPoshtaPaymentRuleResolver:
    """
    Determines the correct payer_type and payment_method based on
    delivery and cargo parameters.

    Default rules (NP API):
    - Warehouse → Recipient/Cash allowed
    - Address (doors) → Sender/NonCash typically
    - Postomat → varies
    - Cash on delivery → Recipient/Cash
    """

    @classmethod
    def resolve(
        cls,
        delivery_type: str = "warehouse",
        cargo_type: str = "Parcel",
        afterpayment_amount: Optional[str] = None,
        recipient_edrpou: Optional[str] = None,
    ) -> PaymentRuleResult:
        """
        Resolve payment rules heuristically.

        Arguments:
            delivery_type: warehouse | postomat | address
            cargo_type: Cargo | Parcel | Documents | TiresWheels | Pallet
            afterpayment_amount: if set, implies COD
            recipient_edrpou: if set, recipient is a legal entity (NonCash)
        """
        # Default: warehouse delivery, no COD
        if delivery_type == "warehouse":
            if afterpayment_amount and float(afterpayment_amount) > 0:
                # COD → Recipient pays
                return PaymentRuleResult(
                    payer_type="Recipient",
                    payment_method="Cash",
                    who_pays="recipient",
                    can_be_recipient=True,
                )
            # Regular warehouse → either side can pay
            return PaymentRuleResult(
                payer_type="Recipient",
                payment_method="Cash",
                who_pays="recipient",
                can_be_recipient=True,
            )

        elif delivery_type == "postomat":
            # Postomat → Sender pays (NonCash typically)
            return PaymentRuleResult(
                payer_type="Sender",
                payment_method="NonCash",
                who_pays="sender",
                can_be_recipient=False,
            )

        elif delivery_type == "address":
            # Address delivery (doors) → Sender pays NonCash
            # Unless recipient is legal entity with contract
            if recipient_edrpou:
                return PaymentRuleResult(
                    payer_type="Recipient",
                    payment_method="NonCash",
                    who_pays="recipient",
                    can_be_recipient=True,
                )
            return PaymentRuleResult(
                payer_type="Sender",
                payment_method="NonCash",
                who_pays="sender",
                can_be_recipient=False,
            )

        # Fallback
        return PaymentRuleResult(
            payer_type="Recipient",
            payment_method="Cash",
            who_pays="recipient",
            can_be_recipient=True,
        )

    @classmethod
    def can_edit_payer(cls, waybill_status_code: str) -> bool:
        """Check if payer can be changed in current status."""
        # Once delivered or in transit beyond a certain point, payer is locked
        locked_statuses = {"111", "112", "113", "114", "115", "116", "117",
                           "120", "123", "124", "125", "7", "8", "9", "10"}
        return waybill_status_code not in locked_statuses
