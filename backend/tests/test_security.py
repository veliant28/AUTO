import pytest
from app.core.security import verify_password, get_password_hash

def test_password_hashing():
    """Тест на уникальность хешей bcrypt"""
    password = "test123"
    hash1 = get_password_hash(password)
    hash2 = get_password_hash(password)
    assert hash1 != hash2, "Bcrypt hashes should be different for same password"

def test_password_verification():
    """Тест на проверку пароля"""
    password = "correct_password"
    hashed = get_password_hash(password)
    assert verify_password(password, hashed)
    assert not verify_password("wrong_password", hashed)

def test_different_passwords_different_hashes():
    """Тест на то, что разные пароли дают разные хеши"""
    password1 = "password123"
    password2 = "password456"
    hash1 = get_password_hash(password1)
    hash2 = get_password_hash(password2)
    assert hash1 != hash2
    assert verify_password(password1, hash1)
    assert not verify_password(password2, hash1)

def test_password_hash_rounds():
    """Тест на скорость хеширования (bcrypt имеет медленную операцию для защиты от brute force)"""
    password = "slow_password"
    start_time = __import__('time').time()
    hash_result = get_password_hash(password)
    end_time = __import__('time').time()
    process_time = end_time - start_time
    assert process_time > 0.001, "Bcrypt should be slow hashing (takes time)"

def test_empty_password():
    """Тест на пустой пароль"""
    hashed = get_password_hash("")
    assert verify_password("", hashed)

def test_special_characters_password():
    """Тест на пароль со специальными символами"""
    password = "P@ssw0rd!#$%^&*()_+-=[]{}|;:,.<>?"
    hashed = get_password_hash(password)
    assert verify_password(password, hashed)
    assert not verify_password("wrong_password", hashed)
