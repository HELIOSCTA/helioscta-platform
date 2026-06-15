"""Print a read-only HeliosCTA production health digest."""

from __future__ import annotations

import subprocess
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
    "helios-da-hrl-lmps.service",
    "helios-rt-fivemin-hrl-lmps.service",
    "helios-ercot-dam-stlmnt-pnt-prices.service",
    "helios-ercot-settlement-point-prices.service",
)
SUPPORT_SERVICES: tuple[str, ...] = (
    "helios-pjm-data-miner-batch.service",
    "helios-ercot-load-batch.service",
    "helios-ercot-congestion-batch.service",
    "helios-ercot-renewables-batch.service",
    "helios-ercot-renewables-5min-batch.service",
    "helios-ercot-outage-capacity-batch.service",
)
KNOWN_TIMERS: tuple[str, ...] = (
    "helios-da-hrl-lmps.timer",
    "helios-rt-fivemin-hrl-lmps.timer",
    "helios-prod-health-check.timer",
    "helios-pjm-data-miner-batch.timer",
    "helios-ercot-dam-stlmnt-pnt-prices.timer",
    "helios-ercot-settlement-point-prices.timer",
    "helios-ercot-load-batch.timer",
    "helios-ercot-congestion-batch.timer",
    "helios-ercot-renewables-batch.timer",
    "helios-ercot-renewables-5min-batch.timer",
    "helios-ercot-outage-capacity-batch.timer",
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
    SupportFeed("da_transconstraints", "pjm", "da_transconstraints"),
    SupportFeed("day_gen_capacity", "pjm", "day_gen_capacity"),
    SupportFeed("dispatched_reserves", "pjm", "dispatched_reserves"),
    SupportFeed("five_min_solar_generation", "pjm", "five_min_solar_generation"),
    SupportFeed("five_min_tie_flows", "pjm", "five_min_tie_flows"),
    SupportFeed("frcstd_gen_outages", "pjm", "frcstd_gen_outages"),
    SupportFeed("gen_outages_by_type", "pjm", "gen_outages_by_type"),
    SupportFeed("hrl_dmd_bids", "pjm", "hrl_dmd_bids"),
    SupportFeed("hrl_load_metered", "pjm", "hrl_load_metered"),
    SupportFeed("hrl_load_prelim", "pjm", "hrl_load_prelim"),
    SupportFeed("load_frcstd_7_day", "pjm", "load_frcstd_7_day"),
    SupportFeed("load_frcstd_hist", "pjm", "load_frcstd_hist"),
    SupportFeed("pnode", "pjm", "pnode"),
    SupportFeed("reserve_market_results", "pjm", "reserve_market_results"),
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
MAX_RECOVERED_API_FAILURE_RATE = 0.5


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
    support_table_summary = _support_table_summary(database=database)
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
        support_table_summary=support_table_summary,
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
        "support_table_summary": support_table_summary,
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
        "Support batch health",
        *_format_support_batch_summary(
            checks["support_api_summary"],
            checks["support_table_summary"],
        ),
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
    ercot_dam_readiness: dict[str, Any] | None = None,
    ercot_rt_readiness: dict[str, Any] | None = None,
    require_ercot_readiness: bool = False,
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
