"""Analyze all product categorizations and find mismatches."""
from app.core.db import SessionLocal
from app.models.parts import Part, PartCategory
from app.models.tecdoc import SupplierPrice
from app.services.gpl_categories import GPL_CATEGORY_MAP
from collections import defaultdict

db = SessionLocal()
cat_names = {c.id: c.name for c in db.query(PartCategory).all()}

tecdoc_to_cat = {}
for cat in db.query(PartCategory).all():
    if cat.tecdoc_id:
        tecdoc_to_cat[cat.tecdoc_id] = cat.id

gpl_stats = defaultdict(lambda: {'total': 0, 'current': defaultdict(int), 'correct': defaultdict(int)})

for p in db.query(Part).filter(Part.category_id.isnot(None)).all():
    sp = db.query(SupplierPrice).filter(
        SupplierPrice.supplier == 'GPL',
        SupplierPrice.article == p.article,
        SupplierPrice.brand == p.brand
    ).first()
    if not sp or not sp.category:
        continue
    gpl = sp.category
    gpl_stats[gpl]['total'] += 1
    gpl_stats[gpl]['current'][p.category_id] += 1
    tid = GPL_CATEGORY_MAP.get(gpl)
    if tid:
        cid = tecdoc_to_cat.get(tid)
        if cid:
            gpl_stats[gpl]['correct'][cid] += 1

print("=== MISMATCHED CATEGORIES ===\n")
for gpl, st in sorted(gpl_stats.items(), key=lambda x: -x[1]['total']):
    cur = st['current']
    cor = st['correct']
    mc = max(cur, key=cur.get)
    mcn = cat_names.get(mc, '?')
    mco = max(cor, key=cor.get) if cor else None
    mcon = cat_names.get(mco, '?') if mco else 'NONE'
    if mco and mc != mco:
        print(f'GPL="{gpl}" ({st["total"]} товаров)')
        print(f'  Сейчас: \"{mcn}\" (id={mc})')
        print(f'  Должно: \"{mcon}\" (id={mco})')
        print()

print("\n=== CORRECT CATEGORIES ===\n")
for gpl, st in sorted(gpl_stats.items(), key=lambda x: -x[1]['total']):
    cur = st['current']
    cor = st['correct']
    mc = max(cur, key=cur.get)
    mco = max(cor, key=cor.get) if cor else None
    mcn = cat_names.get(mc, '?')
    if mco and mc == mco:
        print(f'✅ {gpl} ({st["total"]}) → \"{mcn}\"')

print(f'\nTotal GPL categories: {len(gpl_stats)}')
db.close()
