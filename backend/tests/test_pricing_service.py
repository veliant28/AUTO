from decimal import Decimal
from datetime import datetime, timedelta
import pytest
from app.models.pricing import PriceRule, PriceRuleHistory
from app.models.parts import PartCategory
from app.services.pricing_service import (
    calculate_final_price, resolve_margin, get_or_create_general_rule,
    get_or_create_category_rule, update_rule, cleanup_old_history,
    get_category_rules_with_names, apply_margins_bulk,
)


class TestCalculateFinalPrice:
    def test_basic_margin(self):
        assert calculate_final_price(Decimal("100"), Decimal("20")) == Decimal("120")

    def test_zero_margin(self):
        assert calculate_final_price(Decimal("100"), Decimal("0")) == Decimal("100")

    def test_negative_margin(self):
        assert calculate_final_price(Decimal("100"), Decimal("-10")) == Decimal("90")

    def test_fractional_margin(self):
        assert calculate_final_price(Decimal("200"), Decimal("12.5")) == Decimal("225")

    def test_none_price(self):
        assert calculate_final_price(None, Decimal("20")) is None


class TestResolveMargin:
    def test_no_rules(self, db):
        assert resolve_margin(db, None) is None
        assert resolve_margin(db, 1) is None

    def test_general_rule_only(self, db):
        rule = PriceRule(type="general", margin_percent=Decimal("15"), is_active=True)
        db.add(rule)
        db.commit()
        assert resolve_margin(db, None) == Decimal("15")
        assert resolve_margin(db, 999) == Decimal("15")

    def test_category_rule_overrides_general(self, db):
        gen = PriceRule(type="general", margin_percent=Decimal("10"), is_active=True)
        db.add(gen)
        cat = PriceRule(type="category", category_id=5, margin_percent=Decimal("25"), is_active=True)
        db.add(cat)
        db.commit()
        assert resolve_margin(db, 5) == Decimal("25")
        assert resolve_margin(db, 999) == Decimal("10")

    def test_inactive_rule_ignored(self, db):
        rule = PriceRule(type="general", margin_percent=Decimal("50"), is_active=False)
        db.add(rule)
        db.commit()
        assert resolve_margin(db, None) is None

    def test_zero_margin_category_falls_to_general(self, db):
        gen = PriceRule(type="general", margin_percent=Decimal("8"), is_active=True)
        db.add(gen)
        cat = PriceRule(type="category", category_id=3, margin_percent=Decimal("0"), is_active=True)
        db.add(cat)
        db.commit()
        assert resolve_margin(db, 3) == Decimal("8")


class TestGetOrCreateGeneralRule:
    def test_creates_when_missing(self, db):
        rule = get_or_create_general_rule(db)
        assert rule.type == "general"
        assert rule.margin_percent == Decimal("0")
        assert rule.is_active is True

    def test_returns_existing(self, db):
        existing = PriceRule(type="general", margin_percent=Decimal("10"), is_active=True)
        db.add(existing)
        db.commit()
        rule = get_or_create_general_rule(db)
        assert rule.id == existing.id
        assert rule.margin_percent == Decimal("10")


class TestGetOrCreateCategoryRule:
    def test_creates_when_missing(self, db):
        rule = get_or_create_category_rule(db, 42)
        assert rule.type == "category"
        assert rule.category_id == 42
        assert rule.margin_percent == Decimal("0")
        assert rule.is_active is True

    def test_returns_existing(self, db):
        existing = PriceRule(type="category", category_id=7, margin_percent=Decimal("12"), is_active=True)
        db.add(existing)
        db.commit()
        rule = get_or_create_category_rule(db, 7)
        assert rule.id == existing.id


class TestUpdateRule:
    def test_records_history_on_change(self, db):
        rule = get_or_create_general_rule(db)
        update_rule(db, rule, Decimal("20"))
        assert rule.margin_percent == Decimal("20")
        history = db.query(PriceRuleHistory).filter(PriceRuleHistory.price_rule_id == rule.id).first()
        assert history is not None
        assert history.old_percent == Decimal("0")
        assert history.new_percent == Decimal("20")

    def test_no_history_on_same_value(self, db):
        rule = get_or_create_general_rule(db)
        update_rule(db, rule, Decimal("0"))
        count = db.query(PriceRuleHistory).count()
        assert count == 0


class TestCleanupOldHistory:
    def test_deletes_old_entries(self, db):
        rule = get_or_create_general_rule(db)
        old = PriceRuleHistory(price_rule_id=rule.id, old_percent=Decimal("0"), new_percent=Decimal("5"),
                                changed_at=datetime.utcnow() - timedelta(days=60))
        recent = PriceRuleHistory(price_rule_id=rule.id, old_percent=Decimal("5"), new_percent=Decimal("10"),
                                   changed_at=datetime.utcnow() - timedelta(days=5))
        db.add_all([old, recent])
        db.commit()
        deleted = cleanup_old_history(db, days=30)
        assert deleted == 1
        remaining = db.query(PriceRuleHistory).all()
        assert len(remaining) == 1
        assert remaining[0].id == recent.id


class TestGetCategoryRulesWithNames:
    def test_returns_empty_when_no_categories(self, db):
        result = get_category_rules_with_names(db)
        assert result == []

    def test_returns_categories_with_rules(self, db):
        cat = PartCategory(name="Brakes")
        db.add(cat)
        db.flush()
        rule = PriceRule(type="category", category_id=cat.id, margin_percent=Decimal("15"), is_active=True)
        db.add(rule)
        db.commit()
        result = get_category_rules_with_names(db)
        assert len(result) >= 1
        r = next(x for x in result if x["category_id"] == cat.id)
        assert r["category_name"] == "Brakes"
        assert r["margin_percent"] == 15.0
        assert r["is_active"] is True


class TestApplyMarginsBulk:
    def test_sql_is_called_without_part_ids(self, db, mocker):
        mock_execute = mocker.patch.object(db, 'execute')
        mock_commit = mocker.patch.object(db, 'commit')
        result_mock = mocker.MagicMock()
        result_mock.rowcount = 5
        mock_execute.return_value = result_mock
        assert apply_margins_bulk(db) == 5
        mock_execute.assert_called_once()
        mock_commit.assert_called_once()

    def test_sql_is_called_with_part_ids(self, db, mocker):
        mock_execute = mocker.patch.object(db, 'execute')
        mock_commit = mocker.patch.object(db, 'commit')
        result_mock = mocker.MagicMock()
        result_mock.rowcount = 3
        mock_execute.return_value = result_mock
        assert apply_margins_bulk(db, part_ids=[1, 2, 3]) == 3
        mock_execute.assert_called_once()
        args, kwargs = mock_execute.call_args
        assert args[1].get('part_ids') == [1, 2, 3]
