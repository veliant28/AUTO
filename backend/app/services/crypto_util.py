from cryptography.fernet import Fernet
import os

_KEY_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".fernet_key")


def _get_or_create_key() -> bytes:
    if os.path.exists(_KEY_FILE):
        with open(_KEY_FILE, "rb") as f:
            return f.read()
    key = Fernet.generate_key()
    with open(_KEY_FILE, "wb") as f:
        f.write(key)
    return key


def encrypt_password(password: str) -> str:
    key = _get_or_create_key()
    f = Fernet(key)
    return f.encrypt(password.encode()).decode()


def decrypt_password(encrypted: str) -> str:
    if not encrypted:
        return ""
    key = _get_or_create_key()
    f = Fernet(key)
    return f.decrypt(encrypted.encode()).decode()
