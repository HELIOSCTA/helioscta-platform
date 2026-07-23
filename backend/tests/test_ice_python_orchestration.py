from __future__ import annotations

from datetime import date
import os
import subprocess
import sys
from types import SimpleNamespace

import pytest

from backend.orchestration.ice_python import job_runner
from backend.orchestration.ice_python import _policies
from backend.orchestration.ice_python.settlements import gas_futures_core
from backend.orchestration.ice_python.settlements import gas_futures_east
from backend.orchestration.ice_python.settlements import gas_futures_gulf
from backend.orchestration.ice_python.settlements import gas_futures_west
from backend.orchestration.ice_python.settlements import gas_next_day
from backend.orchestration.ice_python.settlements import gas_balmo
from backend.orchestration.ice_python.settlements import pjm_short_term
from backend.orchestration.ice_python.settlements import pjm_futures
from backend.orchestration.ice_python.settlements import ercot_short_term
from backend.orchestration.ice_python.settlements import west_power_daily
from backend.orchestration.ice_python.settlements import east_power_daily
from backend.orchestration.ice_python.settlements import _runtime
from backend.orchestration.ice_python.settlements import registry
from backend.scrapes.ice_python.symbols import east_power
from backend.scrapes.ice_python.symbols import ercot
from backend.scrapes.ice_python.symbols import pjm
from backend.scrapes.ice_python.symbols import west_power


def test_power_daily_product_dictionary_contains_positions_trades_symbols():
    entries = {
        entry["ice_symbol_pattern"]: entry
        for module_entries in (
            ercot.get_product_dictionary_entries(),
            pjm.get_product_dictionary_entries(),
            west_power.get_product_dictionary_entries(),
            east_power.get_product_dictionary_entries(),
        )
        for entry in module_entries
    }

    expected_product_ids = {
        "DDP D0-IUS": "6590449",
        "ERA D0-IUS": "71544051",
        "END D0-IUS": "6590453",
        "SDP D1-IUS": "6590477",
        "NEZ D1-IUS": "72265834",
    }

    for symbol, product_id in expected_product_ids.items():
        assert entries[symbol]["ice_product_id"] == product_id
        assert entries[symbol]["metadata_status"] == "ice_product_url_verified"


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


@pytest.mark.parametrize(
    ("module", "expected_registry"),
    [
        (ercot_short_term, "ercot_short_term"),
        (west_power_daily, "west_power_daily"),
        (east_power_daily, "east_power_daily"),
        (gas_next_day, "gas_next_day"),
        (gas_balmo, "gas_balmo"),
    ],
)
def test_short_term_wrappers_can_skip_contract_dates_for_price_refresh(
    monkeypatch,
    module,
    expected_registry,
):
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        module,
        "run_with_logging",
        lambda *, pipeline_name, log_dir, operation, database=None: operation(None),
    )

    def fake_run_registry_settlements(**kwargs):
        captured.update(kwargs)
        return {
            "registry": kwargs["registry_label"],
            "rows_processed": 0,
        }

    monkeypatch.setattr(
        module.registry,
        "run_registry_settlements",
        fake_run_registry_settlements,
    )

    summary = module.run(
        fields=["Settle", "VWAP Close", "Volume"],
        lookback_days=0,
        pull_contract_dates_enabled=False,
        require_rows=False,
    )

    assert summary["registry"] == expected_registry
    assert captured["fields"] == ["Settle", "VWAP Close", "Volume"]
    assert captured["lookback_days"] == 0
    assert captured["pull_contract_dates_enabled"] is False
    assert captured["require_rows"] is False


@pytest.mark.parametrize(
    ("module", "expected_registry", "expected_symbols"),
    [
        (west_power_daily, "west_power_daily", ["SDP D1-IUS"]),
        (east_power_daily, "east_power_daily", ["NEZ D1-IUS"]),
    ],
)
def test_power_daily_wrappers_select_exact_symbols(
    monkeypatch,
    module,
    expected_registry,
    expected_symbols,
):
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        module,
        "run_with_logging",
        lambda *, pipeline_name, log_dir, operation, database=None: operation(None),
    )

    def fake_run_registry_settlements(**kwargs):
        captured.update(kwargs)
        return {
            "registry": kwargs["registry_label"],
            "symbols": kwargs["symbols"],
            "rows_processed": 1,
        }

    monkeypatch.setattr(
        module.registry,
        "run_registry_settlements",
        fake_run_registry_settlements,
    )

    summary = module.run(fields=["Settle"], require_rows=True)

    assert summary["registry"] == expected_registry
    assert summary["symbols"] == expected_symbols
    assert captured["symbols"] == expected_symbols
    assert captured["fields"] == ["Settle"]
    assert captured["require_rows"] is True
    assert captured["pull_contract_dates_enabled"] is True
    assert captured["require_contract_date_rows"] is False


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


