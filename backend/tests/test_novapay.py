"""NovaPay Internet Acquiring integration tests (official /v1 API, x-sign-v2 postbacks)."""
import base64
import json
from decimal import Decimal

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from sqlalchemy.orm import Session

from app.models import SiteSettings, User
from app.models.orders import Order, OrderStatus
from app.models.payments import PaymentTransaction
from app.services.crypto_util import encrypt_password
from app.services.payments.errors import PaymentProviderError
from app.services.payments.novapay import NovaPayPaymentProvider

MERCHANT_ID = 42


@pytest.fixture
def rsa_keys():
    """(merchant_private_pem, merchant_public_pem, novapay_private_pem, novapay_public_pem)"""
    out = {}
    for name in ("merchant", "novapay"):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        priv_pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
        pub_pem = key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()
        out[f"{name}_priv"] = priv_pem
        out[f"{name}_pub"] = pub_pem
    return out


def _sign_body(body: str, priv_pem: str) -> str:
    key = serialization.load_pem_private_key(priv_pem.encode(), password=None)
    sig = key.sign(body.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(sig).decode()


def _postback_sign(postback: dict, novapay_priv: str) -> tuple[bytes, str]:
    raw = json.dumps(postback, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return raw, _sign_body(raw.decode("utf-8"), novapay_priv)


def _settings(db: Session, rsa_keys) -> SiteSettings:
    s = SiteSettings(
        novapay_merchant_id=str(MERCHANT_ID),
        novapay_private_key_encrypted=encrypt_password(rsa_keys["merchant_priv"]),
        novapay_public_key=rsa_keys["novapay_pub"],
        novapay_is_test=True,
        payment_novapay_enabled=True,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _order(db: Session, user: User, total: str = "540.00") -> Order:
    o = Order(
        user_id=user.id,
        order_number="NP-1",
        total=Decimal(total),
        full_name="Test User",
        phone="+380501112233",
        first_name="Тест",
        last_name="Юзер",
        payment_method="novapay",
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


def _tx(db: Session, order: Order, session_id: str) -> PaymentTransaction:
    tx = PaymentTransaction(
        order_id=order.id,
        payment_method="novapay",
        amount=order.total,
        status="pending",
        provider_tx_id=session_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


# ---------------------------------------------------------------------------
# Единица: подпись, endpoints, статусы
# ---------------------------------------------------------------------------

async def test_create_payment_uses_official_endpoints_and_units(rsa_keys, monkeypatch):
    provider = NovaPayPaymentProvider(MERCHANT_ID, rsa_keys["merchant_priv"], is_test=True)
    calls = []

    async def fake_request(method, path, payload):
        calls.append((method, path, payload))
        if path == "/v1/session":
            return {"id": "sess-123"}
        if path == "/v1/payment":
            return {"url": "https://pay.novapay.ua/abc"}
        return {}

    monkeypatch.setattr(provider, "_request", fake_request)
    result = await provider.create_payment(
        amount=540,
        order_id=7,
        description="Заказ #7",
        webhook_url="https://shop.example/api/v1/payments/webhook/novapay",
        return_url="https://shop.example/orders/7",
        client_phone="+380501112233",
        client_first_name="Тест",
        client_last_name="Юзер",
    )

    assert [c[0:2] for c in calls] == [("POST", "/v1/session"), ("POST", "/v1/payment")]
    session_payload, payment_payload = calls[0][2], calls[1][2]

    assert session_payload["client_phone"] == "+380501112233"
    assert session_payload["callback_url"] == "https://shop.example/api/v1/payments/webhook/novapay"
    assert session_payload["success_url"] == "https://shop.example/orders/7"
    assert session_payload["metadata"] == {"order_id": "7"}

    # сумма — float в гривнах (НЕ копейки)
    assert payment_payload["amount"] == 540.0
    assert payment_payload["external_id"] == "order-7"
    assert payment_payload["products"][0]["price"] == 540.0

    assert result.tx_id == "sess-123"
    assert result.payment_url == "https://pay.novapay.ua/abc"


async def test_postback_signature_verified_over_raw_body(rsa_keys):
    provider = NovaPayPaymentProvider(
        MERCHANT_ID, rsa_keys["merchant_priv"], public_key_pem=rsa_keys["novapay_pub"]
    )
    postback = {
        "id": "sess-123",
        "status": "paid",
        "metadata": {"order_id": "7"},
        "payments": [{"external_id": "order-7", "amount": 540.0}],
    }
    raw, sig = _postback_sign(postback, rsa_keys["novapay_priv"])

    # подпись по сырому телу верна
    res = await provider.process_webhook({"raw": raw, "signature": sig, "payload": dict(postback)})
    assert res.status == "paid"
    assert res.provider_tx_id == "sess-123"

    # изменённое (пересобранное) тело не проходит — подпись считается по raw bytes
    tampered = json.dumps(
        {**postback, "status": "failed"}, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    with pytest.raises(PaymentProviderError):
        await provider.process_webhook({"raw": tampered, "signature": sig})

    # неверная подпись
    with pytest.raises(PaymentProviderError):
        await provider.process_webhook({"raw": raw, "signature": "AAAA"})

    # нет публичного ключа — конфигурационная ошибка
    bare = NovaPayPaymentProvider(MERCHANT_ID, rsa_keys["merchant_priv"])
    with pytest.raises(PaymentProviderError):
        await bare.process_webhook({"raw": raw, "signature": sig})


async def test_status_map_keeps_hold_confirmed_pending(rsa_keys):
    provider = NovaPayPaymentProvider(MERCHANT_ID, rsa_keys["merchant_priv"],
                                      public_key_pem=rsa_keys["novapay_pub"])
    for liq_status, mapped in [
        ("paid", "paid"),
        ("holded", "pending"),
        ("hold_confirmed", "pending"),
        ("failed", "failed"),
        ("voided", "refunded"),
        ("expired", "expired"),
    ]:
        raw, sig = _postback_sign({"id": "s1", "status": liq_status}, rsa_keys["novapay_priv"])
        res = await provider.process_webhook({"raw": raw, "signature": sig})
        assert res.status == mapped, liq_status


# ---------------------------------------------------------------------------
# Вебхук: полный цикл через эндпоинт (raw body + x-sign-v2)
# ---------------------------------------------------------------------------

def _post_novapay_webhook(client, raw: bytes, signature: str):
    return client.post(
        "/api/v1/payments/webhook/novapay",
        content=raw,
        headers={
            "Content-Type": "application/json",
            "x-sign-v2": signature,
        },
    )


def test_webhook_marks_paid_and_confirms_order(
    client, db: Session, test_user, rsa_keys
):
    _settings(db, rsa_keys)
    order = _order(db, test_user)
    session_id = "sess-e2e-1"
    _tx(db, order, session_id)

    postback = {
        "id": session_id,
        "status": "paid",
        "metadata": {"order_id": str(order.id)},
        "payments": [{"external_id": f"order-{order.id}", "amount": 540.0}],
    }
    raw, sig = _postback_sign(postback, rsa_keys["novapay_priv"])

    r = _post_novapay_webhook(client, raw, sig)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ok"
    assert r.json()["payment_status"] == "paid"

    db.refresh(order)
    assert order.status == OrderStatus.CONFIRMED
    tx = db.query(PaymentTransaction).filter(PaymentTransaction.order_id == order.id).first()
    assert tx.status == "paid"

    # повторный постбек — идемпотентно
    r2 = _post_novapay_webhook(client, raw, sig)
    assert r2.status_code == 200
    db.refresh(tx)
    assert tx.status == "paid"


def test_webhook_ignores_bad_signature_and_mismatches(
    client, db: Session, test_user, rsa_keys
):
    _settings(db, rsa_keys)
    order = _order(db, test_user)
    session_id = "sess-e2e-2"
    tx = _tx(db, order, session_id)

    def post(postback: dict):
        raw, sig = _postback_sign(postback, rsa_keys["novapay_priv"])
        return _post_novapay_webhook(client, raw, sig)

    # чужая сумма
    bad_amount = {"id": session_id, "status": "paid",
                  "metadata": {"order_id": str(order.id)},
                  "payments": [{"external_id": "x", "amount": 1.0}]}
    assert post(bad_amount).json()["status"] == "ignored"
    # чужой order_id в metadata
    bad_order = {"id": session_id, "status": "paid",
                 "metadata": {"order_id": "999999"},
                 "payments": [{"amount": 540.0}]}
    assert post(bad_order).json()["status"] == "ignored"
    # кривая подпись
    raw, _ = _postback_sign({"id": session_id, "status": "paid"}, rsa_keys["novapay_priv"])
    assert _post_novapay_webhook(client, raw, "tampered").json()["status"] == "ignored"
    # чужая сессия (нет транзакции)
    assert post({"id": "sess-unknown", "status": "paid",
                 "payments": [{"amount": 540.0}]}).json()["status"] == "ignored"

    db.refresh(tx)
    assert tx.status == "pending"
    db.refresh(order)
    assert order.status == OrderStatus.PENDING
