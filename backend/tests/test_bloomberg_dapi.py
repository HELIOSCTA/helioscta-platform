from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pandas as pd
import pytest

from backend.backfills.bloomberg_dapi import historical as backfill
from backend.orchestration.bloomberg_dapi import historical, tickers
from backend.scrapes.bloomberg_dapi import client, symbols


class _DummyRunLogger:
    log_file_path = None

    def header(self, _msg: str) -> None:
        pass

    def info(self, _msg: str) -> None:
        pass

    def section(self, _msg: str) -> None:
        pass

    def success(self, _msg: str) -> None:
        pass

    def exception(self, _msg: str) -> None:
        pass


class _FakeAppendElement:
    def __init__(self) -> None:
        self.values: list[str] = []

    def appendValue(self, value: str) -> None:
        self.values.append(value)


class _FakeRequest:
    def __init__(self) -> None:
        self.elements = {
            "securities": _FakeAppendElement(),
            "fields": _FakeAppendElement(),
        }
        self.settings: dict[str, str] = {}

    def getElement(self, name: str) -> _FakeAppendElement:
        return self.elements[name]

    def set(self, name: str, value: str) -> None:
        self.settings[name] = value


class _FakeService:
    def __init__(self) -> None:
        self.requests: list[_FakeRequest] = []

    def createRequest(self, _request_type: str) -> _FakeRequest:
        request = _FakeRequest()
        self.requests.append(request)
        return request


class _FakeSession:
    def __init__(self, events: list["_FakeEvent"]) -> None:
        self.events = events
        self.service = _FakeService()
        self.sent_requests: list[_FakeRequest] = []
        self.event_timeouts: list[int] = []

    def getService(self, _service_name: str) -> _FakeService:
        return self.service

    def sendRequest(self, request: _FakeRequest) -> None:
        self.sent_requests.append(request)

    def nextEvent(self, timeout_milliseconds: int) -> "_FakeEvent":
        self.event_timeouts.append(timeout_milliseconds)
        return self.events.pop(0)


class _FakeEvent:
    def __init__(self, event_type: int, messages: list[object] | None = None) -> None:
        self._event_type = event_type
        self._messages = messages or []

    def eventType(self) -> int:
        return self._event_type

    def __iter__(self):
        return iter(self._messages)


class _FakeValue:
    def __init__(self, value: object) -> None:
        self._value = value

    def getValue(self) -> object:
        return self._value


class _FakeBar:
    def __init__(self, bar_date: date, values: dict[str, object]) -> None:
        self._date = bar_date
        self._values = values

    def getElementAsDatetime(self, name: str) -> date:
        assert name == "date"
        return self._date

    def hasElement(self, name: str) -> bool:
        return name in self._values

    def getElement(self, name: str) -> _FakeValue:
        return _FakeValue(self._values[name])


class _FakeArrayElement:
    def __init__(self, values: list[object]) -> None:
        self._values = values

    def numValues(self) -> int:
        return len(self._values)

    def getValueAsElement(self, index: int) -> object:
        return self._values[index]


class _FakeSecurityData:
    def __init__(self, security: str, bars: list[_FakeBar]) -> None:
        self._security = security
        self._bars = bars

    def getElementAsString(self, name: str) -> str:
        assert name == "security"
        return self._security

    def hasElement(self, name: str) -> bool:
        return name == "fieldData"

    def getElement(self, name: str) -> object:
        assert name == "fieldData"
        return _FakeArrayElement(self._bars)


class _FakeMessage:
    def __init__(self, security_data: _FakeSecurityData) -> None:
        self._security_data = security_data

    def getElement(self, name: str) -> _FakeSecurityData:
        assert name == "securityData"
        return self._security_data


def _fake_blpapi() -> SimpleNamespace:
    return SimpleNamespace(
        Event=SimpleNamespace(PARTIAL_RESPONSE=1, RESPONSE=2, TIMEOUT=3)
    )