@pytest.mark.parametrize(
    ("module", "expected_registry", "expected_products"),
    [
        (gas_futures_core, "gas_futures_core", ["HNG", "PHH"]),
        (
            gas_futures_gulf,
            "gas_futures_gulf",
            ["TRZ", "TFL", "CGB", "CGM", "TWB", "HXS"],
        ),
        (gas_futures_west, "gas_futures_west", ["WAH", "NTO", "SCB", "PGE", "CRI"]),
        (
            gas_futures_east,
            "gas_futures_east",
            ["ALQ", "TMT", "T5B", "IZB", "TZS", "DOM"],
        ),
    ],
)
def test_split_gas_futures_wrappers_select_product_groups(
    monkeypatch,
    module,
    expected_registry,
    expected_products,
):
    captured: dict[str, object] = {}

    def fake_run(**kwargs):
        captured.update(kwargs)
        return {
            "registry": kwargs["registry_label"],
            "products": kwargs["products"],
            "rows_processed": 0,
        }

    monkeypatch.setattr(module.gas_futures, "run", fake_run)

    summary = module.run(fields=["Settle"], require_rows=False)

    assert summary["registry"] == expected_registry
    assert summary["products"] == expected_products
    assert captured["pipeline_name"] == module.API_SCRAPE_NAME
    assert captured["registry_label"] == expected_registry
    assert captured["fields"] == ["Settle"]
    assert captured["require_rows"] is False


def test_pjm_short_term_tolerates_empty_contract_date_refresh(monkeypatch):
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        pjm_short_term,
        "run_with_logging",
        lambda *, pipeline_name, log_dir, operation, database=None: operation(None),
    )

    def fake_run_registry_settlements(**kwargs):
        captured.update(kwargs)
        return {
            "registry": kwargs["registry_label"],
            "symbols": kwargs["symbols"],
            "rows_processed": 5,
        }

    monkeypatch.setattr(
        pjm_short_term.registry,
        "run_registry_settlements",
        fake_run_registry_settlements,
    )

    summary = pjm_short_term.run(fields=["Settle"])

    assert summary["registry"] == "pjm_short_term"
    assert len(summary["symbols"]) == 14
    assert "DDP D0-IUS" in summary["symbols"]
    assert captured["fields"] == ["Settle"]
    assert captured["require_rows"] is True
    assert captured["pull_contract_dates_enabled"] is True
    assert captured["require_contract_date_rows"] is False


