from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.db import get_db
from app.models import CartItem, Part, SupplierOffer, Supplier
from app.schemas.cart_schemas import CartItemSchema, CartAddSchema, CartUpdateSchema

router = APIRouter()

# Mock current user (for dev)
def get_current_user():
    return 1

@router.get("/", response_model=List[CartItemSchema])
async def get_cart(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(CartItem).filter(CartItem.user_id == user_id).all()
    
    result = []
    for item in items:
        part = db.query(Part).filter(Part.id == item.part_id).first()
        offer = db.query(SupplierOffer).filter(SupplierOffer.id == item.supplier_offer_id).first() if item.supplier_offer_id else None
        supplier = db.query(Supplier).filter(Supplier.id == offer.supplier_id).first() if offer else None
        
        result.append({
            "id": item.id,
            "part_id": item.part_id,
            "article": part.article if part else "",
            "part_name": part.name if part else "",
            "quantity": item.quantity,
            "price": float(offer.price) if offer else None,
            "supplier_name": supplier.name if supplier else None,
        })
    return result

@router.post("/add")
async def add_to_cart(
    data: CartAddSchema,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(CartItem).filter(
        CartItem.user_id == user_id,
        CartItem.part_id == data.part_id,
    ).first()
    
    if existing:
        existing.quantity += data.quantity
    else:
        item = CartItem(
            user_id=user_id,
            part_id=data.part_id,
            quantity=data.quantity,
            supplier_offer_id=data.supplier_offer_id,
        )
        db.add(item)
    
    db.commit()
    return {"message": "Item added to cart"}

@router.put("/{item_id}")
async def update_cart_item(
    item_id: int,
    data: CartUpdateSchema,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(CartItem).filter(CartItem.id == item_id, CartItem.user_id == user_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.quantity = data.quantity
    db.commit()
    return {"message": "Quantity updated"}

@router.delete("/{item_id}")
async def remove_from_cart(
    item_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(CartItem).filter(CartItem.id == item_id, CartItem.user_id == user_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"message": "Item removed"}

@router.delete("/")
async def clear_cart(user_id: int = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(CartItem).filter(CartItem.user_id == user_id).delete()
    db.commit()
    return {"message": "Cart cleared"}