def _patch_logging(monkeypatch) -> None:
    monkeypatch.setattr(
        historical.script_logging,
        "init_logging",
        lambda **_kwargs: _DummyRunLogger(),
    )
    monkeypatch.setattr(historical.script_logging, "close_logging", lambda: None)
    monkeypatch.setattr(
        tickers.script_logging,
        "init_logging",
        lambda **_kwargs: _DummyRunLogger(),
    )
    monkeypatch.setattr(tickers.script_logging, "close_logging", lambda: None)


def _sample_symbol_metadata() -> list[dict[str, str | None]]:
    return [
        {
            "security": "ABC Index",
            "description": "Alpha balance series",
            "category": "supply",
            "subcategory": "production",
            "region": "alpha",
            "market": "gas_balances",
            "commodity": "natural_gas",
            "unit": "Bcf/d",
            "frequency": "daily",
            "default_data_type": "PX_LAST",
            "metadata_source": "test",
            "metadata_notes": "",
        },
        {
            "security": "XYZ Index",
            "description": "Beta cash price",
            "category": "spot_price",
            "subcategory": "cash_price",
            "region": "beta",
            "market": "natural_gas_cash",
            "commodity": "natural_gas",
            "unit": "USD/MMBtu",
            "frequency": "daily",
            "default_data_type": "PX_LAST",
            "metadata_source": "test",
            "metadata_notes": "",
        },
    ]


def test_missing_blpapi_raises_clear_local_runtime_error(monkeypatch):
    def fake_import_module(name: str):
        assert name == "blpapi"
        raise ImportError(name)

    monkeypatch.setattr(client.importlib, "import_module", fake_import_module)

    with pytest.raises(client.BloombergDependencyError, match="licensed Windows"):
        client._load_blpapi()


def test_symbol_metadata_has_expected_business_shape():
    records = symbols.get_security_metadata()

    assert len(records) == 60
    assert all(record["security"] for record in records)
    assert all(record["description"] for record in records)
    assert all(record["category"] for record in records)
    assert {record["category"] for record in records} >= {
        "cross_border_flow",
        "demand",
        "spot_price",
        "storage",
        "supply",
        "weather",
    }
    assert next(
        record for record in records if record["security"] == "NGUSHHUB BNGC Index"
    )["description"] == "Henry Hub natural gas spot price"


def test_fetch_historical_data_builds_request_and_parses_rows(monkeypatch):
    fake_blpapi = _fake_blpapi()
    monkeypatch.setattr(client, "_load_blpapi", lambda: fake_blpapi)
    session = _FakeSession(
        [
            _FakeEvent(
                fake_blpapi.Event.RESPONSE,
                [
                    _FakeMessage(
                        _FakeSecurityData(
                            "ABC Index",
                            [
                                _FakeBar(
                                    date(2026, 7, 1),
                                    {"PX_LAST": 3.14, "VOLUME": 200},
                                )
                            ],
                        )
                    )
                ],
            )
        ]
    )

    df = client.fetch_historical_data(
        session=session,
        securities=["ABC Index"],
        fields=["PX_LAST", "VOLUME"],
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 2),
        event_timeout_milliseconds=250,
    )

    request = session.sent_requests[0]
    assert request.elements["securities"].values == ["ABC Index"]
    assert request.elements["fields"].values == ["PX_LAST", "VOLUME"]
    assert request.settings["startDate"] == "20260701"
    assert request.settings["endDate"] == "20260702"
    assert request.settings["periodicitySelection"] == "DAILY"
    assert session.event_timeouts == [250]
    assert df.to_dict("records") == [
        {
            "security": "ABC Index",
            "date": date(2026, 7, 1),
            "PX_LAST": 3.14,
            "VOLUME": 200,
        }
    ]


