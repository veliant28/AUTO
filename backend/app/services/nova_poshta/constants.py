"""
Nova Poshta API constants.
"""
from typing import Dict, List

# ─── API ───────────────────────────────────────────────────────────────────────
NOVA_POSHTA_API_URL: str = "https://api.novaposhta.ua/v2.0/json/"
NOVA_POSHTA_TIMEOUT: int = 30  # seconds
NOVA_POSHTA_MAX_RETRIES: int = 2

# ─── Status codes that are considered final (no more updates expected) ────────
NOVA_POSHTA_FINAL_STATUSES: List[str] = [
    "111",    # Отримана — Delivered
    "112",    # Отримана через поштомат — Delivered to postomat
    "113",    # Отримана особисто — Received in person
    "114",    # Отримана представником — Received by representative
    "115",    # Відмова — Refusal
    "116",    # Відмова через поштомат — Refusal via postomat
    "117",    # Відправлення вилучено — Shipment withdrawn
    "120",    # Відправлення знищено — Shipment destroyed
    "123",    # Відправлення повернено — Returned
    "124",    # Відправлення повернено за зворотною адресою — Returned to sender
]

# ─── Error codes that identify known NP API errors ────────────────────────────
# Base/common error codes
NOVA_POSHTA_BASE_ERRORS: Dict[str, str] = {
    "20000401001": "Помилка авторизації. Перевірте API ключ",
    "20000401002": "Невірний API ключ",
    "20000401003": "Доступ заборонено",
    "20000401004": "Недостатньо прав для виконання операції",
    "20000401120": "Відправлення з даним номером вже існує",
    "20000401121": "Відправлення не знайдено",
    "20000401122": "Відправлення вже видалено",
    "20000401123": "Неможливо редагувати відправлення в поточному статусі",
    "20000401130": "Некоректна вага відправлення",
    "20000401131": "Некоректна кількість місць",
    "20000401132": "Некоректна вартість відправлення",
    "20000401133": "Некоректне прізвище отримувача",
    "20000401134": "Некоректний телефон отримувача",
    "20000401135": "Некоректне місто отримувача",
    "20000401136": "Некоректна адреса отримувача",
    "20000401137": "Некоректний опис вантажу",
    "20000401140": "Некоректний тип платника",
    "20000401141": "Некоректний тип доставки",
    "20000401200": "Контрагента не знайдено",
    "20000401201": "Некоректні дані контрагента",
    "20000401300": "Населений пункт не знайдено",
    "20000401301": "Відділення не знайдено",
    "20000401302": "Вулицю не знайдено",
}

# Merge base errors with auto-generated full error codes
from app.services.nova_poshta.error_codes import NOVA_POSHTA_ERROR_CODES  # noqa
NOVA_POSHTA_ERROR_TRANSLATIONS: Dict[str, str] = {**NOVA_POSHTA_BASE_ERRORS, **NOVA_POSHTA_ERROR_CODES}

# ─── NP API model names ──────────────────────────────────────────────────────
MODEL_INTERNET_DOCUMENT = "InternetDocument"
MODEL_ADDRESS_GENERAL = "AddressGeneral"
MODEL_COUNTERPARTY = "Counterparty"
MODEL_ADDRESS = "Address"
MODEL_COMMON = "Common"
MODEL_TRACKING = "TrackingDocument"

# ─── NP API called methods ───────────────────────────────────────────────────
METHOD_SAVE = "save"
METHOD_UPDATE = "update"
METHOD_DELETE = "delete"
METHOD_GET_DOCUMENTS = "getDocumentList"
METHOD_GET_STATUS = "getStatusDocuments"
METHOD_GENERATE_REPORT = "generateReport"
METHOD_SEARCH_SETTLEMENTS = "searchSettlements"
METHOD_SEARCH_STREETS = "searchStreets"
METHOD_SEARCH_SETTLEMENT_STREETS = "searchSettlementStreets"
METHOD_GET_WAREHOUSES = "getWarehouses"
METHOD_GET_WAREHOUSE_TYPES = "getWarehouseTypes"
METHOD_GET_PACK_TYPES = "getPackList"
METHOD_GET_PACK_TYPES_SPECIAL = "getPackListSpecial"
METHOD_GET_TIME_INTERVALS = "getTimeIntervals"
METHOD_GET_DELIVERY_DATE = "getDeliveryDate"
METHOD_GET_COUNTERPARTIES = "getCounterparties"
METHOD_GET_COUNTERPARTY_OPTIONS = "getCounterpartyOptions"
METHOD_CHECKOUT_DOCUMENT = "checkoutDocument"
METHOD_CHECK_POSSIBLE_CREATE = "checkPossibilityCreateDocument"
METHOD_SAVE_COUNTERPARTY = "save"
METHOD_UPDATE_COUNTERPARTY = "update"
METHOD_GET_SERVICE_LIST = "getServiceList"


# ─── NP API model names ────────────────────────────────────────────────────
MODEL_COMMON = "Common"
MODEL_INTERNET_DOCUMENT = "InternetDocument"
MODEL_TRACKING = "TrackingDocument"
MODEL_COUNTERPARTY = "Counterparty"
MODEL_CONTACT_PERSON = "CounterpartyContactPerson"
MODEL_ADDITIONAL_SERVICE = "AdditionalService"
