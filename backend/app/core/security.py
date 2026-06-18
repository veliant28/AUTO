from passlib.context import CryptContext

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля с bcrypt"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Хеширование пароля с bcrypt"""
    return pwd_context.hash(password)

def verify_token_signature(token: str, secret_key: str) -> bool:
    """Проверка подписи JWT токена"""
    try:
        payload, sig = token.rsplit(".", 1)
        expected = pwd_context.hash(f"{payload}.{secret_key}")
        return pwd_context.verify(sig, expected)
    except:
        return False
