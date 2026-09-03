"""LiqPay integration per official API v7 docs (sha3-256, POST form checkout, form webhook)."""
import base64
import json
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models import SiteSettings, User
from app.models.orders import Order, OrderStatus
from app.models.payments import PaymentTransaction
from app.services.crypto_util import encrypt_password
from app.services.payments.errors import PaymentProviderError
from app.services.payments.liqpay import LiqpayPaymentProvider

PUB = "sandbox_i123456789"
PRIV = "sandbox_priv_1234567890"


def _settings(db: Session) -> SiteSettings:
    s = SiteSettings(
        liqpay_public_key_encrypted=encrypt_password(PUB),
        liqpay_private_key_encrypted=encrypt_password(PRIV),
        payment_liqpay_enabled=True,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _order(db: Session, user: User, total: str = "540.00", status=None) -> Order:
    o = Order(
        user_id=user.id,
        order_number="LP-1",
        total=Decimal(total),
        full_name="Test User",
        phone="+380501234567",
        payment_method="liqpay",
        status=status or OrderStatus.PENDING,
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


def _tx(db: Session, order: Order, order_id_str: str, amount: str = "540.00") -> PaymentTransaction:
    tx = PaymentTransaction(
        order_id=order.id,
        payment_method="liqpay",
        amount=Decimal(amount),
        status="pending",
        provider_tx_id=order_id_str,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def _callback_payload(order_id: str, amount: str = "540.00", status: str = "success",
                      currency: str = "UAH", **extra) -> dict:
    provider = LiqpayPaymentProvider(PUB, PRIV)
    data = {
        "version": 7,
        "public_key": PUB,
        "action": "pay",
        "amount": amount,
        "currency": currency,
        "order_id": order_id,
        "status": status,
        "payment_id": 987654321,
        "invoice_url": "https://www.liqpay.ua/invoice/abc",
        "receipt_url": "https://www.liqpay.ua/receipt/abc",
        **extra,
    }
    data_b64 = provider._encode_data(data)
    return {"data": data_b64, "signature": provider._sign(data_b64)}


def _post_webhook(client, form: dict):
    return client.post(
        "/api/v1/payments/webhook/liqpay",
        data=form,
    )


# ---------------------------------------------------------------------------
# Единица: data/подпись/форма по докам v7
# ---------------------------------------------------------------------------

def test_signature_formula_sha3_256():
    provider = LiqpayPaymentProvider(PUB, PRIV)
    data_b64 = base64.b64encode(b'{"version":7}').decode()
    expected = base64.b64encode(
        __import__("hashlib").sha3_256(
            (PRIV + data_b64 + PRIV).encode("utf-8")
        ).digest()
    ).decode()
    assert provider._sign(data_b64) == expected


async def test_create_payment_builds_official_checkout_form():
    provider = LiqpayPaymentProvider(PUB, PRIV)
    result = await provider.create_payment(
        amount=10,
        order_id=42,
        description="Order #42",
        webhook_url="https://shop.example/api/v1/payments/webhook/liqpay",
        return_url="https://shop.example/orders/42",
    )
    form = result.payment_form
    assert form["action"] == "https://www.liqpay.ua/api/3/checkout"
    assert form["method"] == "POST"
    data_b64 = form["fields"]["data"]
    # подпись формы = base64(sha3-256(priv + data + priv))
    assert form["fields"]["signature"] == provider._sign(data_b64)
    assert provider._verify_signature(data_b64, form["fields"]["signature"])

    decoded = json.loads(base64.b64decode(data_b64).decode("utf-8"))
    assert decoded["version"] == 7
    assert decoded["public_key"] == PUB
    assert decoded["action"] == "pay"
    assert decoded["amount"] == "10.00"  # строка с двумя знаками, как в примерах доков
    assert decoded["currency"] == "UAH"
    assert decoded["order_id"] == result.tx_id
    assert decoded["server_url"] == "https://shop.example/api/v1/payments/webhook/liqpay"
    assert decoded["result_url"] == "https://shop.example/orders/42"

    # GET-ссылка — справочная, с urlencoded параметрами
    assert result.payment_url.startswith("https://www.liqpay.ua/api/3/checkout?data=")
    assert "+" not in result.payment_url.split("?")[1].split("&")[0].replace("%2B", "")


async def test_process_webhook_verifies_signature():
    provider = LiqpayPaymentProvider(PUB, PRIV)
    good = _callback_payload("order-42-0001")
    res = await provider.process_webhook(good)
    assert res.status == "paid"
    assert res.provider_tx_id == "order-42-0001"
    assert res.raw["payment_id"] == 987654321

    bad = dict(good)
    bad["signature"] = "AAAA"
    with pytest.raises(PaymentProviderError):
        await provider.process_webhook(bad)


# ---------------------------------------------------------------------------
# Вебхук form-urlencoded: полный цикл
# ---------------------------------------------------------------------------

def test_webhook_marks_paid_and_confirms_order(client, db: Session, test_user, admin_headers):
    _settings(db)
    order = _order(db, test_user)
    order_id_str = "order-42-0001"
    _tx(db, order, order_id_str)

    # LiqPay шлёт form-urlencoded
    r = _post_webhook(client, _callback_payload(order_id_str))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok"
    assert body["payment_status"] == "paid"

    db.refresh(order)
    assert order.status == OrderStatus.CONFIRMED
    tx = db.query(PaymentTransaction).filter(PaymentTransaction.order_id == order.id).first()
    assert tx.status == "paid"
    assert tx.receipt_url == "https://www.liqpay.ua/receipt/abc"

    # Повторный колбэк — идемпотентно
    r2 = _post_webhook(client, _callback_payload(order_id_str))
    assert r2.status_code == 200
    db.refresh(tx)
    assert tx.status == "paid"


def test_webhook_ignores_mismatches(client, db: Session, test_user):
    _settings(db)
    order = _order(db, test_user)
    order_id_str = "order-42-0001"
    tx = _tx(db, order, order_id_str)

    # чужая сумма
    r = _post_webhook(client, _callback_payload(order_id_str, amount="539.00"))
    assert r.json()["status"] == "ignored"
    # чужой order_id
    r = _post_webhook(client, _callback_payload("order-99-0001"))
    assert r.json()["status"] == "ignored"
    # неверная подпись
    bad = _callback_payload(order_id_str)
    bad["signature"] = "tampered"
    r = _post_webhook(client, bad)
    assert r.json()["status"] == "ignored"
    # не-UAH валюта
    r = _post_webhook(client, _callback_payload(order_id_str, currency="USD"))
    assert r.json()["status"] == "ignored"

    db.refresh(tx)
    assert tx.status == "pending"
    db.refresh(order)
    assert order.status == OrderStatus.PENDING


def test_webhook_failure_status(client, db: Session, test_user):
    _settings(db)
    order = _order(db, test_user)
    order_id_str = "order-42-0001"
    tx = _tx(db, order, order_id_str)

    r = _post_webhook(client, _callback_payload(order_id_str, status="failure"))
    assert r.status_code == 200
    assert r.json()["payment_status"] == "failed"
    db.refresh(tx)
    assert tx.status == "failed"
    db.refresh(order)
    assert order.status == OrderStatus.PENDING  # не оплачен — не подтверждаем