def test_iter_response_messages_times_out_on_repeated_event_timeouts(monkeypatch):
    fake_blpapi = _fake_blpapi()
    session = _FakeSession([_FakeEvent(fake_blpapi.Event.TIMEOUT)])
    monotonic_values = iter([0.0, 0.5, 1.5])
    monkeypatch.setattr(client.time, "monotonic", lambda: next(monotonic_values))

    with pytest.raises(client.BloombergRequestTimeout, match="after 1 seconds"):
        list(
            client._iter_response_messages(
                session=session,
                blpapi=fake_blpapi,
                request_timeout_seconds=1,
                event_timeout_milliseconds=100,
            )
        )


def test_format_historical_melts_fields_and_drops_null_values():
    fetched_at = pd.Timestamp("2026-07-28T15:30:00Z")
    raw = pd.DataFrame(
        [
            {
                "security": "ABC Index",
                "date": date(2026, 7, 1),
                "PX_LAST": 3.14,
                "BID": pd.NA,
            },
            {
                "security": "XYZ Index",
                "date": "2026-07-02",
                "PX_LAST": None,
                "BID": 4.2,
            },
        ]
    )

    formatted = historical._format_historical(
        raw,
        fields=["PX_LAST", "BID"],
        fetched_at_utc=fetched_at,
    )

    assert list(formatted.columns) == [
        "security",
        "date",
        "data_type",
        "value",
        "source_fetched_at_utc",
    ]
    assert {
        (row.security, row.date, row.data_type, row.value)
        for row in formatted.itertuples()
    } == {
        ("ABC Index", date(2026, 7, 1), "PX_LAST", 3.14),
        ("XYZ Index", date(2026, 7, 2), "BID", 4.2),
    }
    assert formatted["source_fetched_at_utc"].tolist() == [fetched_at, fetched_at]


def test_tickers_pull_merges_bloomberg_reference_metadata(monkeypatch):
    reference_fetched_at = pd.Timestamp("2026-07-28T15:30:00Z")
    reference_df = pd.DataFrame(
        [
            {
                "security": "ABC Index",
                "bloomberg_name": "ABC NAME",
                "bloomberg_security_description": "ABC SECURITY",
                "bloomberg_currency": "USD",
                "bloomberg_country": "US",
                "bloomberg_market_sector": "Index",
                "bloomberg_reference_fetched_at_utc": reference_fetched_at,
            }
        ]
    )

    monkeypatch.setattr(tickers.symbols, "get_security_metadata", _sample_symbol_metadata)
    monkeypatch.setattr(
        tickers,
        "_fetch_reference_metadata",
        lambda **kwargs: reference_df,
    )

    result = tickers._pull(
        enrich_reference_data=True,
        host="localhost",
        port=8194,
        request_timeout_seconds=30,
    )

    assert list(result.columns) == tickers.TICKER_COLUMNS
    first = result[result["security"] == "ABC Index"].iloc[0]
    second = result[result["security"] == "XYZ Index"].iloc[0]
    assert first["bloomberg_security_description"] == "ABC SECURITY"
    assert first["bloomberg_reference_fetched_at_utc"] == reference_fetched_at
    assert pd.isna(second["bloomberg_security_description"])


