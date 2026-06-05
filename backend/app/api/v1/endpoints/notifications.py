from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.db import get_db

router = APIRouter()

class PushSubscriptionSchema(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

# In-memory store for demo. In production, store in DB.
subscriptions = []

@router.post("/subscribe")
async def subscribe(data: PushSubscriptionSchema):
    """Save push subscription for a user."""
    subscriptions.append(data.dict())
    return {"message": "Subscribed"}

@router.post("/test")
async def send_test():
    """Send a test notification (placeholder)."""
    # In production: send push via web-push library
    return {"message": "Test notification would be sent", "subscribers": len(subscriptions)}
