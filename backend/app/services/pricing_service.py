from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text, func, and_
from sqlalchemy.orm import joinedload
from typing import Optional, List
from app.models.pricing import PriceRule, PriceRuleHistory
from app.models.parts import PartCategory


def calculate_final_price(base_price: Decimal, margin_percent: Decimal) -> Decimal:
    """Calculate final price given base price and margin percent."""
    if base_price is None:
        return None
    return base_price * (Decimal(1) + margin_percent / Decimal(100))


def resolve_margin(db: Session, category_id: Optional[int]) -> Optional[Decimal]:
    """
    Resolve margin for a given category.
    Priority: category rule (if >0) > general rule.
    Returns margin_percent or None if no active rule.
    """
    if category_id:
        cat_rule = db.query(PriceRule).filter(
            and_(
                PriceRule.type == "category",
                PriceRule.category_id == category_id,
                PriceRule.is_active == True
            )
        ).first()
        if cat_rule and cat_rule.margin_percent and cat_rule.margin_percent > 0:
            return cat_rule.margin_percent
    
    general_rule = db.query(PriceRule).filter(
        and_(
            PriceRule.type == "general",
            PriceRule.is_active == True
        )
    ).first()
    if general_rule:
        return general_rule.margin_percent
    
    return None


def apply_margins_bulk(db: Session, part_ids: Optional[List[int]] = None) -> int:
    """
    Bulk apply margins to supplier_offers.
    Uses raw SQL for performance (~235K items).
    Returns number of updated rows.
    """
    where_clause = ""
    params = {}
    if part_ids:
        where_clause = "WHERE so.part_id = ANY(:part_ids)"
        params["part_ids"] = part_ids
    
    sql = text(f"""
        UPDATE supplier_offers so
        SET final_price = CASE
            WHEN cat_rule.margin_percent IS NOT NULL AND cat_rule.margin_percent > 0
                THEN so.price * (1 + cat_rule.margin_percent / 100)
            WHEN gen_rule.margin_percent IS NOT NULL
                THEN so.price * (1 + gen_rule.margin_percent / 100)
            ELSE so.price
        END
        FROM parts p
        LEFT JOIN price_rules cat_rule 
            ON p.category_id = cat_rule.category_id 
            AND cat_rule.type = 'category' 
            AND cat_rule.is_active = true
        LEFT JOIN price_rules gen_rule 
            ON gen_rule.type = 'general' 
            AND gen_rule.is_active = true
        WHERE so.part_id = p.id
        {where_clause}
    """)
    
    result = db.execute(sql, params)
    db.commit()
    return result.rowcount


def get_or_create_general_rule(db: Session) -> PriceRule:
    rule = db.query(PriceRule).filter(PriceRule.type == "general").first()
    if not rule:
        rule = PriceRule(type="general", margin_percent=Decimal(0), is_active=True)
        db.add(rule)
        db.commit()
        db.refresh(rule)
    return rule


def get_or_create_category_rule(db: Session, category_id: int) -> PriceRule:
    rule = db.query(PriceRule).filter(
        and_(
            PriceRule.type == "category",
            PriceRule.category_id == category_id
        )
    ).first()
    if not rule:
        rule = PriceRule(type="category", category_id=category_id, margin_percent=Decimal(0), is_active=True)
        db.add(rule)
        db.commit()
        db.refresh(rule)
    return rule


def update_rule(db: Session, rule: PriceRule, new_margin: Decimal) -> None:
    """Update rule margin and record history."""
    old_margin = rule.margin_percent
    if old_margin != new_margin:
        history = PriceRuleHistory(
            price_rule_id=rule.id,
            old_percent=old_margin,
            new_percent=new_margin
        )
        db.add(history)
        rule.margin_percent = new_margin
        db.commit()
        db.refresh(rule)


def cleanup_old_history(db: Session, days: int = 30) -> int:
    """Delete history older than N days."""
    result = db.query(PriceRuleHistory).filter(
        PriceRuleHistory.changed_at < func.now() - func.interval(f'{days} days')
    ).delete(synchronize_session=False)
    db.commit()
    return result


def get_category_rules_with_names(db: Session):
    """Get all categories with their active margin rules."""
    from sqlalchemy.orm import aliased
    
    categories = db.query(PartCategory).all()
    rules = {
        r.category_id: r for r in db.query(PriceRule).filter(
            PriceRule.type == "category"
        ).all()
    }
    
    result = []
    for cat in categories:
        rule = rules.get(cat.id)
        result.append({
            "category_id": cat.id,
            "category_name": cat.name,
            "margin_percent": float(rule.margin_percent) if rule else None,
            "is_active": rule.is_active if rule else False,
        })
    return result
