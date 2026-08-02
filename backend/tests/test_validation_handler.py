"""Ensure FastAPI 422 validation errors return a readable string `detail`.

Without the RequestValidationError handler, FastAPI/Pydantic v2 returns
`detail` as a list of {type, loc, msg, input, ctx} objects, which crashes
frontend toasts that render `err.response.data.detail` directly.
"""


def test_validation_error_returns_string_detail(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "not-an-email"},  # invalid email + missing password
    )
    assert response.status_code == 422
    data = response.json()
    assert data["status"] == "error"
    assert isinstance(data["detail"], str)
    assert "email" in data["detail"].lower()
    assert "Field required" in data["detail"]


def test_validation_error_is_not_a_list(client):
    response = client.post(
        "/api/v1/auth/login",
        json={},
    )
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)
