import base64
import io
from unittest.mock import MagicMock, patch

import pytest
from openpyxl import Workbook

from app.models.imports import SupplierConfig
from app.services.autonova_price_parser import (
    AutonovaPriceParseError,
    _classify_header,
    parse_autonova_price,
)
from app.services.supplier_api import (
    AUTONOVA_D_ENVIRONMENTS,
    AutonovaDAPIClient,
    normalize_autonova_api_url,
)


def _xlsx(headers: list, rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _config(**kwargs) -> SupplierConfig:
    values = {
        "supplier": "AUTONOVA-D",
        "login": "partner",
        "api_url": AUTONOVA_D_ENVIRONMENTS["dev"],
        "client_id": "99",
    }
    values.update(kwargs)
    return SupplierConfig(**values)


class TestAutonovaPriceParser:
    def test_wide_layout_with_warehouse_columns(self):
        data = _xlsx(
            [
                "Артикул",
                "Виробник",
                "Найменування",
                "Ціна роздрібна, грн",
                "Ціна оптова, грн",
                "Київ",
                "Львів",
            ],
            [
                ["A-001", "VAG", "Фільтр оливи", "250,50", "200,25", "5", "3"],
                ["A-001", "VAG", "Фільтр оливи", "250,50", "200,25", "5", "3"],
                ["B-002", "BOSCH", "Колодки", 1200, 999.99, 0, 2],
            ],
        )

        rows = parse_autonova_price(
            data,
            warehouses=[
                {"Id": "1", "Name": "Київ"},
                {"Id": "2", "Name": "Львів"},
            ],
        )

        assert len(rows) == 2
        first = rows[0]
        assert first["article"] == "A-001"
        assert first["brand"] == "VAG"
        assert first["name"] == "Фільтр оливи"
        assert first["price"] == 200.25  # wholesale is used as purchase price
        assert first["retail_price"] == 250.5
        assert first["stock_total"] == 8
        assert first["stock_regions"] == {"Київ": 5, "Львів": 3}
        assert first["currency"] == "UAH"

    def test_long_layout_sums_rows_per_warehouse(self):
        data = _xlsx(
            ["Артикул", "Бренд", "Назва", "РРЦ", "Опт", "Склад", "Кількість"],
            [
                ["C-003", "MANN", "Фільтр", "300", "250", "Київ", "4"],
                ["C-003", "MANN", "Фільтр", "300", "250", "Одеса", "6"],
            ],
        )

        rows = parse_autonova_price(
            data,
            warehouses=[
                {"Id": "1", "Name": "Київ"},
                {"Id": "2", "Name": "Одеса"},
            ],
        )

        assert len(rows) == 1
        assert rows[0]["price"] == 250.0
        assert rows[0]["retail_price"] == 300.0
        assert rows[0]["stock_total"] == 10
        assert rows[0]["stock_regions"] == {"Київ": 4, "Одеса": 6}

    def test_prefers_article_and_wholesale_columns(self):
        data = _xlsx(
            [
                "Внутрішній код",
                "Артикул",
                "Бренд",
                "Назва",
                "Ціна, грн",
                "Опт ціна, грн",
                "Київ",
                "Львів",
            ],
            [
                ["I-1", "A-1", "VAG", "Фільтр", 300, 250, 4, 6],
                ["I-2", "A-2", "VAG", "Фільтр 2", 310, 260, 1, 2],
                ["I-3", "A-3", "VAG", "Фільтр 3", 320, 270, 0, 3],
            ],
        )

        rows = parse_autonova_price(data)

        assert rows[0]["article"] == "A-1"
        assert rows[0]["price"] == 250.0
        assert rows[0]["stock_total"] == 10
        assert rows[0]["stock_regions"] == {"Київ": 4, "Львів": 6}

    def test_classifies_tricky_stock_and_warehouse_headers(self):
        assert _classify_header("Залишок на складі") == "stock"
        assert _classify_header("Ціна на складі") == "price"
        assert _classify_header("Назва складу") == "warehouse"
        assert _classify_header("Код складу") == "warehouse"
        assert _classify_header("Кількість в упаковці") is None

    def test_unknown_headers_reports_columns(self):
        data = _xlsx(["Колонка 1", "Колонка 2"], [["a", "b"]])

        with pytest.raises(AutonovaPriceParseError) as exc_info:
            parse_autonova_price(data)

        assert "Колонки" in str(exc_info.value)


class TestAutonovaDAPIClient:
    def test_auth_posts_username_and_password(self):
        config = _config()
        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "access_token": "token-1",
            "expires_in": 300,
            "refresh_token": "refresh-1",
        }

        with patch(
            "app.services.supplier_api.httpx.request", return_value=response
        ) as request:
            with patch(
                "app.services.supplier_api.decrypt_password",
                return_value="secret",
            ):
                result = AutonovaDAPIClient(config).auth()

        assert result.success is True
        assert result.token == "token-1"
        assert result.refresh_token == "refresh-1"
        call = request.call_args
        assert call.args[0] == "POST"
        assert call.args[1] == (
            "https://api.autonovad.ua/dev/api/v1/auth/token"
        )
        assert call.kwargs["json"] == {
            "username": "partner",
            "password": "secret",
        }

    def test_download_price_decodes_base64(self):
        config = _config()
        raw_xlsx = b"PK\x03\x04fake-xlsx"
        response = MagicMock()
        response.status_code = 200
        response.headers = {"content-type": "application/json"}
        response.content = b'{"data":{"fileData":"...base64..."}}'
        response.json.return_value = {
            "data": {"fileData": base64.b64encode(raw_xlsx).decode()},
            "success": "true",
        }

        with patch(
            "app.services.supplier_api.httpx.request", return_value=response
        ):
            result = AutonovaDAPIClient(config).download_price_file(
                "token-1", "price-1"
            )

        assert result == raw_xlsx

    def test_export_params_expose_price_lists(self):
        config = _config()
        client = AutonovaDAPIClient(config)
        prices = [
            {"id": "old", "name": "Старый", "number": "1", "lastUpdate": "01.01.2024 10:00:00"},
            {"id": "new", "name": "Новый", "number": "2", "lastUpdate": "01.10.2026 10:00:00"},
        ]

        with patch.object(client, "list_prices", return_value=prices):
            result = client.get_export_params("token-1")

        assert result.formats == ["xlsx"]
        assert [item["id"] for item in result.categories] == ["new", "old"]
        assert result.categories[0]["name"] == "Новый (№2)"

    def test_environment_validation(self):
        assert (
            normalize_autonova_api_url("https://api.autonovad.ua/stable/")
            == "https://api.autonovad.ua/stable"
        )
        with pytest.raises(ValueError):
            normalize_autonova_api_url("https://evil.example")