def test_historical_main_upserts_and_logs_success(monkeypatch):
    telemetry: list[dict[str, object]] = []
    upserts: list[dict[str, object]] = []
    pulled: list[dict[str, object]] = []
    frame = pd.DataFrame(
        [
            {
                "security": "ABC Index",
                "date": date(2026, 7, 1),
                "data_type": "PX_LAST",
                "value": 3.14,
                "source_fetched_at_utc": pd.Timestamp("2026-07-28T15:30:00Z"),
            }
        ]
    )

    _patch_logging(monkeypatch)
    monkeypatch.setattr(historical.credentials, "AZURE_POSTGRESQL_DB_NAME", "stage_db")
    monkeypatch.setattr(historical, "uuid4", lambda: "run-1")
    monkeypatch.setattr(
        historical,
        "_pull",
        lambda **kwargs: pulled.append(kwargs) or frame,
    )
    monkeypatch.setattr(
        historical,
        "_upsert",
        lambda **kwargs: upserts.append(kwargs),
    )
    monkeypatch.setattr(historical, "log_api_fetch", lambda **kwargs: telemetry.append(kwargs))

    result = historical.main(
        securities=["ABC Index"],
        fields=["PX_LAST"],
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 2),
        run_mode="scheduled",
    )

    assert result is frame
    assert pulled[0]["securities"] == ["ABC Index"]
    assert pulled[0]["fields"] == ["PX_LAST"]
    assert pulled[0]["start_date"] == date(2026, 7, 1)
    assert pulled[0]["end_date"] == date(2026, 7, 2)
    assert upserts[0]["database"] == "stage_db"
    assert upserts[0]["df"] is frame
    assert len(telemetry) == 1
    event = telemetry[0]
    assert event["provider"] == "bloomberg_dapi"
    assert event["pipeline_name"] == "bbg_historical"
    assert event["operation_name"] == "bbg_historical_pull"
    assert event["target_table"] == "bbg_dapi.bbg_historical"
    assert event["method"] == "BLPAPI"
    assert event["status"] == "success"
    assert event["rows_returned"] == 1
    assert event["rows_written"] == 1
    assert event["database"] == "stage_db"
    assert event["metadata"]["run_mode"] == "scheduled"
    assert event["metadata"]["security_count"] == 1
    assert event["metadata"]["fields"] == ["PX_LAST"]


def test_historical_main_logs_failure(monkeypatch):
    telemetry: list[dict[str, object]] = []

    _patch_logging(monkeypatch)
    monkeypatch.setattr(historical.credentials, "AZURE_POSTGRESQL_DB_NAME", "stage_db")
    monkeypatch.setattr(historical, "uuid4", lambda: "run-1")
    monkeypatch.setattr(
        historical,
        "_pull",
        lambda **_kwargs: (_ for _ in ()).throw(
            client.BloombergRequestTimeout("Bloomberg did not respond")
        ),
    )
    monkeypatch.setattr(historical, "log_api_fetch", lambda **kwargs: telemetry.append(kwargs))

    with pytest.raises(client.BloombergRequestTimeout):
        historical.main(
            securities=["ABC Index"],
            fields=["PX_LAST"],
            start_date=date(2026, 7, 1),
            end_date=date(2026, 7, 2),
        )

    assert len(telemetry) == 1
    event = telemetry[0]
    assert event["status"] == "failure"
    assert event["error_type"] == "BloombergRequestTimeout"
    assert event["rows_returned"] == 0
    assert event["rows_written"] == 0
    assert event["database"] == "stage_db"


def test_tickers_main_upserts_fixed_universe_and_logs_success(monkeypatch):
    telemetry: list[dict[str, object]] = []
    upserts: list[dict[str, object]] = []

    _patch_logging(monkeypatch)
    monkeypatch.setattr(tickers.credentials, "AZURE_POSTGRESQL_DB_NAME", "stage_db")
    monkeypatch.setattr(tickers, "uuid4", lambda: "run-2")
    monkeypatch.setattr(tickers.symbols, "get_security_metadata", _sample_symbol_metadata)
    monkeypatch.setattr(tickers, "_upsert", lambda **kwargs: upserts.append(kwargs))
    monkeypatch.setattr(tickers, "log_api_fetch", lambda **kwargs: telemetry.append(kwargs))

    result = tickers.main(run_mode="scheduled")

    assert result["security"].tolist() == ["ABC Index", "XYZ Index"]
    assert result["category"].tolist() == ["supply", "spot_price"]
    assert upserts[0]["database"] == "stage_db"
    assert telemetry[0]["method"] == "LOCAL"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["rows_written"] == 2
    assert telemetry[0]["metadata"]["source"] == "fixed_repo_symbol_list"


