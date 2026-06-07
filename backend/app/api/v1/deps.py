from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.models import User
from app.api.v1.endpoints.auth import get_current_user

def require_role(*roles: str):
    def dependency(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(404, "User not found")
        if user.role.name not in roles:
            raise HTTPException(403, "Insufficient permissions")
        if not user.is_active:
            raise HTTPException(403, "Account is deactivated")
        return user
    return dependency
