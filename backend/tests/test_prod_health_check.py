from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

from backend.orchestration.health import prod_health_check


def test_health_evaluation_passes_for_fresh_critical_readiness():
    issues = prod_health_check._evaluate_health(
        da_readiness=_readiness("pjm_da_hrl_lmps", date(2026, 6, 13), 48, 2, 24),
        rt_readiness=_readiness(
            "pjm_rt_fivemin_hrl_lmps",
            date(2026, 6, 11),
            12096,
            42,
            288,
        ),
        rt_shape={
            "business_date": date(2026, 6, 11),
            "row_count": 12096,
            "pnode_count": 42,
            "type_count": 3,
            "period_count": 288,
            "min_utc": datetime(2026, 6, 11, 10, tzinfo=timezone.utc),
            "max_utc": datetime(2026, 6, 12, 9, 55, tzinfo=timezone.utc),
        },
        duplicate_key_count=0,
        api_summary=[
            {
                "pipeline_name": "da_hrl_lmps",
                "failure_count": 0,
                "fetch_count": 1,
                "rows_returned": 2,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 12, tzinfo=timezone.utc),
            },
            {
                "pipeline_name": "rt_fivemin_hrl_lmps",
                "failure_count": 0,
                "fetch_count": 126,
                "rows_returned": 12096,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
            {
                "pipeline_name": "dam_stlmnt_pnt_prices",
                "failure_count": 0,
                "fetch_count": 1,
                "rows_returned": 26664,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
            {
                "pipeline_name": "settlement_point_prices",
                "failure_count": 0,
                "fetch_count": 8,
                "rows_returned": 580,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
        ],
        support_api_summary=_support_api_summary(),
        support_table_summary=_support_table_summary(),
        service_statuses=[
            _service("helios-pjm-da-hrl-lmps.service", "success"),
            _service("helios-pjm-rt-fivemin-hrl-lmps.service", "success"),
        ],
        generated_at=datetime(2026, 6, 13, tzinfo=timezone.utc),
    )

    assert issues == []


def test_health_evaluation_fails_for_stale_rt_readiness_and_duplicates():
    issues = prod_health_check._evaluate_health(
        da_readiness=_readiness("pjm_da_hrl_lmps", date(2026, 6, 13), 48, 2, 24),
        rt_readiness=_readiness(
            "pjm_rt_fivemin_hrl_lmps",
            date(2026, 6, 5),
            12096,
            42,
            288,
        ),
        rt_shape={
            "business_date": date(2026, 6, 5),
            "row_count": 12096,
            "pnode_count": 42,
            "type_count": 3,
            "period_count": 288,
            "min_utc": datetime(2026, 6, 5, 10, tzinfo=timezone.utc),
            "max_utc": datetime(2026, 6, 6, 9, 55, tzinfo=timezone.utc),
        },
        duplicate_key_count=1,
        api_summary=[
            {
                "pipeline_name": "da_hrl_lmps",
                "failure_count": 0,
                "fetch_count": 1,
                "rows_returned": 2,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 12, tzinfo=timezone.utc),
            },
            {
                "pipeline_name": "rt_fivemin_hrl_lmps",
                "failure_count": 2,
                "fetch_count": 126,
                "rows_returned": 12096,
                "latest_status": "failed",
                "latest_http_status": 500,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
        ],
        support_api_summary=[],
        support_table_summary=[],
        service_statuses=[
            _service("helios-pjm-da-hrl-lmps.service", "success"),
            _service("helios-pjm-rt-fivemin-hrl-lmps.service", "exit-code", "1"),
        ],
        generated_at=datetime(2026, 6, 13, tzinfo=timezone.utc),
    )

    messages = [issue.message for issue in issues if issue.severity == "FAIL"]
    assert any("8 days behind" in message for message in messages)
    assert any("1 duplicate keys" in message for message in messages)
    assert any("systemd result is exit-code" in message for message in messages)
    warnings = [issue.message for issue in issues if issue.severity == "WARN"]
    assert any("Latest API fetch status is failed" in message for message in warnings)


def test_health_evaluation_ignores_recovered_low_rate_api_failures():
    issues = prod_health_check._evaluate_health(
        da_readiness=_readiness("pjm_da_hrl_lmps", date(2026, 6, 13), 288, 12, 24),
        rt_readiness=_readiness(
            "pjm_rt_fivemin_hrl_lmps",
            date(2026, 6, 11),
            12096,
            42,
            288,
        ),
        rt_shape={
            "business_date": date(2026, 6, 11),
            "row_count": 12096,
            "pnode_count": 42,
            "type_count": 3,
            "period_count": 288,
            "min_utc": datetime(2026, 6, 11, 10, tzinfo=timezone.utc),
            "max_utc": datetime(2026, 6, 12, 9, 55, tzinfo=timezone.utc),
        },
        duplicate_key_count=0,
        api_summary=[
            {
                "pipeline_name": "da_hrl_lmps",
                "failure_count": 1,
                "fetch_count": 3,
                "rows_returned": 576,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
            {
                "pipeline_name": "rt_fivemin_hrl_lmps",
                "failure_count": 3,
                "fetch_count": 1179,
                "rows_returned": 278208,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
            {
                "pipeline_name": "dam_stlmnt_pnt_prices",
                "failure_count": 1,
                "fetch_count": 3,
                "rows_returned": 79992,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
            {
                "pipeline_name": "settlement_point_prices",
                "failure_count": 1,
                "fetch_count": 100,
                "rows_returned": 1928,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
        ],
        support_api_summary=_support_api_summary(),
        support_table_summary=_support_table_summary(),
        service_statuses=[
            _service("helios-pjm-da-hrl-lmps.service", "success"),
            _service("helios-pjm-rt-fivemin-hrl-lmps.service", "success"),
            _service("helios-pjm-data-miner-batch.service", "success"),
        ],
        generated_at=datetime(2026, 6, 13, 13, tzinfo=timezone.utc),
    )

    assert issues == []


def test_health_evaluation_warns_for_support_batch_gaps_only():
    issues = prod_health_check._evaluate_health(
        da_readiness=_readiness("pjm_da_hrl_lmps", date(2026, 6, 13), 288, 12, 24),
        rt_readiness=_readiness(
            "pjm_rt_fivemin_hrl_lmps",
            date(2026, 6, 11),
            12096,
            42,
            288,
        ),
        rt_shape={
            "business_date": date(2026, 6, 11),
            "row_count": 12096,
            "pnode_count": 42,
            "type_count": 3,
            "period_count": 288,
            "min_utc": datetime(2026, 6, 11, 10, tzinfo=timezone.utc),
            "max_utc": datetime(2026, 6, 12, 9, 55, tzinfo=timezone.utc),
        },
        duplicate_key_count=0,
        api_summary=[
            {
                "pipeline_name": "da_hrl_lmps",
                "failure_count": 0,
                "fetch_count": 1,
                "rows_returned": 288,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
            {
                "pipeline_name": "rt_fivemin_hrl_lmps",
                "failure_count": 0,
                "fetch_count": 1,
                "rows_returned": 12096,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
        ],
        support_api_summary=[
            {
                "pipeline_name": "wind_gen",
                "failure_count": 1,
                "fetch_count": 2,
                "rows_returned": 144,
                "latest_status": "failed",
                "latest_http_status": 500,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            }
        ],
        support_table_summary=[
            {
                "feed_name": "wind_gen",
                "row_count": 0,
                "latest_updated_at": datetime(2026, 6, 11, tzinfo=timezone.utc),
            }
        ],
        service_statuses=[
            _service("helios-pjm-da-hrl-lmps.service", "success"),
            _service("helios-pjm-rt-fivemin-hrl-lmps.service", "success"),
            _service("helios-pjm-data-miner-batch.service", "exit-code", "1"),
        ],
        generated_at=datetime(2026, 6, 13, 13, tzinfo=timezone.utc),
    )

    assert not [issue for issue in issues if issue.severity == "FAIL"]
    warnings = [issue.message for issue in issues if issue.severity == "WARN"]
    assert any("Latest support-batch fetch status is failed" in message for message in warnings)
    assert any("Support table has zero rows" in message for message in warnings)
    assert any("latest updated_at" in message for message in warnings)
    assert any("support batch systemd result is exit-code" in message for message in warnings)


def test_health_evaluation_fails_for_product_matching_test_failure():
    issues = prod_health_check._evaluate_health(
        da_readiness=_readiness("pjm_da_hrl_lmps", date(2026, 6, 13), 288, 12, 24),
        rt_readiness=_readiness(
            "pjm_rt_fivemin_hrl_lmps",
            date(2026, 6, 11),
            12096,
            42,
            288,
        ),
        rt_shape={
            "business_date": date(2026, 6, 11),
            "row_count": 12096,
            "pnode_count": 42,
            "type_count": 3,
            "period_count": 288,
            "min_utc": datetime(2026, 6, 11, 10, tzinfo=timezone.utc),
            "max_utc": datetime(2026, 6, 12, 9, 55, tzinfo=timezone.utc),
        },
        duplicate_key_count=0,
        api_summary=[
            {
                "pipeline_name": "da_hrl_lmps",
                "failure_count": 0,
                "fetch_count": 1,
                "rows_returned": 288,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
            {
                "pipeline_name": "rt_fivemin_hrl_lmps",
                "failure_count": 0,
                "fetch_count": 1,
                "rows_returned": 12096,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
        ],
        support_api_summary=_support_api_summary(),
        support_table_summary=_support_table_summary(),
        product_matching_test={
            "status": "fail",
            "message": "dbt product matching tests failed.",
            "command": "dbt test --profiles-dir . --select tag:product_matching",
        },
        service_statuses=[
            _service("helios-pjm-da-hrl-lmps.service", "success"),
            _service("helios-pjm-rt-fivemin-hrl-lmps.service", "success"),
        ],
        generated_at=datetime(2026, 6, 13, 13, tzinfo=timezone.utc),
    )

    failures = [issue for issue in issues if issue.severity == "FAIL"]
    assert any(
        issue.subject == "positions/trades product matching"
        and "dbt product matching tests failed" in issue.message
        for issue in failures
    )


def test_resolve_dbt_executable_prefers_python_environment_scripts(monkeypatch, tmp_path):
    python_exe = tmp_path / "python.exe"
    scripts_dir = tmp_path / "Scripts"
    scripts_dir.mkdir()
    dbt_exe = scripts_dir / "dbt.exe"
    dbt_exe.write_text("", encoding="utf-8")

    monkeypatch.setattr(prod_health_check.sys, "executable", str(python_exe))
    monkeypatch.setattr(prod_health_check.shutil, "which", lambda _: None)

    assert Path(prod_health_check._resolve_dbt_executable()) == dbt_exe


def test_generated_product_matching_sql_test_passes_when_no_failures(monkeypatch):
    executed_sql: list[str] = []

    monkeypatch.setattr(
        prod_health_check,
        "_load_generated_sql",
        lambda _: "select 'ok'::text as rule_status;",
    )

    def fake_execute_sql(sql, **kwargs):
        executed_sql.append(sql)
        assert kwargs["database"] == "helios_prod"
        assert kwargs["fetch"] is True
        return [{"failing_row_count": 0}]

    monkeypatch.setattr(prod_health_check.db, "execute_sql", fake_execute_sql)

    result = prod_health_check._generated_product_matching_sql_test(
        database="helios_prod",
    )

    assert result["status"] == "pass"
    assert "no failing rows" in result["message"]
    assert "nav=0" in result["stdout_tail"]
    assert "clear_street=0" in result["stdout_tail"]
    assert len(executed_sql) == len(prod_health_check.PRODUCT_MATCHING_GENERATED_SQL_CHECKS)


def test_dbt_product_matching_uses_generated_sql_fallback_when_dbt_missing(monkeypatch):
    monkeypatch.setattr(
        prod_health_check,
        "_resolve_dbt_executable",
        lambda: "missing-dbt-command",
    )
    monkeypatch.setattr(
        prod_health_check,
        "_dbt_test_environment",
        lambda: {
            "DBT_POSTGRES_HOST": "example.postgres.database.azure.com",
            "DBT_POSTGRES_READONLY_USER": "helios_readonly",
            "DBT_POSTGRES_READONLY_PASSWORD": "secret",
            "DBT_POSTGRES_DBNAME": "helios_prod",
        },
    )

    def raise_missing(*_args, **_kwargs):
        raise FileNotFoundError("missing dbt")

    monkeypatch.setattr(prod_health_check.subprocess, "run", raise_missing)
    monkeypatch.setattr(
        prod_health_check,
        "_generated_product_matching_sql_test",
        lambda database=None: {
            "status": "pass",
            "message": "generated product matching SQL found no failing rows",
            "stdout_tail": "failing_row_counts: nav=0, clear_street=0",
            "stderr_tail": "",
        },
    )

    result = prod_health_check._dbt_product_matching_test(database="helios_prod")

    assert result["status"] == "pass"
    assert "dbt unavailable" in result["message"]
    assert "generated SQL fallback passed" in result["message"]
    assert "nav=0" in result["stdout_tail"]


def test_health_evaluation_warns_for_unmanaged_helios_timers():
    issues = prod_health_check._evaluate_health(
        da_readiness=_readiness("pjm_da_hrl_lmps", date(2026, 6, 13), 288, 12, 24),
        rt_readiness=_readiness(
            "pjm_rt_fivemin_hrl_lmps",
            date(2026, 6, 11),
            12096,
            42,
            288,
        ),
        rt_shape={
            "business_date": date(2026, 6, 11),
            "row_count": 12096,
            "pnode_count": 42,
            "type_count": 3,
            "period_count": 288,
            "min_utc": datetime(2026, 6, 11, 10, tzinfo=timezone.utc),
            "max_utc": datetime(2026, 6, 12, 9, 55, tzinfo=timezone.utc),
        },
        duplicate_key_count=0,
        api_summary=[
            {
                "pipeline_name": "da_hrl_lmps",
                "failure_count": 0,
                "fetch_count": 1,
                "rows_returned": 288,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
            {
                "pipeline_name": "rt_fivemin_hrl_lmps",
                "failure_count": 0,
                "fetch_count": 1,
                "rows_returned": 12096,
                "latest_status": "success",
                "latest_http_status": 200,
                "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
            },
        ],
        support_api_summary=_support_api_summary(),
        support_table_summary=_support_table_summary(),
        service_statuses=[
            _service("helios-pjm-da-hrl-lmps.service", "success"),
            _service("helios-pjm-rt-fivemin-hrl-lmps.service", "success"),
        ],
        generated_at=datetime(2026, 6, 13, 13, tzinfo=timezone.utc),
        timers=[
            "NEXT LEFT LAST PASSED UNIT ACTIVATES",
            (
                "Sat 2026-06-13 16:00:00 UTC 1h left "
                "Fri 2026-06-12 16:00:00 UTC 23h ago "
                "helios-pjm-da-hrl-lmps.timer helios-pjm-da-hrl-lmps.service"
            ),
            (
                "Sat 2026-06-13 12:30:00 UTC 1h left "
                "Fri 2026-06-12 12:30:00 UTC 23h ago "
                "helios-pjm-ops-sum.timer helios-pjm-ops-sum.service"
            ),
            (
                "Sat 2026-06-13 06:20:00 UTC 1h left "
                "Fri 2026-06-12 06:20:00 UTC 23h ago "
                "helios-ercot-price-adders-batch.timer "
                "helios-ercot-price-adders-batch.service"
            ),
            (
                "Sat 2026-06-13 16:06:00 UTC 1h left "
                "Fri 2026-06-12 16:06:00 UTC 23h ago "
                "helios-pjm-forecast-hourly.timer helios-pjm-forecast-hourly.service"
            ),
        ],
    )

    warnings = [issue for issue in issues if issue.severity == "WARN"]
    assert any(issue.subject == "helios-pjm-forecast-hourly.timer" for issue in warnings)
    assert not any(issue.subject == "helios-pjm-da-hrl-lmps.timer" for issue in warnings)
    assert not any(issue.subject == "helios-pjm-ops-sum.timer" for issue in warnings)
    assert not any(
        issue.subject == "helios-ercot-price-adders-batch.timer" for issue in warnings
    )


def test_unmanaged_helios_timers_parses_timer_lines():
    assert prod_health_check._unmanaged_helios_timers(
        [
            "NEXT LEFT LAST PASSED UNIT ACTIVATES",
            "n/a n/a n/a n/a helios-pjm-da-hrl-lmps.timer helios-pjm-da-hrl-lmps.service",
            "n/a n/a n/a n/a helios-old-feed.timer helios-old-feed.service",
        ]
    ) == ["helios-old-feed.timer"]


def test_lmp_repair_freshness_passes_for_recent_successes():
    generated_at = datetime(2026, 6, 13, 23, tzinfo=timezone.utc)

    issues = prod_health_check._evaluate_lmp_repair_freshness(
        rows=_lmp_repair_summary(datetime(2026, 6, 13, 22, tzinfo=timezone.utc)),
        generated_at=generated_at,
    )

    assert issues == []


def test_lmp_repair_freshness_warns_for_stale_failed_and_missing_targets():
    rows = _lmp_repair_summary(datetime(2026, 6, 13, 22, tzinfo=timezone.utc))
    rows[1]["last_success_at"] = datetime(2026, 6, 11, 10, tzinfo=timezone.utc)
    rows[2]["latest_status"] = "failed"
    rows[2]["latest_http_status"] = 500
    rows[2]["last_success_at"] = None
    rows.pop()

    issues = prod_health_check._evaluate_lmp_repair_freshness(
        rows=rows,
        generated_at=datetime(2026, 6, 13, 23, tzinfo=timezone.utc),
    )

    warnings = [issue.message for issue in issues if issue.severity == "WARN"]
    assert any("61.0 hours behind" in message for message in warnings)
    assert any("Latest global LMP repair status is failed" in message for message in warnings)
    assert any("No successful global LMP repair telemetry" in message for message in warnings)
    assert any("Missing from LMP repair freshness summary" in message for message in warnings)


def _readiness(
    dataset: str,
    business_date: date,
    row_count: int,
    entity_count: int,
    period_count: int,
) -> dict[str, object]:
    return {
        "dataset": dataset,
        "business_date": business_date,
        "scope": "hub",
        "grain": "date",
        "completeness_status": "complete",
        "row_count": row_count,
        "entity_count": entity_count,
        "period_count": period_count,
        "created_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
    }


def _service(
    service: str,
    result: str,
    exec_main_status: str = "0",
) -> dict[str, str]:
    return {
        "service": service,
        "active_state": "inactive",
        "sub_state": "dead",
        "result": result,
        "exec_main_status": exec_main_status,
    }


def _support_api_summary() -> list[dict[str, object]]:
    return [
        {
            "pipeline_name": pipeline_name,
            "failure_count": 0,
            "fetch_count": 1,
            "rows_returned": 144,
            "latest_status": "success",
            "latest_http_status": 200,
            "last_fetch_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
        }
        for pipeline_name in prod_health_check.SUPPORT_BATCH_PIPELINES
    ]


def _support_table_summary() -> list[dict[str, object]]:
    return [
        {
            "feed_name": pipeline_name,
            "row_count": 1440,
            "latest_updated_at": datetime(2026, 6, 13, tzinfo=timezone.utc),
        }
        for pipeline_name in prod_health_check.SUPPORT_BATCH_PIPELINES
    ]


def _lmp_repair_summary(last_success_at: datetime) -> list[dict[str, object]]:
    return [
        {
            "target_table": target_table,
            "latest_status": "success",
            "latest_http_status": 200,
            "latest_rows_returned": 1440,
            "last_attempt_at": last_success_at,
            "latest_start_date": "2026-06-07",
            "latest_end_date": "2026-06-13",
            "last_success_rows_returned": 1440,
            "last_success_at": last_success_at,
            "last_success_start_date": "2026-06-07",
            "last_success_end_date": "2026-06-13",
        }
        for target_table in prod_health_check.LMP_REPAIR_TARGET_TABLES
    ]
