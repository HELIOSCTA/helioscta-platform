from __future__ import annotations

import pandas as pd
import pytest
import requests

from backend.scrapes.power.ercot import client


class FakeResponse:
    def __init__(
        self,
        *,
        status_code: int = 200,
        payload: dict | None = None,
        headers: dict[str, str] | None = None,
        text: str = "",
    ) -> None:
        self.status_code = status_code
        self._payload = payload if payload is not None else {"data": []}
        self.headers = headers or {}
        self.text = text
        self.reason = "OK" if status_code < 400 else "Error"

    def json(self):
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}", response=self)


def test_authentication_requires_existing_ercot_credentials(monkeypatch):
    monkeypatch.setattr(client.credentials, "ERCOT_USERNAME", None)
    monkeypatch.setattr(client.credentials, "ERCOT_PASSCODE", "")
    monkeypatch.setattr(client.credentials, "ERCOT_API_KEY", None)

    with pytest.raises(RuntimeError) as excinfo:
        client.get_authentication_headers()

    message = str(excinfo.value)
    assert "ERCOT_USERNAME" in message
    assert "ERCOT_PASSCODE" in message
    assert "ERCOT_API_KEY" in message


def test_authentication_builds_public_api_headers_and_logs(monkeypatch):
    captured_posts: list[dict[str, object]] = []
    telemetry: list[dict[str, object]] = []

    def fake_post(url, data=None, timeout=None):
        captured_posts.append({"url": url, "data": data, "timeout": timeout})
        return FakeResponse(payload={"id_token": "id-token"})

    monkeypatch.setattr(client.requests, "post", fake_post)
    monkeypatch.setattr(client, "log_api_fetch", lambda **kwargs: telemetry.append(kwargs))

    headers = client.get_authentication_headers(
        username="user@example.com",
        passcode="passcode",
        api_key="api-key",
        pipeline_name="ercot_framework_test",
        run_id="run-1",
        database="stage_db",
    )

    assert headers == {
        "accept": "application/json",
        "Ocp-Apim-Subscription-Key": "api-key",
        "Authorization": "Bearer id-token",
    }
    assert captured_posts[0]["url"] == client.AUTH_URL
    assert captured_posts[0]["data"]["username"] == "user@example.com"
    assert captured_posts[0]["data"]["password"] == "passcode"
    assert telemetry[0]["provider"] == "ercot"
    assert telemetry[0]["operation_name"] == "authenticate"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["database"] == "stage_db"


def test_make_get_request_retries_rate_limit_and_honors_retry_after(monkeypatch):
    responses = [
        FakeResponse(status_code=429, headers={"Retry-After": "2"}),
        FakeResponse(status_code=200, payload={"data": [[1], [2]]}),
    ]
    sleeps: list[int] = []
    telemetry: list[dict[str, object]] = []

    def fake_get(*_args, **_kwargs):
        return responses.pop(0)

    monkeypatch.setattr(client.requests, "get", fake_get)
    monkeypatch.setattr(client.time, "sleep", lambda seconds: sleeps.append(seconds))
    monkeypatch.setattr(client, "log_api_fetch", lambda **kwargs: telemetry.append(kwargs))

    response = client.make_get_request(
        "np4-190-cd/dam_stlmnt_pnt_prices",
        params={"deliveryDateFrom": "2026-06-13"},
        headers={"Authorization": "Bearer token", "Ocp-Apim-Subscription-Key": "key"},
        retry_delay_seconds=0,
        max_attempts=2,
        pipeline_name="dam_stlmnt_pnt_prices",
        run_id="run-1",
        database="stage_db",
    )

    assert response.status_code == 200
    assert sleeps == [2]
    assert [entry["status"] for entry in telemetry] == ["failure", "success"]
    assert telemetry[0]["http_status"] == 429
    assert telemetry[0]["error_type"] == "RetryableStatus"
    assert telemetry[1]["rows_returned"] == 2
    assert telemetry[1]["database"] == "stage_db"


def test_make_get_request_logs_final_http_failure(monkeypatch):
    telemetry: list[dict[str, object]] = []

    monkeypatch.setattr(
        client.requests,
        "get",
        lambda *_args, **_kwargs: FakeResponse(status_code=401),
    )
    monkeypatch.setattr(client, "log_api_fetch", lambda **kwargs: telemetry.append(kwargs))

    with pytest.raises(requests.HTTPError):
        client.make_get_request(
            "np4-190-cd/dam_stlmnt_pnt_prices",
            headers={
                "Authorization": "Bearer token",
                "Ocp-Apim-Subscription-Key": "api-key",
            },
            max_attempts=1,
        )

    assert len(telemetry) == 1
    assert telemetry[0]["status"] == "failure"
    assert telemetry[0]["http_status"] == 401
    assert telemetry[0]["error_type"] == "HTTPError"
    assert "api-key" not in str(telemetry[0].get("error_message"))


def test_parse_response_uses_ercot_fields_and_data():
    response = FakeResponse(
        payload={
            "fields": [
                {"name": "deliveryDate"},
                {"name": "settlementPoint"},
                {"name": "settlementPointPrice"},
            ],
            "data": [["2026-06-13", "HB_NORTH", 25.5]],
        }
    )

    df = client.parse_response(response)

    assert isinstance(df, pd.DataFrame)
    assert df.to_dict("records") == [
        {
            "deliveryDate": "2026-06-13",
            "settlementPoint": "HB_NORTH",
            "settlementPointPrice": 25.5,
        }
    ]