def test_scheduled_main_refreshes_tickers_before_historical(monkeypatch):
    calls: list[tuple[str, dict[str, object]]] = []

    monkeypatch.setattr(
        tickers,
        "main",
        lambda **kwargs: calls.append(("tickers", kwargs)) or pd.DataFrame(),
    )
    monkeypatch.setattr(
        historical,
        "main",
        lambda **kwargs: calls.append(("historical", kwargs)) or pd.DataFrame(),
    )

    exit_code = historical.scheduled_main(
        lookback_days=7,
        host="localhost",
        port=8194,
        request_timeout_seconds=30,
        database="stage_db",
    )

    assert exit_code == 0
    assert [name for name, _kwargs in calls] == ["tickers", "historical"]
    assert calls[0][1]["database"] == "stage_db"
    assert calls[0][1]["enrich_reference_data"] is True
    assert calls[0][1]["host"] == "localhost"
    assert calls[0][1]["port"] == 8194
    historical_kwargs = calls[1][1]
    assert historical_kwargs["database"] == "stage_db"
    assert historical_kwargs["host"] == "localhost"
    assert historical_kwargs["port"] == 8194
    assert historical_kwargs["request_timeout_seconds"] == 30
    assert (historical_kwargs["end_date"] - historical_kwargs["start_date"]).days == 7


def test_bloomberg_backfill_dry_run_does_not_call_orchestration(monkeypatch):
    calls: list[dict[str, object]] = []

    monkeypatch.setattr(backfill.workflow, "main", lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(backfill.tickers, "main", lambda **kwargs: calls.append(kwargs))

    result = backfill.main(
        start_date="2026-07-01",
        end_date="2026-07-03",
        dry_run=True,
    )

    assert calls == []
    assert result.pipeline_name == "bbg_historical"
    assert result.start_date == date(2026, 7, 1)
    assert result.end_date == date(2026, 7, 3)
    assert result.days_requested == 3
    assert result.rows_processed == 0
    assert result.status == "dry_run"
    assert result.dry_run is True


def test_bloomberg_backfill_rejects_too_large_window():
    with pytest.raises(ValueError, match="max_days"):
        backfill.main(
            start_date="2026-07-01",
            end_date="2026-07-03",
            max_days=2,
            dry_run=True,
        )


def test_bloomberg_backfill_refreshes_tickers_and_chunks_historical(monkeypatch):
    ticker_calls: list[dict[str, object]] = []
    historical_calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        backfill.symbols,
        "get_securities",
        lambda: ["ABC Index", "XYZ Index"],
    )
    monkeypatch.setattr(
        backfill.tickers,
        "main",
        lambda **kwargs: ticker_calls.append(kwargs)
        or pd.DataFrame([{"security": "ABC Index"}, {"security": "XYZ Index"}]),
    )
    monkeypatch.setattr(
        backfill.workflow,
        "main",
        lambda **kwargs: historical_calls.append(kwargs)
        or pd.DataFrame([{"row": 1}, {"row": 2}]),
    )
    monkeypatch.setattr(backfill.time, "sleep", lambda _seconds: None)

    result = backfill.main(
        start_date="2026-07-01",
        end_date="2026-07-05",
        chunk_days=2,
        request_delay_seconds=0.25,
        database="stage_db",
        host="localhost",
        port=8194,
        request_timeout_seconds=30,
    )

    assert result.status == "success"
    assert result.ticker_rows_processed == 2
    assert result.rows_processed == 6
    assert result.chunks_processed == 3
    assert len(ticker_calls) == 1
    assert ticker_calls[0]["database"] == "stage_db"
    assert ticker_calls[0]["run_mode"] == "backfill"
    assert ticker_calls[0]["enrich_reference_data"] is True
    assert len(historical_calls) == 3
    assert [(call["start_date"], call["end_date"]) for call in historical_calls] == [
        (date(2026, 7, 1), date(2026, 7, 2)),
        (date(2026, 7, 3), date(2026, 7, 4)),
        (date(2026, 7, 5), date(2026, 7, 5)),
    ]
    assert historical_calls[0]["run_mode"] == "backfill"
    assert historical_calls[0]["database"] == "stage_db"
    assert historical_calls[0]["metadata"]["backfill_chunk_number"] == 1
    assert historical_calls[0]["metadata"]["backfill_security_count"] == 2
