from pydantic import BaseModel
from typing import Optional

class FooterData(BaseModel):
    description: Optional[str] = None
    copyright: Optional[str] = None
    about: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_address: Optional[str] = None
    faq: Optional[str] = None
    faq_q1: Optional[str] = None
    faq_a1: Optional[str] = None
    faq_q2: Optional[str] = None
    faq_a2: Optional[str] = None
    faq_q3: Optional[str] = None
    faq_a3: Optional[str] = None
    faq_q4: Optional[str] = None
    faq_a4: Optional[str] = None
    faq_q5: Optional[str] = None
    faq_a5: Optional[str] = None
    delivery_courier: Optional[str] = None
    delivery_pickup: Optional[str] = None
    delivery_timing: Optional[str] = None
    support_chat: Optional[str] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    terms_general: Optional[str] = None
    terms_copyright: Optional[str] = None
    terms_personal: Optional[str] = None
    terms_liability: Optional[str] = None

class FooterResponse(BaseModel):
    locale: str
    data: FooterData

class FooterUpdate(BaseModel):
    data: FooterData
