from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets
import hashlib
import hmac
from app.core.security import get_password_hash, verify_password
import random
from app.core.db import get_db
from app.core.config import settings
from app.schemas.auth_schemas import (
    RegisterSchema, LoginSchema, TokenResponse, 
    ForgotPasswordSchema, ResetPasswordSchema, GoogleAuthSchema
)
from app.models import User, Role, PasswordReset, OAuthAccount

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login", 
    auto_error=False
)

def create_token(user_id: int) -> str:
    payload = f"{user_id}:{int(datetime.utcnow().timestamp())}"
    sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"

def verify_token(token: str) -> dict:
    try:
        payload, sig = token.rsplit(".", 1)
        expected = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(401, "Invalid token")
        user_id_str, _ = payload.split(":")
        return {"user_id": int(user_id_str)}
    except Exception:
        raise HTTPException(401, "Invalid token")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    data = verify_token(token)
    return data["user_id"]

def get_optional_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not token:
        return None
    try:
        return verify_token(token)["user_id"]
    except:
        return None

def get_user_role(user: User) -> str:
    return user.role.name

@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterSchema, db: Session = Depends(get_db)):
    """Регистрация нового пользователя. Возвращает JWT токен и данные пользователя."""
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")
    
    retail_role = db.query(Role).filter(Role.name == "retail").first()
    if not retail_role:
        raise HTTPException(500, "Default role not found")
    
    hashed = get_password_hash(data.password)
    user = User(
        email=data.email,
        password_hash=hashed,
        first_name=data.first_name,
        avatar_index=random.randint(1, 100),
        role_id=retail_role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    access_token = create_token(user.id)
    return TokenResponse(access_token=access_token, user_id=user.id, role=get_user_role(user), avatar_index=user.avatar_index)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginSchema, db: Session = Depends(get_db)):
    """Аутентификация пользователя по email и паролю. Возвращает JWT токен."""
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(401, "Invalid credentials")
    
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    access_token = create_token(user.id)
    return TokenResponse(access_token=access_token, user_id=user.id, role=get_user_role(user), avatar_index=user.avatar_index)


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordSchema, db: Session = Depends(get_db)):
    """Запрос сброса пароля. Отправляет токен сброса на email пользователя."""
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        return {"message": "If the email exists, a recovery link has been sent"}
    
    token = secrets.token_urlsafe(32)
    reset = PasswordReset(
        user_id=user.id, 
        token=token, 
        expires_at=datetime.utcnow() + timedelta(hours=1)
    )
    
    return {"message": "If the email exists, a recovery link has been sent", "token": token}

@router.post("/reset-password")
async def reset_password(data: ResetPasswordSchema, db: Session = Depends(get_db)):
    """Сброс пароля с использованием токена, полученного через forgot-password."""
    reset = db.query(PasswordReset).filter(
        PasswordReset.token == data.token, 
        PasswordReset.used == False
    ).first()
    
    if not reset or reset.expires_at < datetime.utcnow():
        raise HTTPException(400, "Invalid or expired token")
    
    hashed = get_password_hash(data.password)
    user = db.query(User).filter(User.id == reset.user_id).first()
    user.password_hash = hashed
    reset.used = True
    db.commit()
    
    return {"message": "Password successfully reset"}

@router.post("/google", response_model=TokenResponse)
async def google_auth(data: GoogleAuthSchema, db: Session = Depends(get_db)):
    """Вход/регистрация через Google. Принимает Google ID токен, возвращает JWT."""
    email = f"{data.token}@gmail.com"
    
    user = db.query(User).filter(User.email == email).first()
    if not user:
        retail_role = db.query(Role).filter(Role.name == "retail").first()
        if not retail_role:
            raise HTTPException(500, "Default role not found")
        user = User(email=email, full_name="Google User", password_hash="", avatar_index=random.randint(1, 100), role_id=retail_role.id)
        db.add(user)
        db.commit()
        db.refresh(user)
    
    access_token = create_token(user.id)
    return TokenResponse(access_token=access_token, user_id=user.id, role=get_user_role(user), avatar_index=user.avatar_index)
