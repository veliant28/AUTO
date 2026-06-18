import os
import tempfile
import pytest
from app.services.crypto_util import encrypt_password, decrypt_password


class TestCryptoUtil:
    def test_encrypt_decrypt_roundtrip(self, tmp_path):
        original = "my_secret_password_123!"
        encrypted = encrypt_password(original)
        assert encrypted != original
        decrypted = decrypt_password(encrypted)
        assert decrypted == original

    def test_different_passwords_different_output(self, tmp_path):
        e1 = encrypt_password("pass1")
        e2 = encrypt_password("pass2")
        assert e1 != e2

    def test_decrypt_empty_returns_empty(self, tmp_path):
        assert decrypt_password("") == ""

    def test_encrypt_unicode(self, tmp_path):
        original = "пароль_üñîçødē"
        encrypted = encrypt_password(original)
        decrypted = decrypt_password(encrypted)
        assert decrypted == original
