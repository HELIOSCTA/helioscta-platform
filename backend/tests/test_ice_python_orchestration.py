from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest

from backend.orchestration.ice_python import job_runner
from backend.orchestration.ice_python.settlements import gas_next_day
from backend.orchestration.ice_python.settlements import pjm_futures
from backend.orchestration.ice_python.settlements import _runtime
from backend.orchestration.ice_python.settlements import registry


def test_registry_runner_uses_today_snapshot_and_lookback_window(monkeypatch):
    observed: dict[str, object] = {}

    def fake_contract_dates(**kwargs):
        observed["contract_dates"] = kwargs
        return {
            "start_date": "2026-06-17",
            "end_date": "2026-06-17",
            "trade_date": "2026-06-17",
            "symbols_requested": 1,
            "symbols_returned": 1,
            "symbols_missing": [],
            "rows_processed": 1,
            "target_table": "ice_python.settlement_contract_dates",
        }

    def fake_settlements(**kwargs):
        observed["settlements"] = kwargs
        return {
            "start_date": "2026-06-15",
            "end_date": "2026-06-17",
            "symbols_requested": 1,
            "symbols_returned": 1,
            "symbols_missing": [],
            "fields_requested": ["Settle"],
            "rows_processed": 1,
            "target_table": "ice_python.settlements",
        }

    monkeypatch.setattr(
        registry.settlements_pull,
        "resolve_date_range",
        lambda trade_date=None, start_date=None, end_date=None: (
            date(2026, 6, 17),
            date(2026, 6, 17),
        ),
    )
    monkeypatch.setattr(
        registry.contract_dates_pull,
        "run_contract_dates",
        fake_contract_dates,
    )
    monkeypatch.setattr(
        registry.settlements_pull,
        "run_settlements",
        fake_settlements,
    )

    summary = registry.run_registry_settlements(
        pipeline_name="test_ice_registry",
        registry_label="test",
        symbols=["PDP D0-IUS"],
        fields=["Settle"],
        lookback_days=2,
        database="stage_db",
    )

    assert observed["contract_dates"]["trade_date"] == date(2026, 6, 17)
    assert observed["contract_dates"]["database"] == "stage_db"
    assert observed["settlements"]["start_date"] == date(2026, 6, 15)
    assert observed["settlements"]["end_date"] == date(2026, 6, 17)
    assert observed["settlements"]["database"] == "stage_db"
    assert summary["rows_processed"] == 2


def test_gas_next_day_wrapper_selects_default_symbols(monkeypatch):
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        gas_next_day,
        "run_with_logging",
        lambda *, pipeline_name, log_dir, operation, database=None: operation(None),
    )

    def fake_run_registry_settlements(**kwargs):
        captured.update(kwargs)
        return {
            "registry": kwargs["registry_label"],
            "symbols": kwargs["symbols"],
            "rows_processed": 0,
        }

    monkeypatch.setattr(
        gas_next_day.registry,
        "run_registry_settlements",
        fake_run_registry_settlements,
    )

    summary = gas_next_day.run(fields=["Settle"], require_rows=False)

    assert summary["registry"] == "gas_next_day"
    assert len(summary["symbols"]) == 29
    assert summary["symbols"][0] == "XGF D1-IPG"
    assert captured["fields"] == ["Settle"]
    assert captured["require_rows"] is False


def test_pjm_futures_wrapper_builds_bounded_horizon(monkeypatch):
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        pjm_futures,
        "run_with_logging",
        lambda *, pipeline_name, log_dir, operation, database=None: operation(None),
    )

    def fake_run_registry_settlements(**kwargs):
        captured.update(kwargs)
        return {
            "registry": kwargs["registry_label"],
            "symbols": kwargs["symbols"],
            "rows_processed": 0,
        }

    monkeypatch.setattr(
        pjm_futures.registry,
        "run_registry_settlements",
        fake_run_registry_settlements,
    )

    summary = pjm_futures.run(
        products=["PMI"],
        futures_start_date=date(2026, 11, 15),
        months_forward=2,
        fields=["Settle"],
        require_rows=False,
    )

    assert summary["registry"] == "pjm_futures"
    assert summary["symbols"] == ["PMI X26-IUS", "PMI Z26-IUS", "PMI F27-IUS"]
    assert captured["fields"] == ["Settle"]
    assert captured["require_rows"] is False


def test_run_with_logging_emits_ice_api_fetch_telemetry(monkeypatch, tmp_path):
    telemetry: list[dict[str, object]] = []
    monkeypatch.setenv("HELIOS_ICE_JOB_LOCK_FILE", str(tmp_path / "ice.lock"))
    monkeypatch.setattr(
        _runtime,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    summary = _runtime.run_with_logging(
        pipeline_name="orchestration_ice_python_test",
        log_dir=tmp_path,
        database="stage_db",
        operation=lambda log_file_path: {
            "registry": "test",
            "start_date": "2026-06-17",
            "end_date": "2026-06-17",
            "symbols": ["A", "B"],
            "fields": ["Settle"],
            "rows_processed": 3,
            "contract_dates": {
                "target_table": "ice_python.settlement_contract_dates",
                "symbols_missing": [],
            },
            "settlements": {
                "target_table": "ice_python.settlements",
                "symbols_missing": ["B"],
            },
        },
    )

    assert summary["rows_processed"] == 3
    assert len(telemetry) == 1
    assert telemetry[0]["provider"] == "ice_python"
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["rows_written"] == 3
    assert telemetry[0]["target_table"] == (
        "ice_python.settlement_contract_dates,ice_python.settlements"
    )
    assert telemetry[0]["database"] == "stage_db"
    assert telemetry[0]["metadata"]["symbols_requested"] == 2
    assert telemetry[0]["metadata"]["missing_symbol_count"] == 1


def test_job_runner_emits_parseable_summary(monkeypatch, capsys):
    monkeypatch.setattr(
        job_runner.importlib,
        "import_module",
        lambda module_name: SimpleNamespace(
            run=lambda: {"rows_processed": 5, "registry": module_name}
        ),
    )

    exit_code = job_runner.main(
        module_name="backend.orchestration.ice_python.settlements.test",
        job_name="test",
    )

    assert exit_code == 0
    output = capsys.readouterr().out
    assert output.startswith(job_runner.SUMMARY_PREFIX)
    assert '"rows_processed": 5' in output


def test_registry_runner_fails_when_symbol_coverage_breaches_threshold(monkeypatch):
    monkeypatch.setattr(
        registry.settlements_pull,
        "resolve_date_range",
        lambda trade_date=None, start_date=None, end_date=None: (
            date(2026, 6, 17),
            date(2026, 6, 17),
        ),
    )
    monkeypatch.setattr(
        registry.contract_dates_pull,
        "run_contract_dates",
        lambda **kwargs: {
            "symbols_requested": 4,
            "symbols_returned": 4,
            "symbols_missing": [],
            "rows_processed": 4,
            "target_table": "ice_python.settlement_contract_dates",
        },
    )
    monkeypatch.setattr(
        registry.settlements_pull,
        "run_settlements",
        lambda **kwargs: {
            "symbols_requested": 4,
            "symbols_returned": 2,
            "symbols_missing": ["A", "B"],
            "rows_processed": 2,
            "target_table": "ice_python.settlements",
        },
    )

    with pytest.raises(
        RuntimeError,
        match="exceeding the configured coverage threshold",
    ):
        registry.run_registry_settlements(
            pipeline_name="test_ice_registry",
            registry_label="test",
            symbols=["A", "B", "C", "D"],
            fields=["Settle"],
            max_missing_symbol_ratio=0.25,
        )
