from __future__ import annotations

from datetime import date

import pytest

from backend.orchestration.weather.wsi import (
    daily_weighted_degree_day_10yr_normals as normals,
)


class _FakeRunLogger:
    def header(self, _value):
        pass

    def info(self, *_args):
        pass

    def section(self, _value):
        pass

    def success(self, _value):
        pass

    def exception(self, _value):
        pass


def _patch_logging(monkeypatch):
    monkeypatch.setattr(
        normals.script_logging,
        "init_logging",
        lambda **_kwargs: _FakeRunLogger(),
    )
    monkeypatch.setattr(normals.script_logging, "close_logging", lambda: None)


def _expected_normal_rows() -> int:
    return (
        len(normals.DEFAULT_ENTITY_IDS)
        * len(normals.DEFAULT_METRIC_NAMES)
        * normals.EXPECTED_CALENDAR_DAY_COUNT
    )


def _complete_summary(*, rows_written: int = 0) -> dict[str, int]:
    normal_rows = _expected_normal_rows()
    return {
        "normal_row_count": normal_rows,
        "source_day_count": normal_rows * normals.DEFAULT_LOOKBACK_YEARS,
        "min_sample_year_count": normals.DEFAULT_LOOKBACK_YEARS,
        "max_sample_year_count": normals.DEFAULT_LOOKBACK_YEARS,
        "incomplete_normal_row_count": 0,
        "rows_written": rows_written,
    }


def test_wsi_wdd_10yr_normals_dry_run_checks_shape_without_upsert(monkeypatch):
    _patch_logging(monkeypatch)
    calls: list[dict[str, object]] = []
    telemetry: list[dict[str, object]] = []

    def fake_execute_sql(query, **kwargs):
        kwargs["query"] = query
        calls.append(kwargs)
        return [_complete_summary()]

    monkeypatch.setattr(normals.db, "execute_sql", fake_execute_sql)
    monkeypatch.setattr(
        normals,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    result = normals.main(
        normal_window_end_year=2025,
        dry_run=True,
        database="stage_db",
        run_mode="manual",
    )

    assert len(calls) == 1
    assert "INSERT INTO" not in str(calls[0]["query"])
    assert calls[0]["database"] == "stage_db"
    assert calls[0]["fetch"] is True
    assert calls[0]["params"][4] == date(2016, 1, 1)
    assert calls[0]["params"][5] == date(2025, 12, 31)
    assert result.status == "dry_run"
    assert result.completeness_status == "complete"
    assert result.rows_written == 0
    assert result.sample_start_date == date(2016, 1, 1)
    assert result.sample_end_date == date(2025, 12, 31)
    assert telemetry[0]["status"] == "dry_run"
    assert telemetry[0]["rows_written"] == 0
    assert telemetry[0]["metadata"]["dry_run"] is True
    assert telemetry[0]["metadata"]["feb_29_policy"] == "excluded"


def test_wsi_wdd_10yr_normals_upserts_after_complete_check(monkeypatch):
    _patch_logging(monkeypatch)
    calls: list[dict[str, object]] = []
    telemetry: list[dict[str, object]] = []
    expected_rows = _expected_normal_rows()

    def fake_execute_sql(query, **kwargs):
        kwargs["query"] = query
        calls.append(kwargs)
        if "upserted AS" in str(kwargs["query"]):
            return [_complete_summary(rows_written=expected_rows)]
        return [_complete_summary()]

    monkeypatch.setattr(normals.db, "execute_sql", fake_execute_sql)
    monkeypatch.setattr(
        normals,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    result = normals.main(
        normal_window_end_year=2025,
        database="stage_db",
    )

    assert len(calls) == 2
    assert "INSERT INTO weather.wsi_daily_weighted_degree_day_10yr_normals" in str(
        calls[1]["query"]
    )
    assert result.status == "success"
    assert result.completeness_status == "complete"
    assert result.rows_written == expected_rows
    assert result.expected_source_day_count == expected_rows * 10
    assert telemetry[0]["status"] == "success"
    assert telemetry[0]["rows_returned"] == expected_rows * 10
    assert telemetry[0]["rows_written"] == expected_rows


def test_wsi_wdd_10yr_normals_incomplete_window_fails_before_upsert(monkeypatch):
    _patch_logging(monkeypatch)
    calls: list[dict[str, object]] = []
    telemetry: list[dict[str, object]] = []
    expected_rows = _expected_normal_rows()

    def fake_execute_sql(query, **kwargs):
        kwargs["query"] = query
        calls.append(kwargs)
        if "upserted AS" in str(kwargs["query"]):
            raise AssertionError("incomplete normal window should not upsert")
        return [
            {
                "normal_row_count": expected_rows - 1,
                "source_day_count": (expected_rows * 10) - 10,
                "min_sample_year_count": 9,
                "max_sample_year_count": 10,
                "incomplete_normal_row_count": 1,
            }
        ]

    monkeypatch.setattr(normals.db, "execute_sql", fake_execute_sql)
    monkeypatch.setattr(
        normals,
        "log_api_fetch",
        lambda **kwargs: telemetry.append(kwargs),
    )

    with pytest.raises(normals.NormalWindowIncomplete):
        normals.main(normal_window_end_year=2025, database="stage_db")

    assert len(calls) == 1
    assert telemetry[0]["status"] == "failure"
    assert telemetry[0]["error_type"] == "NormalWindowIncomplete"
    assert telemetry[0]["rows_written"] == 0
    assert telemetry[0]["metadata"]["completeness_status"] == "partial"
    assert telemetry[0]["metadata"]["dry_run"] is False


def test_wsi_wdd_10yr_normals_sql_excludes_feb_29():
    sql = normals._normal_rows_cte_sql()

    assert "AND NOT (" in sql
    assert "DATE_PART('month', observation_date)::INTEGER = 2" in sql
    assert "DATE_PART('day', observation_date)::INTEGER = 29" in sql
