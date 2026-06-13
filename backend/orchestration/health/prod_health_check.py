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
)
CRITICAL_SERVICES: tuple[str, ...] = (
    "helios-da-hrl-lmps.service",
    "helios-rt-fivemin-hrl-lmps.service",
)
SUPPORT_SERVICES: tuple[str, ...] = (
    "helios-pjm-data-miner-batch.service",
)
HELIOS_TIMER_PATTERN = "helios-*"
DA_DATASET = "pjm_da_hrl_lmps"
RT_FIVEMIN_HRL_DATASET = "pjm_rt_fivemin_hrl_lmps"
RT_FIVEMIN_HRL_TABLE = "pjm.rt_fivemin_hrl_lmps"
DEFAULT_LOOKBACK_HOURS = 24
MAX_DA_BUSINESS_DATE_LAG_DAYS = 1
MAX_RT_BUSINESS_DATE_LAG_DAYS = 4


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
) -> dict[str, Any]:
    """Collect read-only health data from Postgres and optional systemd."""
    da_readiness = _latest_readiness_event(
        dataset=DA_DATASET,
        database=database,
    )
    rt_readiness = _latest_readiness_event(
        dataset=RT_FIVEMIN_HRL_DATASET,
        database=database,
    )
    rt_shape = _rt_fivemin_hrl_latest_shape(database=database)
    api_summary = _api_fetch_summary(
        pipeline_names=CRITICAL_PIPELINES,
        lookback_hours=lookback_hours,
        database=database,
    )
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
        rt_shape=rt_shape,
        duplicate_key_count=duplicate_key_count,
        api_summary=api_summary,
        service_statuses=service_statuses,
        today=date.today(),
    )

    return {
        "da_readiness": da_readiness,
        "rt_readiness": rt_readiness,
        "rt_shape": rt_shape,
        "duplicate_key_count": duplicate_key_count,
        "api_summary": api_summary,
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
        "",
        "RT verified 5-min HRL table shape",
        _format_rt_shape(checks["rt_shape"], checks["duplicate_key_count"]),
        "",
        "API fetch health",
        *_format_api_summary(checks["api_summary"]),
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
        SELECT
            pipeline_name,
            COUNT(*) AS fetch_count,
            COUNT(*) FILTER (WHERE status <> 'success') AS failure_count,
            COALESCE(SUM(rows_returned), 0) AS rows_returned,
            MAX(created_at) AS last_fetch_at
        FROM ops.api_fetch_log
        WHERE pipeline_name = ANY(%s)
          AND created_at >= NOW() - (%s || ' hours')::interval
        GROUP BY pipeline_name
        ORDER BY pipeline_name;
        """,
        params=(list(pipeline_names), lookback_hours),
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
    service_statuses: list[dict[str, str]],
    today: date,
) -> list[HealthIssue]:
    issues: list[HealthIssue] = []

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
        failure_count = int(row["failure_count"])
        if failure_count > 0:
            issues.append(
                HealthIssue(
                    "WARN",
                    str(row["pipeline_name"]),
                    f"{failure_count} API fetch failures in the health window.",
                )
            )

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
            f"last_fetch_at={_format_value(row['last_fetch_at'])}"
        )
        for row in rows
    ]


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


if __name__ == "__main__":
    raise SystemExit(main())
