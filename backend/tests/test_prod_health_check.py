from __future__ import annotations

from datetime import date, datetime, timezone

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
            _service("helios-da-hrl-lmps.service", "success"),
            _service("helios-rt-fivemin-hrl-lmps.service", "success"),
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
            _service("helios-da-hrl-lmps.service", "success"),
            _service("helios-rt-fivemin-hrl-lmps.service", "exit-code", "1"),
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
            _service("helios-da-hrl-lmps.service", "success"),
            _service("helios-rt-fivemin-hrl-lmps.service", "success"),
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
            _service("helios-da-hrl-lmps.service", "success"),
            _service("helios-rt-fivemin-hrl-lmps.service", "success"),
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
