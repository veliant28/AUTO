import pytest
from app.services.sku_generator import generate_sku, bulk_generate_skus
from app.models.tecdoc import SupplierPrice


class TestGenerateSku:
    def test_generates_string(self, db):
        sku = generate_sku(db)
        assert isinstance(sku, str)
        assert len(sku) <= 16
        assert len(sku) > 0

    def test_generates_unique(self, db):
        skus = {generate_sku(db) for _ in range(10)}
        assert len(skus) == 10

    def test_generated_sku_not_in_db(self, db):
        sku = generate_sku(db)
        exists = db.query(SupplierPrice).filter(SupplierPrice.sku == sku).first()
        assert exists is None


class TestBulkGenerateSkus:
    def test_generates_for_none_skus(self, db):
        for i in range(5):
            sp = SupplierPrice(supplier="Test", article=f"ART{i:03d}", name=f"Part {i}")
            db.add(sp)
        db.commit()
        count = bulk_generate_skus(db, batch_size=10)
        assert count == 5
        rows = db.query(SupplierPrice).all()
        assert all(r.sku is not None for r in rows)
        assert len({r.sku for r in rows}) == 5  # all unique

    def test_skips_existing_skus(self, db):
        sp1 = SupplierPrice(supplier="Test", article="ART001", name="Part 1", sku="EXISTING")
        sp2 = SupplierPrice(supplier="Test", article="ART002", name="Part 2")
        db.add_all([sp1, sp2])
        db.commit()
        count = bulk_generate_skus(db, batch_size=10)
        assert count == 1
        db.refresh(sp1)
        assert sp1.sku == "EXISTING"  # unchanged
        db.refresh(sp2)
        assert sp2.sku is not None
        assert sp2.sku != "EXISTING"

    def test_no_rows(self, db):
        count = bulk_generate_skus(db)
        assert count == 0