def test_pjm_short_term_can_skip_contract_date_refresh_for_fast_poll(monkeypatch):
    captured: dict[str, object] = {}

    monkeypatch.setattr(
        pjm_short_term,
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
        pjm_short_term.registry,
        "run_registry_settlements",
        fake_run_registry_settlements,
    )

    summary = pjm_short_term.run(
        fields=["Settle", "VWAP Close", "Volume"],
        lookback_days=0,
        pull_contract_dates_enabled=False,
        require_rows=False,
    )

    assert summary["registry"] == "pjm_short_term"
    assert captured["fields"] == ["Settle", "VWAP Close", "Volume"]
    assert captured["lookback_days"] == 0
    assert captured["pull_contract_dates_enabled"] is False
    assert captured["require_rows"] is False
    assert captured["require_contract_date_rows"] is False


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
            "contract_dates_required": False,
            "rows_processed": 3,
            "contract_dates": {
                "target_table": "ice_python.settlement_contract_dates",
                "symbols_missing": [],
                "rows_processed": 0,
            },
            "settlements": {
                "target_table": "ice_python.settlements",
                "symbols_missing": ["B"],
                "rows_processed": 3,
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
    assert telemetry[0]["metadata"]["contract_dates_required"] is False
    assert telemetry[0]["metadata"]["contract_dates_rows_processed"] == 0
    assert telemetry[0]["metadata"]["settlements_rows_processed"] == 3
    assert telemetry[0]["metadata"]["lock_file_path"].endswith(
        "ice.orchestration_ice_python_test.lock"
    )


def test_run_with_logging_uses_partial_summary_from_validation_error(
    monkeypatch,
    tmp_path,
):
    telemetry: list[dict[str, object]] = []
    monkeypatch.setenv("HELIOS_ICE_JOB_LOCK_FILE", str(tmp_path / "ice.lock"))
    monkeypatch.setattr(
        _runtime,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    partial_summary = {
        "registry": "gas_futures_core",
        "start_date": "2026-07-03",
        "end_date": "2026-07-17",
        "symbols": ["HNG Q26-IUS", "PHH Q26-IUS"],
        "fields": ["Settle", "Open Interest"],
        "contract_dates_required": True,
        "rows_processed": 1,
        "contract_dates": {
            "target_table": "ice_python.settlement_contract_dates",
            "symbols_missing": ["PHH Q26-IUS"],
            "rows_processed": 1,
        },
        "settlements": {"skipped": True, "rows_processed": 0},
    }

    def operation(_log_file_path):
        raise registry.IceRegistryValidationError(
            "contract_dates missed 1 of 2 ICE symbol(s)",
            summary=partial_summary,
        )

    with pytest.raises(registry.IceRegistryValidationError):
        _runtime.run_with_logging(
            pipeline_name="orchestration_ice_python_test",
            log_dir=tmp_path,
            database="stage_db",
            operation=operation,
        )

    assert len(telemetry) == 1
    assert telemetry[0]["status"] == "failure"
    assert telemetry[0]["rows_written"] == 1
    assert telemetry[0]["target_table"] == "ice_python.settlement_contract_dates"
    assert telemetry[0]["metadata"]["registry"] == "gas_futures_core"
    assert telemetry[0]["metadata"]["contract_dates_rows_processed"] == 1
    assert telemetry[0]["metadata"]["missing_symbol_count"] == 1


def test_ice_job_lock_scopes_by_pipeline_name(tmp_path):
    base_lock_file = tmp_path / "ice.lock"

    pjm_lock = _runtime.resolve_lock_file(
        base_lock_file,
        lock_scope="orchestration_ice_python_settlements_pjm_futures",
    )
    gas_lock = _runtime.resolve_lock_file(
        base_lock_file,
        lock_scope="orchestration_ice_python_settlements_gas_balmo",
    )

    assert pjm_lock.name == "ice.orchestration_ice_python_settlements_pjm_futures.lock"
    assert gas_lock.name == "ice.orchestration_ice_python_settlements_gas_balmo.lock"

    with _runtime.exclusive_job_lock(base_lock_file, lock_scope="pjm"):
        with _runtime.exclusive_job_lock(base_lock_file, lock_scope="gas"):
            assert True


def test_ice_job_lock_blocks_same_pipeline_overlap(tmp_path):
    base_lock_file = tmp_path / "ice.lock"
    child_code = """
import os
import time
from backend.orchestration.ice_python.settlements import _runtime

with _runtime.exclusive_job_lock(
    os.environ["ICE_TEST_LOCK_FILE"],
    lock_scope=os.environ["ICE_TEST_LOCK_SCOPE"],
):
    print("locked", flush=True)
    time.sleep(2)
"""
    env = os.environ.copy()
    env["ICE_TEST_LOCK_FILE"] = str(base_lock_file)
    env["ICE_TEST_LOCK_SCOPE"] = "gas_balmo"

    first = subprocess.Popen(
        [sys.executable, "-c", child_code],
        cwd=os.getcwd(),
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        assert first.stdout is not None
        assert first.stdout.readline().strip() == "locked"
        with pytest.raises(RuntimeError, match="same lock scope"):
            with _runtime.exclusive_job_lock(base_lock_file, lock_scope="gas_balmo"):
                pass
    finally:
        first.terminate()
        first.communicate(timeout=10)


def test_registry_runner_can_tolerate_empty_contract_dates(monkeypatch):
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
            "symbols_requested": 2,
            "symbols_returned": 0,
            "symbols_missing": ["A", "B"],
            "rows_processed": 0,
            "target_table": "ice_python.settlement_contract_dates",
        },
    )
    monkeypatch.setattr(
        registry.settlements_pull,
        "run_settlements",
        lambda **kwargs: {
            "symbols_requested": 2,
            "symbols_returned": 2,
            "symbols_missing": [],
            "rows_processed": 2,
            "target_table": "ice_python.settlements",
        },
    )

    summary = registry.run_registry_settlements(
        pipeline_name="test_ice_registry",
        registry_label="test",
        symbols=["A", "B"],
        fields=["Settle"],
        require_contract_date_rows=False,
    )

    assert summary["rows_processed"] == 2
    assert summary["contract_dates_required"] is False
    assert summary["contract_dates"]["rows_processed"] == 0
    assert summary["settlements"]["rows_processed"] == 2


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


def test_job_runner_passes_configured_kwargs(monkeypatch, capsys):
    observed: dict[str, object] = {}

    def fake_run(**kwargs):
        observed.update(kwargs)
        return {"rows_processed": 7}

    monkeypatch.setattr(
        job_runner.importlib,
        "import_module",
        lambda module_name: SimpleNamespace(run=fake_run),
    )

    exit_code = job_runner.main(
        module_name="backend.orchestration.ice_python.settlements.test",
        job_name="test",
        job_kwargs={
            "fields": ["Settle", "VWAP Close", "Volume"],
            "lookback_days": 0,
            "pull_contract_dates_enabled": False,
        },
    )

    assert exit_code == 0
    assert observed == {
        "fields": ["Settle", "VWAP Close", "Volume"],
        "lookback_days": 0,
        "pull_contract_dates_enabled": False,
    }
    assert capsys.readouterr().out.startswith(job_runner.SUMMARY_PREFIX)


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
        registry.IceRegistryValidationError,
        match="exceeding the configured coverage threshold",
    ):
        registry.run_registry_settlements(
            pipeline_name="test_ice_registry",
            registry_label="test",
            symbols=["A", "B", "C", "D"],
            fields=["Settle"],
            max_missing_symbol_ratio=0.25,
        )


def test_registry_validation_errors_are_not_retried_by_transient_policy():
    calls = 0

    @_policies.ice_transient_retry_policy(attempts=2)
    def failing_validation():
        nonlocal calls
        calls += 1
        raise registry.IceRegistryValidationError("deterministic coverage failure")

    with pytest.raises(registry.IceRegistryValidationError):
        failing_validation()

    assert calls == 1
