import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
from app.models.imports import SupplierConfig
from app.services.supplier_api import GPLAPIClient, SupplierAuthResult, ExportParamsResult


def _config():
    return SupplierConfig(supplier="GPL", login="test_login", api_url="https://gpl.test/api",
                          password_encrypted=None)


class TestGPLAPIAuth:
    def test_success(self):
        config = _config()
        config.password_encrypted = ""  # Will raise on decrypt; patch below
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = '{"access_token": "tok123", "expires_in": 86400}'
        mock_resp.json.return_value = {"access_token": "tok123", "expires_in": 86400}

        with patch("app.services.supplier_api.httpx.post", return_value=mock_resp):
            with patch("app.services.crypto_util.decrypt_password", return_value="test_pass"):
                client = GPLAPIClient(config)
                result = client.auth()
                assert result.success is True
                assert result.token == "tok123"

    def test_http_error(self):
        config = _config()
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = '{"message": "unauthorized"}'
        mock_resp.json.return_value = {"message": "unauthorized"}

        with patch("app.services.supplier_api.httpx.post", return_value=mock_resp):
            with patch("app.services.crypto_util.decrypt_password", return_value="test_pass"):
                client = GPLAPIClient(config)
                result = client.auth()
                assert result.success is False

    def test_connection_error(self):
        config = _config()
        import httpx
        with patch("app.services.supplier_api.httpx.post",
                   side_effect=httpx.RequestError("Connection refused")):
            with patch("app.services.crypto_util.decrypt_password", return_value="test_pass"):
                client = GPLAPIClient(config)
                result = client.auth()
                assert result.success is False
                assert "Connection error" in result.message

    def test_no_token_in_response(self):
        config = _config()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = '{}'
        mock_resp.json.return_value = {}

        with patch("app.services.supplier_api.httpx.post", return_value=mock_resp):
            with patch("app.services.crypto_util.decrypt_password", return_value="test_pass"):
                client = GPLAPIClient(config)
                result = client.auth()
                assert result.success is False


class TestGPLAPIExportParams:
    def test_returns_categories(self):
        config = _config()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "data": {
                "items": [
                    {"category": "Oil Filters"},
                    {"category": "Air Filters"},
                ]
            }
        }

        with patch("app.services.supplier_api.httpx.post", return_value=mock_resp):
            client = GPLAPIClient(config)
            result = client.get_export_params("tok123")
            assert isinstance(result, ExportParamsResult)
            assert len(result.categories) == 2
            assert result.categories[0]["name"] == "Oil Filters"
