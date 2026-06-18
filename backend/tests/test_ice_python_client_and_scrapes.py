from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from backend.scrapes.ice_python import ice_client
from backend.scrapes.ice_python.contract_dates import pull as contract_dates_pull
from backend.scrapes.ice_python.settlements import format as settlements_format
from backend.scrapes.ice_python.settlements import pull as settlements_pull


def test_get_icepython_module_raises_clear_local_runtime_error(monkeypatch):
    def fake_import_module(name: str):
        assert name == "icepython"
        raise ModuleNotFoundError(name)

    monkeypatch.setattr(ice_client.importlib, "import_module", fake_import_module)

    with pytest.raises(ModuleNotFoundError, match="Local Windows ICE runtime required"):
        ice_client.get_icepython_module()


def test_format_settlements_pivots_ice_fields_to_wide_table():
    df = settlements_format.format_settlements(
        pd.DataFrame(
            [
                {
                    "trade_date": "2026-06-17",
                    "symbol": "PDP D0-IUS",
                    "data_type": "Settle",
                    "value": "42.25",
                },
                {
                    "trade_date": "2026-06-17",
                    "symbol": "PDP D0-IUS",
                    "data_type": "Volume",
                    "value": "10",
                },
            ]
        )
    )

    row = df.iloc[0]
    assert row["trade_date"] == date(2026, 6, 17)
    assert row["symbol"] == "PDP D0-IUS"
    assert row["settlement"] == 42.25
    assert row["volume"] == 10.0
    assert pd.isna(row["open"])
    assert pd.isna(row["high"])
    assert pd.isna(row["low"])
    assert pd.isna(row["close"])
    assert pd.isna(row["vwap_close"])


def test_run_settlements_uses_mocked_pull_and_upsert(monkeypatch):
    captured: dict[str, object] = {}

    def fake_pull(**kwargs):
        captured["pull"] = kwargs
        return pd.DataFrame(
            [
                {
                    "trade_date": date(2026, 6, 17),
                    "symbol": "PDP D0-IUS",
                    "data_type": "Settle",
                    "value": 42.25,
                }
            ]
        )

    def fake_upsert(**kwargs):
        captured["upsert"] = kwargs

    monkeypatch.setattr(settlements_pull, "_pull", fake_pull)
    monkeypatch.setattr(settlements_pull, "_upsert", fake_upsert)

    summary = settlements_pull.run_settlements(
        symbols=["PDP D0-IUS", "PDP D0-IUS"],
        fields=["Settle"],
        start_date=date(2026, 6, 16),
        end_date=date(2026, 6, 17),
        database="stage_db",
    )

    assert summary["start_date"] == "2026-06-16"
    assert summary["end_date"] == "2026-06-17"
    assert summary["symbols_requested"] == 1
    assert summary["symbols_returned"] == 1
    assert summary["rows_processed"] == 1
    assert captured["pull"]["symbols"] == ["PDP D0-IUS"]
    assert captured["pull"]["fields"] == ["Settle"]
    assert captured["upsert"]["database"] == "stage_db"


def test_run_contract_dates_uses_mocked_pull_and_upsert(monkeypatch):
    captured: dict[str, object] = {}
    raw_data = [
        ["Symbol", "Strip", "Startdt", "Enddt"],
        ["PDP D0-IUS", "HE 0800-HE 2300", "2026-06-17", "2026-06-17"],
    ]

    def fake_pull(**kwargs):
        captured["pull"] = kwargs
        return raw_data

    def fake_upsert(**kwargs):
        captured["upsert"] = kwargs

    monkeypatch.setattr(contract_dates_pull, "_pull", fake_pull)
    monkeypatch.setattr(contract_dates_pull, "_upsert", fake_upsert)

    summary = contract_dates_pull.run_contract_dates(
        symbols=["PDP D0-IUS"],
        trade_date=date(2026, 6, 17),
        database="stage_db",
    )

    assert summary["trade_date"] == "2026-06-17"
    assert summary["symbols_requested"] == 1
    assert summary["symbols_returned"] == 1
    assert summary["rows_processed"] == 1
    assert captured["pull"]["symbols"] == ["PDP D0-IUS"]
    assert captured["upsert"]["database"] == "stage_db"


def test_run_contract_dates_rejects_range_without_as_of_source():
    with pytest.raises(ValueError, match="ICE-backed as-of source"):
        contract_dates_pull.run_contract_dates(
            symbols=["PDP D0-IUS"],
            start_date=date(2026, 6, 16),
            end_date=date(2026, 6, 17),
        )
