from unittest.mock import AsyncMock, patch

from app.services.nova_poshta.lookup_service import NovaPoshtaLookupService


def _warehouse(number: str) -> dict:
    return {
        "Ref": f"ref-{number}",
        "Number": number,
        "Description": f"Відділення №{number}: вул. Тестова, 1",
        "ShortAddress": "вул. Тестова, 1",
        "CityRef": "city-1",
        "TypeOfWarehouse": "Warehouse",
    }


class TestWarehouseSearch:
    async def test_numeric_query_uses_large_limit_and_filters_by_number(self, db):
        """Поиск «19» должен находить отделение №19 даже в большом городе."""
        service = NovaPoshtaLookupService(db)
        client = AsyncMock()
        client.call.return_value = {
            "data": [
                _warehouse("19"),
                _warehouse("18"),
                _warehouse("119"),
                _warehouse("190"),
            ]
        }

        with patch.object(service, "_get_sender_client", return_value=client):
            result = await service.search_warehouses(city_ref="city-1", query="19")

        assert [w.number for w in result] == ["19", "190"]
        props = client.call.call_args[0][2]
        assert props["FindByString"] == "19"
        # увеличенный лимит: иначе №19 не попадает в первую страницу выдачи НП
        assert props["Limit"] == "500"

    async def test_text_query_keeps_default_limit(self, db):
        service = NovaPoshtaLookupService(db)
        client = AsyncMock()
        client.call.return_value = {"data": [_warehouse("1"), _warehouse("2")]}

        with patch.object(service, "_get_sender_client", return_value=client):
            result = await service.search_warehouses(
                city_ref="city-1", query="Тестова"
            )

        assert len(result) == 2
        props = client.call.call_args[0][2]
        assert props["FindByString"] == "Тестова"
        assert props["Limit"] == "50"

    async def test_duplicate_refs_are_dropped(self, db):
        service = NovaPoshtaLookupService(db)
        client = AsyncMock()
        dup = _warehouse("19")
        client.call.return_value = {"data": [dup, dict(dup)]}

        with patch.object(service, "_get_sender_client", return_value=client):
            result = await service.search_warehouses(city_ref="city-1", query="19")

        assert len(result) == 1
