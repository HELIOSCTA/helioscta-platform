from __future__ import annotations

import json
from datetime import date

import pandas as pd

from backend.scrapes.power.miso import _lmp
from backend.scrapes.power.miso import da_lmps, data_exchange_client, rt_lmps_prelim


class FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.headers = {}
        self.text = str(payload)

    def json(self):
        return self._payload


def test_miso_data_exchange_uses_subscription_key_header_and_paginates(monkeypatch):
    calls: list[dict[str, object]] = []
    logs: list[dict[str, object]] = []
    pages = [
        {
            "data": [{"node": "INDIANA.HUB"}],
            "page": {"pageNumber": 1, "totalPages": 2, "lastPage": False},
        },
        {
            "data": [{"node": "ILLINOIS.HUB"}],
            "page": {"pageNumber": 2, "totalPages": 2, "lastPage": True},
        },
    ]

    def fake_get(url, **kwargs):
        calls.append({"url": url, **kwargs})
        return FakeResponse(pages[len(calls) - 1])

    monkeypatch.setattr(data_exchange_client.requests, "get", fake_get)
    monkeypatch.setattr(
        data_exchange_client.credentials,
        "MISO_DATA_EXCHANGE_SUBSCRIPTION_KEY",
        "test-secret",
    )
    monkeypatch.setattr(
        data_exchange_client,
        "log_api_fetch",
        lambda **kwargs: logs.append(kwargs),
    )

    rows = data_exchange_client.fetch_pricing_data(
        "day-ahead/2026-08-04/lmp-expost",
        params={"node": "INDIANA.HUB"},
        pipeline_name="miso_da_lmps",
        run_id="run-1",
        feed_name="miso_da_lmps",
        target_table="miso.da_lmps",
        database="stage_db",
    )

    assert rows == [{"node": "INDIANA.HUB"}, {"node": "ILLINOIS.HUB"}]
    assert len(calls) == 2
    assert calls[0]["url"] == (
        "https://apim.misoenergy.org/pricing/v1/"
        "day-ahead/2026-08-04/lmp-expost"
    )
    assert calls[0]["headers"]["Ocp-Apim-Subscription-Key"] == "test-secret"
    assert "subscription-key" not in calls[0]["params"]
    assert calls[0]["params"] == {"node": "INDIANA.HUB", "pageNumber": 1}
    assert calls[1]["params"] == {"node": "INDIANA.HUB", "pageNumber": 2}
    assert logs[0]["provider"] == "miso"
    assert logs[0]["pipeline_name"] == "miso_da_lmps"
    assert logs[0]["target_table"] == "miso.da_lmps"
    assert logs[0]["target_host"] == "apim.misoenergy.org"
    assert logs[0]["target_path"] == "/pricing/v1/day-ahead/2026-08-04/lmp-expost"
    assert logs[0]["rows_returned"] == 1
    assert logs[0]["database"] == "stage_db"
    assert logs[0]["metadata"]["api_family"] == "data_exchange_pricing"
    assert logs[0]["metadata"]["page_number"] == 1


def test_miso_data_exchange_logs_retryable_503_as_http_error(monkeypatch):
    calls: list[dict[str, object]] = []
    logs: list[dict[str, object]] = []

    class EmptyServiceUnavailable:
        status_code = 503
        headers = {}
        text = ""

        def json(self):
            raise json.JSONDecodeError("Expecting value", "", 0)

    def fake_get(url, **kwargs):
        calls.append({"url": url, **kwargs})
        if len(calls) == 1:
            return EmptyServiceUnavailable()
        return FakeResponse(
            {
                "data": [{"node": "INDIANA.HUB"}],
                "page": {"pageNumber": 1, "lastPage": True},
            }
        )

    monkeypatch.setattr(data_exchange_client.requests, "get", fake_get)
    monkeypatch.setattr(data_exchange_client.time, "sleep", lambda _seconds: None)
    monkeypatch.setattr(
        data_exchange_client.credentials,
        "MISO_DATA_EXCHANGE_SUBSCRIPTION_KEY",
        "test-secret",
    )
    monkeypatch.setattr(
        data_exchange_client,
        "log_api_fetch",
        lambda **kwargs: logs.append(kwargs),
    )

    rows = data_exchange_client.fetch_pricing_data(
        "real-time/2026-08-03/lmp-expost",
        params={
            "node": "INDIANA.HUB",
            "preliminaryFinal": "Preliminary",
            "timeResolution": "hourly",
        },
        pipeline_name="miso_rt_lmps_prelim",
        feed_name="miso_rt_lmps_prelim",
        target_table="miso.rt_lmps_prelim",
        retry_delay_seconds=0,
    )

    assert rows == [{"node": "INDIANA.HUB"}]
    assert len(calls) == 2
    assert logs[0]["status"] == "failure"
    assert logs[0]["http_status"] == 503
    assert logs[0]["error_type"] == "HTTPError"
    assert "MISO Data Exchange HTTP 503" in logs[0]["error_message"]
    assert logs[0]["attempt"] == 1
    assert logs[1]["status"] == "success"
    assert logs[1]["attempt"] == 2


