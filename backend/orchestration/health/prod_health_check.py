"""Print a read-only HeliosCTA production health digest."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from backend import credentials
from backend.utils import db

CRITICAL_PIPELINES: tuple[str, ...] = (
    "da_hrl_lmps",
    "rt_fivemin_hrl_lmps",
    "dam_stlmnt_pnt_prices",
    "settlement_point_prices",
)
CRITICAL_SERVICES: tuple[str, ...] = (
    "helios-pjm-da-hrl-lmps.service",
    "helios-pjm-rt-fivemin-hrl-lmps.service",
    "helios-ercot-dam-stlmnt-pnt-prices.service",
    "helios-ercot-settlement-point-prices.service",
)
SUPPORT_SERVICES: tuple[str, ...] = (
    "helios-lmp-price-backfill-7-day.service",
    "helios-pjm-data-miner-batch.service",
    "helios-pjm-hourly-bucket.service",
    "helios-pjm-hrl-dmd-bids.service",
    "helios-pjm-da-transconstraints.service",
    "helios-pjm-da-reserve-market-results.service",
    "helios-pjm-gen-outages-by-type.service",
    "helios-pjm-ops-sum.service",
    "helios-email-notification-outbox.service",
    "helios-ercot-load-batch.service",
    "helios-ercot-congestion-batch.service",
    "helios-ercot-renewables-batch.service",
    "helios-ercot-renewables-5min-batch.service",
    "helios-ercot-outage-capacity-batch.service",
    "helios-ercot-price-adders-batch.service",
)
KNOWN_TIMERS: tuple[str, ...] = (
    "helios-lmp-price-backfill-7-day.timer",
    "helios-pjm-da-hrl-lmps.timer",
    "helios-pjm-rt-fivemin-hrl-lmps.timer",
    "helios-prod-health-check.timer",
    "helios-pjm-data-miner-batch.timer",
    "helios-pjm-hourly-bucket.timer",
    "helios-pjm-hrl-dmd-bids.timer",
    "helios-pjm-da-transconstraints.timer",
    "helios-pjm-da-reserve-market-results.timer",
    "helios-pjm-gen-outages-by-type.timer",
    "helios-pjm-ops-sum.timer",
    "helios-email-notification-outbox.timer",
    "helios-pjm-meteologica-forecast-hourly.timer",
    "helios-ercot-dam-stlmnt-pnt-prices.timer",
    "helios-ercot-settlement-point-prices.timer",
    "helios-ercot-load-batch.timer",
    "helios-ercot-congestion-batch.timer",
    "helios-ercot-renewables-batch.timer",
    "helios-ercot-renewables-5min-batch.timer",
    "helios-ercot-outage-capacity-batch.timer",
    "helios-ercot-price-adders-batch.timer",
    "helios-isone-da-hrl-lmps.timer",
    "helios-isone-rt-hrl-lmps-prelim.timer",
    "helios-isone-rt-hrl-lmps-final.timer",
    "helios-isone-hourly-system-demand.timer",
    "helios-isone-da-hrl-cleared-demand.timer",
    "helios-isone-forecast-batch.timer",
    "helios-isone-rt-hrl-scheduled-interchange.timer",
    "helios-isone-external-interface-metered-data.timer",
)


@dataclass(frozen=True)
class SupportFeed:
    pipeline_name: str
    table_schema: str
    table_name: str


PJM_SUPPORT_FEEDS: tuple[SupportFeed, ...] = (
    SupportFeed("act_sch_interchange", "pjm", "act_sch_interchange"),
    SupportFeed("agg_definitions", "pjm", "agg_definitions"),
    SupportFeed("ancillary_services", "pjm", "ancillary_services"),
    SupportFeed(
        "da_interface_flows_and_limits",
        "pjm",
        "da_interface_flows_and_limits",
    ),
    SupportFeed("da_marginal_value", "pjm", "da_marginal_value"),
    SupportFeed(
        "da_reserve_market_results",
        "pjm",
        "da_reserve_market_results",
    ),
    SupportFeed("da_transconstraints", "pjm", "da_transconstraints"),
    SupportFeed("day_gen_capacity", "pjm", "day_gen_capacity"),
    SupportFeed("dispatched_reserves", "pjm", "dispatched_reserves"),
    SupportFeed("five_min_solar_generation", "pjm", "five_min_solar_generation"),
    SupportFeed("five_min_tie_flows", "pjm", "five_min_tie_flows"),
    SupportFeed("frcstd_gen_outages", "pjm", "frcstd_gen_outages"),
    SupportFeed("gen_by_fuel", "pjm", "gen_by_fuel"),
    SupportFeed("gen_outages_by_type", "pjm", "gen_outages_by_type"),
    SupportFeed("hrl_dmd_bids", "pjm", "hrl_dmd_bids"),
    SupportFeed("hrl_load_metered", "pjm", "hrl_load_metered"),
    SupportFeed("hrl_load_prelim", "pjm", "hrl_load_prelim"),
    SupportFeed("load_frcstd_7_day", "pjm", "load_frcstd_7_day"),
    SupportFeed("ops_sum_frcstd_tran_lim", "pjm", "ops_sum_frcstd_tran_lim"),
    SupportFeed("ops_sum_frcst_peak_area", "pjm", "ops_sum_frcst_peak_area"),
    SupportFeed("ops_sum_frcst_peak_rto", "pjm", "ops_sum_frcst_peak_rto"),
    SupportFeed("ops_sum_prev_period", "pjm", "ops_sum_prev_period"),
    SupportFeed("ops_sum_prjctd_tie_flow", "pjm", "ops_sum_prjctd_tie_flow"),
    SupportFeed("pnode", "pjm", "pnode"),
    SupportFeed("reserve_market_results", "pjm", "reserve_market_results"),
    SupportFeed("rt_and_self_ecomax", "pjm", "rt_and_self_ecomax"),
    SupportFeed("rt_default_mv_override", "pjm", "rt_default_mv_override"),
    SupportFeed("rt_dispatch_reserves", "pjm", "rt_dispatch_reserves"),
    SupportFeed("rt_fivemin_mnt_lmps", "pjm", "rt_fivemin_mnt_lmps"),
    SupportFeed("rt_hrl_lmps", "pjm", "rt_hrl_lmps"),
    SupportFeed("rt_marginal_value", "pjm", "rt_marginal_value"),
    SupportFeed("rt_short_term_mv_override", "pjm", "rt_short_term_mv_override"),
    SupportFeed("rt_unverified_hrl_lmps", "pjm", "rt_unverified_hrl_lmps"),
    SupportFeed("solar_gen", "pjm", "solar_gen"),
    SupportFeed("unverified_five_min_lmps", "pjm", "unverified_five_min_lmps"),
    SupportFeed("wind_gen", "pjm", "wind_gen"),
)
ERCOT_SUPPORT_FEEDS: tuple[SupportFeed, ...] = (
    SupportFeed("actual_system_load", "ercot", "actual_system_load"),
    SupportFeed("seven_day_load_forecast", "ercot", "seven_day_load_forecast"),
    SupportFeed("dam_shadow_prices", "ercot", "dam_shadow_prices"),
    SupportFeed("sced_shadow_prices", "ercot", "sced_shadow_prices"),
    SupportFeed(
        "wind_power_production_hourly",
        "ercot",
        "wind_power_production_hourly",
    ),
    SupportFeed(
        "solar_power_production_hourly",
        "ercot",
        "solar_power_production_hourly",
    ),
    SupportFeed("wind_power_actual_5min", "ercot", "wind_power_actual_5min"),
    SupportFeed("solar_power_actual_5min", "ercot", "solar_power_actual_5min"),
    SupportFeed(
        "hourly_resource_outage_capacity",
        "ercot",
        "hourly_resource_outage_capacity",
    ),
    SupportFeed(
        "short_term_system_adequacy",
        "ercot",
        "short_term_system_adequacy",
    ),
)
SUPPORT_FEEDS: tuple[SupportFeed, ...] = PJM_SUPPORT_FEEDS + ERCOT_SUPPORT_FEEDS
SUPPORT_BATCH_PIPELINES: tuple[str, ...] = tuple(
    feed.pipeline_name for feed in SUPPORT_FEEDS
)
HELIOS_TIMER_PATTERN = "helios-*"
DA_DATASET = "pjm_da_hrl_lmps"
RT_FIVEMIN_HRL_DATASET = "pjm_rt_fivemin_hrl_lmps"
RT_FIVEMIN_HRL_TABLE = "pjm.rt_fivemin_hrl_lmps"
ERCOT_DAM_SPP_DATASET = "ercot_dam_stlmnt_pnt_prices"
ERCOT_RT_SPP_DATASET = "ercot_settlement_point_prices"
DEFAULT_LOOKBACK_HOURS = 24
MAX_DA_BUSINESS_DATE_LAG_DAYS = 1
MAX_RT_BUSINESS_DATE_LAG_DAYS = 4
MAX_ERCOT_DAM_BUSINESS_DATE_LAG_DAYS = 1
MAX_ERCOT_RT_BUSINESS_DATE_LAG_DAYS = 2
MAX_SUPPORT_TABLE_UPDATED_LAG_HOURS = 36
MAX_LMP_REPAIR_SUCCESS_LAG_HOURS = 36
MAX_RECOVERED_API_FAILURE_RATE = 0.5
LMP_REPAIR_FAMILY = "lmp_price_backfill_7_day"
DBT_PRODUCT_MATCHING_SELECT = "tag:positions_trades_product_matching"
DBT_PRODUCT_MATCHING_TIMEOUT_SECONDS = 180
PRODUCT_MATCHING_GENERATED_SQL_CHECKS: tuple[tuple[str, str, str], ...] = (
    (
        "nav",
        "frontend/sql/nav-positions/marts/all_history.sql",
        "rule_status IS DISTINCT FROM 'ok'",
    ),
    (
        "clear_street",
        "frontend/sql/clear-street-trades/marts/eod_all_history.sql",
        (
            "rule_status IS DISTINCT FROM 'ok' "
            "AND rule_status IS DISTINCT FROM 'non_product_cash_adjustment'"
        ),
    ),
)
LMP_REPAIR_TARGET_TABLES: tuple[str, ...] = (
    "pjm.da_hrl_lmps",
    "pjm.rt_hrl_lmps",
    "pjm.rt_fivemin_hrl_lmps",
    "pjm.rt_unverified_hrl_lmps",
    "isone.da_hrl_lmps",
    "isone.rt_hrl_lmps_final",
    "isone.rt_hrl_lmps_prelim",
    "ercot.dam_stlmnt_pnt_prices",
    "ercot.settlement_point_prices",
    "ercot.rt_price_adders_sced",
    "ercot.rt_price_adders_15min",
    "caiso.da_lmps",
    "caiso.rt_lmps",
)


@dataclass(frozen=True)
class HealthIssue:
    severity: str
    subject: str
    message: str


def main(
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
    database: str | None = None,
    include_systemd: bool = True,
) -> int:
    """Print a production health digest and return 1 on critical failure."""
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    generated_at = datetime.now(timezone.utc)
    checks = collect_health(
        lookback_hours=lookback_hours,
        database=database,
        include_systemd=include_systemd,
        generated_at=generated_at,
    )
    report = format_health_report(
        checks=checks,
        lookback_hours=lookback_hours,
        generated_at=generated_at,
    )
    print(report)
    return 1 if any(issue.severity == "FAIL" for issue in checks["issues"]) else 0


def collect_health(
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
    database: str | None = None,
    include_systemd: bool = True,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """Collect read-only health data from Postgres and optional systemd."""
    generated_at = generated_at or datetime.now(timezone.utc)
    da_readiness = _latest_readiness_event(
        dataset=DA_DATASET,
        database=database,
    )
    rt_readiness = _latest_readiness_event(
        dataset=RT_FIVEMIN_HRL_DATASET,
        database=database,
    )
    ercot_dam_readiness = _latest_readiness_event(
        dataset=ERCOT_DAM_SPP_DATASET,
        database=database,
    )
    ercot_rt_readiness = _latest_readiness_event(
        dataset=ERCOT_RT_SPP_DATASET,
        database=database,
    )
    rt_shape = _rt_fivemin_hrl_latest_shape(database=database)
    api_summary = _api_fetch_summary(
        pipeline_names=CRITICAL_PIPELINES,
        lookback_hours=lookback_hours,
        database=database,
    )
    support_api_summary = _api_fetch_summary(
        pipeline_names=SUPPORT_BATCH_PIPELINES,
        lookback_hours=lookback_hours,
        database=database,
    )
    lmp_repair_summary = _lmp_repair_freshness_summary(database=database)
    support_table_summary = _support_table_summary(database=database)
    product_matching_test = _dbt_product_matching_test(database=database)
    duplicate_key_count = _rt_fivemin_hrl_duplicate_key_count(database=database)
    service_statuses = (
        _systemd_service_statuses(CRITICAL_SERVICES + SUPPORT_SERVICES)
        if include_systemd
        else []
    )
    timers = _systemd_timers() if include_systemd else []

    issues = _evaluate_health(
        da_readiness=da_readiness,
        rt_readiness=rt_readiness,
        ercot_dam_readiness=ercot_dam_readiness,
        ercot_rt_readiness=ercot_rt_readiness,
        require_ercot_readiness=True,
        rt_shape=rt_shape,
        duplicate_key_count=duplicate_key_count,
        api_summary=api_summary,
        support_api_summary=support_api_summary,
        lmp_repair_summary=lmp_repair_summary,
        support_table_summary=support_table_summary,
        product_matching_test=product_matching_test,
        service_statuses=service_statuses,
        timers=timers,
        generated_at=generated_at,
    )

    return {
        "da_readiness": da_readiness,
        "rt_readiness": rt_readiness,
        "ercot_dam_readiness": ercot_dam_readiness,
        "ercot_rt_readiness": ercot_rt_readiness,
        "rt_shape": rt_shape,
        "duplicate_key_count": duplicate_key_count,
        "api_summary": api_summary,
        "support_api_summary": support_api_summary,
        "lmp_repair_summary": lmp_repair_summary,
        "support_table_summary": support_table_summary,
        "product_matching_test": product_matching_test,
        "service_statuses": service_statuses,
        "timers": timers,
        "issues": issues,
    }


def format_health_report(
    *,
    checks: dict[str, Any],
    lookback_hours: int,
    generated_at: datetime,
) -> str:
    """Render a compact plain-text health report for morning operator review."""
    lines = [
        "HeliosCTA production health digest",
        f"Generated at: {generated_at.isoformat()}",
        f"Window: last {lookback_hours} hours",
        "",
        "Critical readiness",
        _format_readiness("DA hourly LMPs", checks["da_readiness"]),
        _format_readiness("RT verified 5-min HRL LMPs", checks["rt_readiness"]),
        _format_readiness("ERCOT DAM SPP hubs", checks["ercot_dam_readiness"]),
        _format_readiness("ERCOT RT SPP hubs", checks["ercot_rt_readiness"]),
        "",
        "RT verified 5-min HRL table shape",
        _format_rt_shape(checks["rt_shape"], checks["duplicate_key_count"]),
        "",
        "API fetch health",
        *_format_api_summary(checks["api_summary"]),
        "",
        "LMP repair freshness",
        *_format_lmp_repair_summary(checks["lmp_repair_summary"]),
        "",
        "Support batch health",
        *_format_support_batch_summary(
            checks["support_api_summary"],
            checks["support_table_summary"],
        ),
        "",
        "Positions/trades product matching",
        _format_product_matching_test(checks.get("product_matching_test")),
        "",
        "Service status",
        *_format_service_statuses(checks["service_statuses"]),
        "",
        "Timer schedule",
        *_format_timers(checks["timers"]),
        "",
        "Findings",
        *_format_issues(checks["issues"]),
    ]
    return "\n".join(lines)


def _latest_readiness_event(
    *,
    dataset: str,
    database: str | None,
) -> dict[str, Any] | None:
    rows = db.execute_sql(
        """
        SELECT
            dataset,
            business_date,
            scope,
            grain,
            completeness_status,
            row_count,
            entity_count,
            period_count,
            created_at
        FROM ops.data_availability_events
        WHERE dataset = %s
        ORDER BY business_date DESC, created_at DESC
        LIMIT 1;
        """,
        params=(dataset,),
        database=database,
        fetch=True,
    )
    return rows[0] if rows else None


def _rt_fivemin_hrl_latest_shape(database: str | None) -> dict[str, Any] | None:
    rows = db.execute_sql(
        """
        WITH latest AS (
            SELECT MAX(DATE(datetime_beginning_ept)) AS business_date
            FROM pjm.rt_fivemin_hrl_lmps
            WHERE row_is_current = true
        )
        SELECT
            latest.business_date,
            COUNT(*) AS row_count,
            COUNT(DISTINCT pnode_id) AS pnode_count,
            COUNT(DISTINCT type) AS type_count,
            COUNT(DISTINCT datetime_beginning_utc) AS period_count,
            MIN(datetime_beginning_utc) AS min_utc,
            MAX(datetime_beginning_utc) AS max_utc
        FROM pjm.rt_fivemin_hrl_lmps
        CROSS JOIN latest
        WHERE row_is_current = true
          AND DATE(datetime_beginning_ept) = latest.business_date
        GROUP BY latest.business_date;
        """,
        database=database,
        fetch=True,
    )
    return rows[0] if rows else None


def _rt_fivemin_hrl_duplicate_key_count(database: str | None) -> int | None:
    rows = db.execute_sql(
        """
        WITH latest AS (
            SELECT MAX(DATE(datetime_beginning_ept)) AS business_date
            FROM pjm.rt_fivemin_hrl_lmps
            WHERE row_is_current = true
        ),
        duplicates AS (
            SELECT
                datetime_beginning_utc,
                pnode_id,
                pnode_name,
                COUNT(*) AS rows_per_key
            FROM pjm.rt_fivemin_hrl_lmps
            CROSS JOIN latest
            WHERE row_is_current = true
              AND DATE(datetime_beginning_ept) = latest.business_date
            GROUP BY 1, 2, 3
            HAVING COUNT(*) > 1
        )
        SELECT COUNT(*) AS duplicate_key_count
        FROM duplicates;
        """,
        database=database,
        fetch=True,
    )
    if not rows:
        return None
    return int(rows[0]["duplicate_key_count"])


def _api_fetch_summary(
    *,
    pipeline_names: tuple[str, ...],
    lookback_hours: int,
    database: str | None,
) -> list[dict[str, Any]]:
    rows = db.execute_sql(
        """
        WITH windowed AS (
            SELECT
                pipeline_name,
                status,
                http_status,
                rows_returned,
                created_at
            FROM ops.api_fetch_log
            WHERE pipeline_name = ANY(%s)
              AND created_at >= NOW() - (%s || ' hours')::interval
        ),
        latest AS (
            SELECT DISTINCT ON (pipeline_name)
                pipeline_name,
                status AS latest_status,
                http_status AS latest_http_status,
                created_at AS last_fetch_at
            FROM windowed
            ORDER BY pipeline_name, created_at DESC
        )
        SELECT
            windowed.pipeline_name,
            COUNT(*) AS fetch_count,
            COUNT(*) FILTER (WHERE windowed.status <> 'success') AS failure_count,
            COALESCE(SUM(windowed.rows_returned), 0) AS rows_returned,
            latest.latest_status,
            latest.latest_http_status,
            latest.last_fetch_at
        FROM windowed
        JOIN latest USING (pipeline_name)
        GROUP BY
            windowed.pipeline_name,
            latest.latest_status,
            latest.latest_http_status,
            latest.last_fetch_at
        ORDER BY windowed.pipeline_name;
        """,
        params=(list(pipeline_names), lookback_hours),
        database=database,
        fetch=True,
    )
    return rows or []


def _lmp_repair_freshness_summary(database: str | None) -> list[dict[str, Any]]:
    rows = db.execute_sql(
        """
        WITH expected AS (
            SELECT unnest(%s::text[]) AS target_table
        ),
        repair_logs AS (
            SELECT
                target_table,
                status,
                http_status,
                rows_returned,
                created_at,
                metadata
            FROM ops.api_fetch_log
            WHERE target_table = ANY(%s)
              AND metadata ->> 'run_mode' = 'backfill'
              AND metadata ->> 'repair_family' = %s
        ),
        latest_attempt AS (
            SELECT DISTINCT ON (target_table)
                target_table,
                status AS latest_status,
                http_status AS latest_http_status,
                rows_returned AS latest_rows_returned,
                created_at AS last_attempt_at,
                metadata ->> 'backfill_start_date' AS latest_start_date,
                metadata ->> 'backfill_end_date' AS latest_end_date
            FROM repair_logs
            ORDER BY target_table, created_at DESC
        ),
        latest_success AS (
            SELECT DISTINCT ON (target_table)
                target_table,
                rows_returned AS last_success_rows_returned,
                created_at AS last_success_at,
                metadata ->> 'backfill_start_date' AS last_success_start_date,
                metadata ->> 'backfill_end_date' AS last_success_end_date
            FROM repair_logs
            WHERE status = 'success'
            ORDER BY target_table, created_at DESC
        )
        SELECT
            expected.target_table,
            latest_attempt.latest_status,
            latest_attempt.latest_http_status,
            latest_attempt.latest_rows_returned,
            latest_attempt.last_attempt_at,
            latest_attempt.latest_start_date,
            latest_attempt.latest_end_date,
            latest_success.last_success_rows_returned,
            latest_success.last_success_at,
            latest_success.last_success_start_date,
            latest_success.last_success_end_date
        FROM expected
        LEFT JOIN latest_attempt USING (target_table)
        LEFT JOIN latest_success USING (target_table)
        ORDER BY expected.target_table;
        """,
        params=(
            list(LMP_REPAIR_TARGET_TABLES),
            list(LMP_REPAIR_TARGET_TABLES),
            LMP_REPAIR_FAMILY,
        ),
        database=database,
        fetch=True,
    )
    return rows or []


def _support_table_summary(database: str | None) -> list[dict[str, Any]]:
    union_sql = " UNION ALL\n".join(
        (
            "SELECT "
            f"'{feed.pipeline_name}' AS feed_name, "
            f"'{feed.table_schema}.{feed.table_name}' AS table_name, "
            "COUNT(*)::bigint AS row_count, "
            "MAX(updated_at) AS latest_updated_at "
            f'FROM "{feed.table_schema}"."{feed.table_name}"'
        )
        for feed in SUPPORT_FEEDS
    )
    rows = db.execute_sql(
        f"""
        {union_sql}
        ORDER BY feed_name;
        """,
        database=database,
        fetch=True,
    )
    return rows or []


def _dbt_product_matching_test(database: str | None = None) -> dict[str, Any]:
    repo_root = Path(__file__).resolve().parents[3]
    dbt_project_dir = repo_root / "dbt" / "azure_postgres"
    profiles_dir_arg = "."
    command = [
        _resolve_dbt_executable(),
        "test",
        "--profiles-dir",
        profiles_dir_arg,
        "--select",
        DBT_PRODUCT_MATCHING_SELECT,
    ]

    if not dbt_project_dir.exists():
        return _product_matching_fallback_result(
            reason=f"dbt project directory not found: {dbt_project_dir}",
            command=command,
            database=database,
        )

    env = _dbt_test_environment()
    missing = [
        name
        for name in (
            "DBT_POSTGRES_HOST",
            "DBT_POSTGRES_READONLY_USER",
            "DBT_POSTGRES_READONLY_PASSWORD",
            "DBT_POSTGRES_DBNAME",
        )
        if not env.get(name)
    ]
    if missing:
        return _product_matching_fallback_result(
            reason="Missing dbt read-only environment variables: " + ", ".join(missing),
            command=command,
            database=database,
        )

    temp_profiles_dir: tempfile.TemporaryDirectory[str] | None = None
    profiles_dir_arg, temp_profiles_dir = _dbt_profiles_dir_arg(dbt_project_dir)
    command = [
        _resolve_dbt_executable(),
        "test",
        "--profiles-dir",
        profiles_dir_arg,
        "--select",
        DBT_PRODUCT_MATCHING_SELECT,
    ]

    try:
        completed = subprocess.run(
            command,
            cwd=dbt_project_dir,
            env=env,
            check=False,
            capture_output=True,
            text=True,
            timeout=DBT_PRODUCT_MATCHING_TIMEOUT_SECONDS,
        )
    except FileNotFoundError:
        return _product_matching_fallback_result(
            reason="dbt executable not found in the Python environment or on PATH.",
            command=command,
            database=database,
        )
    except subprocess.TimeoutExpired as exc:
        fallback = _product_matching_fallback_result(
            reason=(
                "dbt product matching test timed out after "
                f"{DBT_PRODUCT_MATCHING_TIMEOUT_SECONDS} seconds."
            ),
            command=command,
            database=database,
        )
        fallback["stdout_tail"] = "\n".join(
            line
            for line in (
                _tail_lines(_strip_ansi(exc.stdout or "")),
                str(fallback.get("stdout_tail") or ""),
            )
            if line
        )
        fallback["stderr_tail"] = "\n".join(
            line
            for line in (
                _tail_lines(_strip_ansi(exc.stderr or "")),
                str(fallback.get("stderr_tail") or ""),
            )
            if line
        )
        return fallback
    finally:
        if temp_profiles_dir is not None:
            temp_profiles_dir.cleanup()

    return {
        "status": "pass" if completed.returncode == 0 else "fail",
        "command": " ".join(command),
        "message": (
            "dbt product matching tests passed."
            if completed.returncode == 0
            else "dbt product matching tests failed."
        ),
        "returncode": completed.returncode,
        "stdout_tail": _tail_lines(_strip_ansi(completed.stdout)),
        "stderr_tail": _tail_lines(_strip_ansi(completed.stderr)),
    }


def _product_matching_fallback_result(
    *,
    reason: str,
    command: list[str],
    database: str | None,
) -> dict[str, Any]:
    fallback = _generated_product_matching_sql_test(database=database)
    status_label = "passed" if fallback["status"] == "pass" else "failed"
    return {
        "status": fallback["status"],
        "command": " ".join(command),
        "message": (
            f"dbt unavailable ({reason}); generated SQL fallback {status_label}: "
            f"{fallback['message']}"
        ),
        "returncode": None,
        "stdout_tail": fallback.get("stdout_tail", ""),
        "stderr_tail": fallback.get("stderr_tail", ""),
    }


def _generated_product_matching_sql_test(database: str | None = None) -> dict[str, Any]:
    failing_counts: list[tuple[str, int]] = []
    commands: list[str] = []

    for label, relative_path, predicate in PRODUCT_MATCHING_GENERATED_SQL_CHECKS:
        source_sql = _strip_trailing_sql_semicolon(_load_generated_sql(relative_path))
        check_sql = f"""
        SELECT COUNT(*)::bigint AS failing_row_count
        FROM (
        {source_sql}
        ) AS generated_product_matching_rows
        WHERE {predicate};
        """
        commands.append(f"{label}: generated SQL where {predicate}")
        rows = db.execute_sql(check_sql, database=database, fetch=True)
        failing_row_count = int(rows[0]["failing_row_count"]) if rows else 0
        failing_counts.append((label, failing_row_count))

    total_failing_rows = sum(count for _, count in failing_counts)
    detail = ", ".join(f"{label}={count}" for label, count in failing_counts)
    return {
        "status": "pass" if total_failing_rows == 0 else "fail",
        "command": " | ".join(commands),
        "message": (
            "generated product matching SQL found no failing rows"
            if total_failing_rows == 0
            else f"generated product matching SQL found {total_failing_rows} failing rows"
        ),
        "returncode": 0 if total_failing_rows == 0 else 1,
        "stdout_tail": f"failing_row_counts: {detail}",
        "stderr_tail": "",
    }


def _load_generated_sql(relative_path: str) -> str:
    repo_root = Path(__file__).resolve().parents[3]
    sql_path = repo_root / relative_path
    return sql_path.read_text(encoding="utf-8")


def _strip_trailing_sql_semicolon(sql: str) -> str:
    return re.sub(r";\s*$", "", sql.strip())


def _dbt_test_environment() -> dict[str, str]:
    env = os.environ.copy()
    defaults = {
        "DBT_POSTGRES_HOST": credentials.AZURE_POSTGRESQL_DB_HOST,
        "DBT_POSTGRES_PORT": credentials.AZURE_POSTGRESQL_DB_PORT,
        "DBT_POSTGRES_DBNAME": credentials.AZURE_POSTGRESQL_DB_NAME,
        "DBT_POSTGRES_SSLMODE": credentials.AZURE_POSTGRESQL_DB_SSLMODE,
        "DBT_POSTGRES_READONLY_USER": "helios_readonly",
    }
    for name, value in defaults.items():
        if value and not env.get(name):
            env[name] = str(value)
    return env


def _dbt_profiles_dir_arg(
    dbt_project_dir: Path,
) -> tuple[str, tempfile.TemporaryDirectory[str] | None]:
    if (dbt_project_dir / "profiles.yml").exists():
        return ".", None

    profile_template = dbt_project_dir / "profiles.yml.example"
    if not profile_template.exists():
        return ".", None

    temp_profiles_dir = tempfile.TemporaryDirectory(prefix="helios_dbt_profiles_")
    shutil.copy2(profile_template, Path(temp_profiles_dir.name) / "profiles.yml")
    return temp_profiles_dir.name, temp_profiles_dir


def _resolve_dbt_executable() -> str:
    python_dir = Path(sys.executable).parent
    candidates = [
        python_dir / "dbt",
        python_dir / "dbt.exe",
        python_dir / "Scripts" / "dbt",
        python_dir / "Scripts" / "dbt.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    return shutil.which("dbt") or "dbt"


def _strip_ansi(text: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


def _tail_lines(text: str, line_count: int = 25) -> str:
    lines = text.splitlines()
    return "\n".join(lines[-line_count:])


def _systemd_service_statuses(service_names: tuple[str, ...]) -> list[dict[str, str]]:
    statuses: list[dict[str, str]] = []
    for service_name in service_names:
        result = _run_systemctl(
            [
                "systemctl",
                "show",
                service_name,
                "--property=Id,ActiveState,SubState,Result,ExecMainStatus",
                "--no-pager",
            ]
        )
        if result.returncode != 0:
            statuses.append(
                {
                    "service": service_name,
                    "active_state": "unavailable",
                    "sub_state": "unavailable",
                    "result": result.stderr.strip() or result.stdout.strip(),
                    "exec_main_status": "",
                }
            )
            continue

        parsed = _parse_systemctl_show(result.stdout)
        statuses.append(
            {
                "service": service_name,
                "active_state": parsed.get("ActiveState", ""),
                "sub_state": parsed.get("SubState", ""),
                "result": parsed.get("Result", ""),
                "exec_main_status": parsed.get("ExecMainStatus", ""),
            }
        )
    return statuses


def _systemd_timers() -> list[str]:
    result = _run_systemctl(
        ["systemctl", "list-timers", HELIOS_TIMER_PATTERN, "--no-pager"]
    )
    if result.returncode != 0:
        return [result.stderr.strip() or result.stdout.strip() or "unavailable"]
    return [
        line.rstrip()
        for line in result.stdout.splitlines()
        if line.strip()
        and "timers listed" not in line
        and "Pass --all" not in line
    ]


def _run_systemctl(args: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(
            args=args,
            returncode=1,
            stdout="",
            stderr=str(exc),
        )


def _parse_systemctl_show(output: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for line in output.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            parsed[key] = value
    return parsed


def _evaluate_health(
    *,
    da_readiness: dict[str, Any] | None,
    rt_readiness: dict[str, Any] | None,
    rt_shape: dict[str, Any] | None,
    duplicate_key_count: int | None,
    api_summary: list[dict[str, Any]],
    support_api_summary: list[dict[str, Any]],
    support_table_summary: list[dict[str, Any]],
    service_statuses: list[dict[str, str]],
    generated_at: datetime,
    timers: list[str] | None = None,
    lmp_repair_summary: list[dict[str, Any]] | None = None,
    ercot_dam_readiness: dict[str, Any] | None = None,
    ercot_rt_readiness: dict[str, Any] | None = None,
    require_ercot_readiness: bool = False,
    product_matching_test: dict[str, Any] | None = None,
) -> list[HealthIssue]:
    issues: list[HealthIssue] = []
    today = generated_at.date()

    issues.extend(
        _evaluate_readiness(
            subject="DA hourly LMPs",
            readiness=da_readiness,
            max_lag_days=MAX_DA_BUSINESS_DATE_LAG_DAYS,
            today=today,
        )
    )
    issues.extend(
        _evaluate_readiness(
            subject="RT verified 5-min HRL LMPs",
            readiness=rt_readiness,
            max_lag_days=MAX_RT_BUSINESS_DATE_LAG_DAYS,
            today=today,
        )
    )
    if require_ercot_readiness or ercot_dam_readiness is not None:
        issues.extend(
            _evaluate_readiness(
                subject="ERCOT DAM SPP hubs",
                readiness=ercot_dam_readiness,
                max_lag_days=MAX_ERCOT_DAM_BUSINESS_DATE_LAG_DAYS,
                today=today,
            )
        )
    if require_ercot_readiness or ercot_rt_readiness is not None:
        issues.extend(
            _evaluate_readiness(
                subject="ERCOT RT SPP hubs",
                readiness=ercot_rt_readiness,
                max_lag_days=MAX_ERCOT_RT_BUSINESS_DATE_LAG_DAYS,
                today=today,
            )
        )

    if rt_shape is None:
        issues.append(
            HealthIssue(
                "FAIL",
                "RT verified 5-min HRL LMPs",
                "No current table rows found.",
            )
        )
    else:
        row_count = int(rt_shape["row_count"])
        pnode_count = int(rt_shape["pnode_count"])
        period_count = int(rt_shape["period_count"])
        expected_row_count = pnode_count * period_count
        if period_count < 276:
            issues.append(
                HealthIssue(
                    "FAIL",
                    "RT verified 5-min HRL LMPs",
                    f"Latest business date has only {period_count} periods.",
                )
            )
        if row_count != expected_row_count:
            issues.append(
                HealthIssue(
                    "FAIL",
                    "RT verified 5-min HRL LMPs",
                    (
                        "Latest business date row count does not match "
                        f"pnode_count x period_count ({row_count} vs {expected_row_count})."
                    ),
                )
            )

    if duplicate_key_count is None:
        issues.append(
            HealthIssue("WARN", "RT verified 5-min HRL LMPs", "Duplicate key check unavailable.")
        )
    elif duplicate_key_count > 0:
        issues.append(
            HealthIssue(
                "FAIL",
                "RT verified 5-min HRL LMPs",
                f"Latest business date has {duplicate_key_count} duplicate keys.",
            )
        )

    for row in api_summary:
        issue = _api_fetch_issue(row=row, subject=str(row["pipeline_name"]))
        if issue is not None:
            issues.append(issue)

    observed_pipelines = {row["pipeline_name"] for row in api_summary}
    for pipeline_name in CRITICAL_PIPELINES:
        if pipeline_name not in observed_pipelines:
            issues.append(
                HealthIssue(
                    "WARN",
                    pipeline_name,
                    "No API fetch telemetry in the health window.",
                )
            )

    if lmp_repair_summary is not None:
        issues.extend(
            _evaluate_lmp_repair_freshness(
                rows=lmp_repair_summary,
                generated_at=generated_at,
            )
        )

    support_api_by_pipeline = {
        str(row["pipeline_name"]): row for row in support_api_summary
    }
    for pipeline_name in SUPPORT_BATCH_PIPELINES:
        row = support_api_by_pipeline.get(pipeline_name)
        if row is None:
            issues.append(
                HealthIssue(
                    "WARN",
                    pipeline_name,
                    "No support-batch API fetch telemetry in the health window.",
                )
            )
            continue

        issue = _api_fetch_issue(row=row, subject=pipeline_name, label="support-batch")
        if issue is not None:
            issues.append(issue)

    support_tables_by_feed = {
        str(row["feed_name"]): row for row in support_table_summary
    }
    for pipeline_name in SUPPORT_BATCH_PIPELINES:
        row = support_tables_by_feed.get(pipeline_name)
        if row is None:
            issues.append(
                HealthIssue(
                    "WARN",
                    pipeline_name,
                    "Support table summary unavailable.",
                )
            )
            continue

        row_count = int(row["row_count"])
        latest_updated_at = row["latest_updated_at"]
        if row_count == 0:
            issues.append(
                HealthIssue(
                    "WARN",
                    pipeline_name,
                    "Support table has zero rows.",
                )
            )
        if latest_updated_at is None:
            issues.append(
                HealthIssue(
                    "WARN",
                    pipeline_name,
                    "Support table has no updated_at timestamp.",
                )
            )
            continue

        lag_hours = _hours_between(generated_at, latest_updated_at)
        if lag_hours > MAX_SUPPORT_TABLE_UPDATED_LAG_HOURS:
            issues.append(
                HealthIssue(
                    "WARN",
                    pipeline_name,
                    (
                        "Support table latest updated_at is "
                        f"{lag_hours:.1f} hours behind digest generation."
                    ),
                )
            )

    if product_matching_test is not None and product_matching_test.get("status") != "pass":
        issues.append(
            HealthIssue(
                "FAIL",
                "positions/trades product matching",
                str(product_matching_test.get("message") or "dbt product matching test failed."),
            )
        )

    for status in service_statuses:
        service_name = status["service"]
        if service_name in CRITICAL_SERVICES and status["result"] not in {"", "success"}:
            issues.append(
                HealthIssue(
                    "FAIL",
                    service_name,
                    (
                        "systemd result is "
                        f"{status['result']} with ExecMainStatus={status['exec_main_status']}."
                    ),
                )
            )
        elif service_name in SUPPORT_SERVICES and status["result"] not in {"", "success"}:
            issues.append(
                HealthIssue(
                    "WARN",
                    service_name,
                    (
                        "support batch systemd result is "
                        f"{status['result']} with ExecMainStatus={status['exec_main_status']}."
                    ),
                )
            )

    for timer_name in _unmanaged_helios_timers(timers or []):
        issues.append(
            HealthIssue(
                "WARN",
                timer_name,
                (
                    "Timer is enabled on the VM but is not tracked in "
                    "infrastructure/systemd. Disable it if it is a legacy job, "
                    "or promote it with a source/table contract and deployment entry."
                ),
            )
        )

    return issues


def _evaluate_lmp_repair_freshness(
    *,
    rows: list[dict[str, Any]],
    generated_at: datetime,
) -> list[HealthIssue]:
    if not rows:
        return [
            HealthIssue(
                "WARN",
                "LMP repair freshness",
                "No LMP repair telemetry summary returned.",
            )
        ]

    issues: list[HealthIssue] = []
    observed_targets = {str(row["target_table"]) for row in rows}
    for target_table in LMP_REPAIR_TARGET_TABLES:
        if target_table not in observed_targets:
            issues.append(
                HealthIssue(
                    "WARN",
                    target_table,
                    "Missing from LMP repair freshness summary.",
                )
            )

    for row in rows:
        target_table = str(row["target_table"])
        latest_status = row.get("latest_status")
        last_success_at = row.get("last_success_at")
        if latest_status is None:
            issues.append(
                HealthIssue(
                    "WARN",
                    target_table,
                    (
                        "No global LMP repair telemetry found for "
                        f"{LMP_REPAIR_FAMILY}."
                    ),
                )
            )
            continue

        if latest_status != "success":
            issues.append(
                HealthIssue(
                    "WARN",
                    target_table,
                    (
                        "Latest global LMP repair status is "
                        f"{latest_status} (HTTP {row.get('latest_http_status')})."
                    ),
                )
            )

        if last_success_at is None:
            issues.append(
                HealthIssue(
                    "WARN",
                    target_table,
                    "No successful global LMP repair telemetry found.",
                )
            )
            continue

        lag_hours = _hours_between(generated_at, last_success_at)
        if lag_hours > MAX_LMP_REPAIR_SUCCESS_LAG_HOURS:
            issues.append(
                HealthIssue(
                    "WARN",
                    target_table,
                    (
                        "Latest successful global LMP repair is "
                        f"{lag_hours:.1f} hours behind digest generation."
                    ),
                )
            )

    return issues


def _evaluate_readiness(
    *,
    subject: str,
    readiness: dict[str, Any] | None,
    max_lag_days: int,
    today: date,
) -> list[HealthIssue]:
    if readiness is None:
        return [HealthIssue("FAIL", subject, "No readiness event found.")]

    issues: list[HealthIssue] = []
    if readiness["completeness_status"] != "complete":
        issues.append(
            HealthIssue(
                "FAIL",
                subject,
                f"Latest readiness status is {readiness['completeness_status']}.",
            )
        )

    business_date = _as_date(readiness["business_date"])
    lag_days = (today - business_date).days
    if lag_days > max_lag_days:
        issues.append(
            HealthIssue(
                "FAIL",
                subject,
                (
                    f"Latest readiness business date {business_date.isoformat()} "
                    f"is {lag_days} days behind current date."
                ),
            )
        )

    return issues


def _api_fetch_issue(
    *,
    row: dict[str, Any],
    subject: str,
    label: str = "API",
) -> HealthIssue | None:
    failure_count = int(row["failure_count"])
    if failure_count == 0:
        return None

    fetch_count = int(row["fetch_count"])
    latest_status = str(row.get("latest_status") or "")
    latest_http_status = row.get("latest_http_status")
    if latest_status != "success":
        return HealthIssue(
            "WARN",
            subject,
            (
                f"Latest {label} fetch status is {latest_status} "
                f"(HTTP {latest_http_status}); {failure_count}/{fetch_count} "
                "fetches failed in the health window."
            ),
        )

    failure_rate = failure_count / fetch_count if fetch_count else 0
    if failure_rate > MAX_RECOVERED_API_FAILURE_RATE:
        return HealthIssue(
            "WARN",
            subject,
            (
                f"{failure_count}/{fetch_count} {label} fetches failed in the "
                "health window, despite latest fetch recovery."
            ),
        )

    return None


def _format_readiness(label: str, readiness: dict[str, Any] | None) -> str:
    if readiness is None:
        return f"- {label}: MISSING"
    business_date = _as_date(readiness["business_date"]).isoformat()
    created_at = _format_value(readiness["created_at"])
    return (
        f"- {label}: {readiness['completeness_status']} for {business_date}; "
        f"rows={readiness['row_count']}, entities={readiness['entity_count']}, "
        f"periods={readiness['period_count']}, created_at={created_at}"
    )


def _format_rt_shape(shape: dict[str, Any] | None, duplicate_key_count: int | None) -> str:
    if shape is None:
        return "- No current RT verified 5-min HRL rows found."
    business_date = _as_date(shape["business_date"]).isoformat()
    return (
        f"- Latest table date {business_date}: rows={shape['row_count']}, "
        f"pnodes={shape['pnode_count']}, types={shape['type_count']}, "
        f"periods={shape['period_count']}, duplicates={duplicate_key_count}, "
        f"window={_format_value(shape['min_utc'])} to {_format_value(shape['max_utc'])}"
    )


def _format_api_summary(rows: list[dict[str, Any]]) -> list[str]:
    if not rows:
        return ["- No API fetch telemetry in the health window."]
    return [
        (
            f"- {row['pipeline_name']}: fetches={row['fetch_count']}, "
            f"failures={row['failure_count']}, rows_returned={row['rows_returned']}, "
            f"latest_status={row.get('latest_status', 'unknown')}, "
            f"last_fetch_at={_format_value(row['last_fetch_at'])}"
        )
        for row in rows
    ]


def _format_lmp_repair_summary(rows: list[dict[str, Any]]) -> list[str]:
    if not rows:
        return ["- No LMP repair telemetry summary returned."]
    lines = [
        (
            "- Coverage: "
            f"{len([row for row in rows if row.get('last_success_at') is not None])}/"
            f"{len(LMP_REPAIR_TARGET_TABLES)} successful target-table repairs"
        )
    ]
    for row in rows:
        latest_window = _format_window(
            row.get("latest_start_date"),
            row.get("latest_end_date"),
        )
        success_window = _format_window(
            row.get("last_success_start_date"),
            row.get("last_success_end_date"),
        )
        lines.append(
            (
                f"- {row['target_table']}: latest_status="
                f"{row.get('latest_status') or 'missing'}, "
                f"last_attempt_at={_format_value(row.get('last_attempt_at'))}, "
                f"latest_rows={_format_value(row.get('latest_rows_returned'))}, "
                f"latest_window={latest_window}, "
                f"last_success_at={_format_value(row.get('last_success_at'))}, "
                f"success_rows={_format_value(row.get('last_success_rows_returned'))}, "
                f"success_window={success_window}"
            )
        )
    return lines


def _format_support_batch_summary(
    api_rows: list[dict[str, Any]],
    table_rows: list[dict[str, Any]],
) -> list[str]:
    api_by_pipeline = {str(row["pipeline_name"]): row for row in api_rows}
    table_by_feed = {str(row["feed_name"]): row for row in table_rows}
    lines = [
        (
            "- Coverage: "
            f"api={len(api_by_pipeline)}/{len(SUPPORT_BATCH_PIPELINES)}, "
            f"tables={len(table_by_feed)}/{len(SUPPORT_BATCH_PIPELINES)}"
        )
    ]
    for pipeline_name in SUPPORT_BATCH_PIPELINES:
        api_row = api_by_pipeline.get(pipeline_name)
        table_row = table_by_feed.get(pipeline_name)
        api_status = "missing"
        last_fetch_at = "NULL"
        failure_count = "NULL"
        if api_row is not None:
            api_status = str(api_row.get("latest_status") or "unknown")
            last_fetch_at = _format_value(api_row["last_fetch_at"])
            failure_count = str(api_row["failure_count"])

        row_count = "NULL"
        latest_updated_at = "NULL"
        if table_row is not None:
            row_count = str(table_row["row_count"])
            latest_updated_at = _format_value(table_row["latest_updated_at"])

        lines.append(
            (
                f"- {pipeline_name}: api={api_status}, failures={failure_count}, "
                f"last_fetch_at={last_fetch_at}, rows={row_count}, "
                f"updated_at={latest_updated_at}"
            )
        )
    return lines


def _format_product_matching_test(result: dict[str, Any] | None) -> str:
    if result is None:
        return "- not collected"

    line = (
        f"- {result.get('status', 'unknown')}: {result.get('message', '')} "
        f"command={result.get('command', '')}"
    )
    stdout_tail = str(result.get("stdout_tail") or "").strip()
    stderr_tail = str(result.get("stderr_tail") or "").strip()
    details = stdout_tail or stderr_tail
    if details:
        line = f"{line}\n  tail: {details.replace(chr(10), chr(10) + '  ')}"
    return line


def _format_service_statuses(rows: list[dict[str, str]]) -> list[str]:
    if not rows:
        return ["- systemd status not collected."]
    return [
        (
            f"- {row['service']}: active={row['active_state']}/"
            f"{row['sub_state']}, result={row['result']}, "
            f"exec_status={row['exec_main_status']}"
        )
        for row in rows
    ]


def _format_timers(rows: list[str]) -> list[str]:
    if not rows:
        return ["- systemd timers not collected."]
    return [f"- {row}" for row in rows]


def _format_issues(issues: list[HealthIssue]) -> list[str]:
    if not issues:
        return ["- PASS: no critical failures or warnings detected."]
    return [
        f"- {issue.severity}: {issue.subject}: {issue.message}"
        for issue in issues
    ]


def _unmanaged_helios_timers(timer_lines: list[str]) -> list[str]:
    known = set(KNOWN_TIMERS)
    observed: set[str] = set()
    for line in timer_lines:
        for token in line.split():
            if token.startswith("helios-") and token.endswith(".timer"):
                observed.add(token)
                break

    return sorted(observed - known)


def _as_date(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    return datetime.fromisoformat(str(value)).date()


def _format_value(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def _format_window(start: Any, end: Any) -> str:
    if start is None and end is None:
        return "NULL"
    return f"{_format_value(start)}..{_format_value(end)}"


def _hours_between(generated_at: datetime, value: Any) -> float:
    if isinstance(value, datetime):
        observed_at = value
    else:
        observed_at = datetime.fromisoformat(str(value))
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=timezone.utc)
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=timezone.utc)
    return (generated_at - observed_at).total_seconds() / 3600


if __name__ == "__main__":
    raise SystemExit(main())
