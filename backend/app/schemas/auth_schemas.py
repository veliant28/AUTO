from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class RegisterSchema(BaseModel):
    email: EmailStr
    password: str
    first_name: Optional[str] = None

class LoginSchema(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: str

class ForgotPasswordSchema(BaseModel):
    email: EmailStr

class ResetPasswordSchema(BaseModel):
    token: str
    password: str

class GoogleAuthSchema(BaseModel):
    token: str