def test_miso_lmp_format_maps_components_and_fixed_est_timestamps():
    df = da_lmps._format(
        [
            {
                "interval": "1",
                "node": "INDIANA.HUB",
                "lmp": "27.50",
                "mec": "26.25",
                "mcc": "1.00",
                "mlc": "0.25",
                "timeInterval": {
                    "resolution": "hourly",
                    "start": "2026-08-04T00:00:00",
                    "end": "2026-08-04T01:00:00",
                    "value": "1",
                },
            },
            {
                "interval": "1",
                "node": "INDIANA.HUB",
                "lmp": "28.00",
                "mec": "26.75",
                "mcc": "1.00",
                "mlc": "0.25",
                "timeInterval": {
                    "resolution": "hourly",
                    "start": "2026-08-04T00:00:00",
                    "end": "2026-08-04T01:00:00",
                    "value": "1",
                },
            },
        ],
        operating_date=date(2026, 8, 4),
    )

    assert len(df) == 1
    row = df.iloc[0]
    assert row["interval_start_time_utc"] == pd.Timestamp(
        "2026-08-04T05:00:00Z"
    )
    assert row["interval_end_time_utc"] == pd.Timestamp("2026-08-04T06:00:00Z")
    assert row["operating_date"] == date(2026, 8, 4)
    assert row["operating_hour"] == 1
    assert row["node_id"] == "INDIANA.HUB"
    assert row["market_run_id"] == "DAM"
    assert row["price_status"] == "ExPost"
    assert row["time_resolution"] == "hourly"
    assert row["locational_marginal_price"] == 28.0
    assert row["energy_component"] == 26.75
    assert row["congestion_component"] == 1.0
    assert row["loss_component"] == 0.25


def test_miso_lmp_pull_shapes_day_ahead_and_rt_requests(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_fetch(endpoint, **kwargs):
        calls.append({"endpoint": endpoint, **kwargs})
        return [
            {
                "interval": "1",
                "node": kwargs["params"]["node"],
                "lmp": "27.50",
                "mec": "26.25",
                "mcc": "1.00",
                "mlc": "0.25",
                "timeInterval": {
                    "resolution": "hourly",
                    "start": "2026-08-04T00:00:00",
                    "end": "2026-08-04T01:00:00",
                    "value": "1",
                },
            }
        ]

    monkeypatch.setattr(
        _lmp.data_exchange_client,
        "fetch_pricing_data",
        fake_fetch,
    )

    da_df = da_lmps._pull(
        operating_date=date(2026, 8, 4),
        nodes=("INDIANA.HUB",),
        run_id="run-1",
        database="stage_db",
        metadata={"run_mode": "test"},
        log_fetch=False,
    )
    rt_df = rt_lmps_prelim._pull(
        operating_date=date(2026, 8, 3),
        nodes=("INDIANA.HUB",),
        run_id="run-2",
        database="stage_db",
        metadata={"run_mode": "test"},
        log_fetch=False,
    )

    assert len(da_df) == 1
    assert len(rt_df) == 1
    assert calls[0]["endpoint"] == "day-ahead/2026-08-04/lmp-expost"
    assert calls[0]["params"] == {"node": "INDIANA.HUB"}
    assert calls[0]["pipeline_name"] == "miso_da_lmps"
    assert calls[0]["target_table"] == "miso.da_lmps"
    assert calls[0]["run_id"] == "run-1"
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["log_fetch"] is False
    assert calls[1]["endpoint"] == "real-time/2026-08-03/lmp-expost"
    assert calls[1]["params"] == {
        "node": "INDIANA.HUB",
        "preliminaryFinal": "Preliminary",
        "timeResolution": "hourly",
    }
    assert calls[1]["pipeline_name"] == "miso_rt_lmps_prelim"
    assert calls[1]["target_table"] == "miso.rt_lmps_prelim"


def test_miso_lmp_upsert_uses_contract_columns(monkeypatch):
    captured: dict[str, object] = {}
    df = da_lmps._format(
        [
            {
                "interval": "1",
                "node": "INDIANA.HUB",
                "lmp": "27.50",
                "mec": "26.25",
                "mcc": "1.00",
                "mlc": "0.25",
                "timeInterval": {
                    "resolution": "hourly",
                    "start": "2026-08-04T00:00:00",
                    "end": "2026-08-04T01:00:00",
                    "value": "1",
                },
            }
        ],
        operating_date=date(2026, 8, 4),
    )

    def fake_upsert_dataframe(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(_lmp.db, "upsert_dataframe", fake_upsert_dataframe)

    da_lmps._upsert(df, database="stage_db")

    assert captured["database"] == "stage_db"
    assert captured["schema"] == "miso"
    assert captured["table_name"] == "da_lmps"
    assert captured["columns"] == _lmp.TARGET_COLUMNS
    assert captured["primary_key"] == _lmp.PRIMARY_KEY
    assert list(captured["df"].columns) == _lmp.TARGET_COLUMNS
