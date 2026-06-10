"""PJM alert producers built on the generic alert outbox."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd
from psycopg2 import errors

from backend.alerts import alert_exists, emit_alert
from backend.utils import db

logger = logging.getLogger(__name__)

DA_HRL_LMPS_SCHEMA = "pjm"
DA_HRL_LMPS_TABLE = "da_hrl_lmps"
DA_HRL_LMPS_SOURCE = "pjm_da_hrl_lmps"
DA_HRL_LMPS_ALERT_TYPE = "data_arrival"
DA_HRL_LMPS_ALERT_PREFIX = "pjm_da_hrl_lmps_arrived"

DA_HRL_LMPS_PRIMARY_KEY = [
    "datetime_beginning_utc",
    "pnode_id",
    "pnode_name",
    "row_is_current",
    "version_nbr",
]

REQUIRED_LMP_COLUMNS = {
    "datetime_beginning_utc",
    "datetime_beginning_ept",
    "pnode_id",
    "pnode_name",
    "row_is_current",
    "version_nbr",
}

DEFAULT_RECONCILE_LOOKBACK_DAYS = 7

# Reconciled alerts older than this are written as audit-only rows with
# email_status='suppressed' so the Vercel email sender never sends a stale
# "DA arrived for <last week>" notification. Tune up if you want to email
# users about gaps the reconciler catches mid-week; tune down to be stricter.
EMAIL_FRESHNESS_DAYS = 2


def alert_key_for_da_hrl_lmps(da_date: date | str) -> str:
    return f"{DA_HRL_LMPS_ALERT_PREFIX}:{_coerce_date(da_date).isoformat()}"


def count_missing_da_hrl_lmp_rows_by_date(df: pd.DataFrame) -> dict[date, int]:
    """Return missing source-table PK counts per DA date for a pulled dataset.

    Returns an empty dict for empty or malformed frames so a single bad batch
    can't crash the whole flow. The reconciler will backfill any missing
    alerts from the source table on its next run.
    """
    if df.empty:
        return {}

    missing_cols = REQUIRED_LMP_COLUMNS - set(df.columns)
    if missing_cols:
        logger.warning(
            "Skipping DA HRL LMP alert check; frame missing columns %s. "
            "Columns present: %s",
            sorted(missing_cols),
            list(df.columns)[:10],
        )
        return {}

    formatted = _format_lmp_df_for_compare(df)
    start_date = formatted["da_date"].min()
    end_date = formatted["da_date"].max()
    existing = _load_existing_lmp_keys(start_date=start_date, end_date=end_date)

    if existing is None or existing.empty:
        return formatted.groupby("da_date").size().to_dict()

    existing_keys = {
        _row_key(row)
        for _, row in _format_lmp_df_for_compare(existing).iterrows()
    }

    missing_counts: dict[date, int] = {}
    for _, row in formatted.iterrows():
        if _row_key(row) not in existing_keys:
            da_date = row["da_date"]
            missing_counts[da_date] = missing_counts.get(da_date, 0) + 1

    return missing_counts


def emit_da_hrl_lmp_arrival_alert(
    df: pd.DataFrame,
    da_date: date | str,
    inserted_row_count: int,
    payload_extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Emit one idempotent alert for a loaded DA HRL LMP date."""
    coerced_date = _coerce_date(da_date)
    date_df = _filter_lmp_df_for_date(df, coerced_date)
    if date_df.empty:
        raise ValueError(f"No DA HRL LMP rows in dataframe for {coerced_date}")

    hour_ending = pd.to_datetime(date_df["datetime_beginning_ept"]).dt.hour + 1
    row_count = int(len(date_df))
    pnode_count = int(date_df["pnode_id"].nunique())
    hour_count = int(hour_ending.nunique())
    payload = {
        "da_date": coerced_date.isoformat(),
        "row_count": row_count,
        "inserted_row_count": int(inserted_row_count),
        "pnode_count": pnode_count,
        "hour_count": hour_count,
    }
    if payload_extra:
        payload.update(payload_extra)

    return emit_alert(
        alert_key=alert_key_for_da_hrl_lmps(coerced_date),
        alert_type=DA_HRL_LMPS_ALERT_TYPE,
        severity="info",
        title=f"PJM DA HRL LMPs available for {coerced_date}",
        message=(
            f"{row_count:,} rows loaded for {coerced_date} "
            f"({inserted_row_count:,} new rows, {pnode_count:,} pnodes, "
            f"{hour_count:,} hours)."
        ),
        source_system=DA_HRL_LMPS_SOURCE,
        payload=payload,
    )


def emit_da_hrl_lmp_arrival_alerts_for_new_rows(
    df: pd.DataFrame,
    missing_counts_by_date: dict[date, int],
) -> list[dict[str, Any]]:
    """Emit one alert per DA date that had newly inserted rows."""
    emitted: list[dict[str, Any]] = []
    for da_date, inserted_row_count in sorted(missing_counts_by_date.items()):
        if inserted_row_count <= 0:
            continue
        emitted.append(
            emit_da_hrl_lmp_arrival_alert(
                df=df,
                da_date=da_date,
                inserted_row_count=inserted_row_count,
            )
        )
    return emitted


def handle_da_hrl_lmp_arrival_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Compatibility helper for callers that already have an arrival payload."""
    da_date = payload.get("da_date")
    if not da_date:
        raise ValueError("PJM DA HRL LMP alert payload must include da_date")

    alert_payload = dict(payload)
    row_count = int(payload.get("row_count") or 0)
    pnode_count = int(payload.get("pnode_count") or 0)
    hour_count = int(payload.get("hour_count") or 0)

    return emit_alert(
        alert_key=alert_key_for_da_hrl_lmps(da_date),
        alert_type=DA_HRL_LMPS_ALERT_TYPE,
        severity="info",
        title=f"PJM DA HRL LMPs available for {_coerce_date(da_date)}",
        message=(
            f"{row_count:,} rows loaded for {_coerce_date(da_date)} "
            f"({pnode_count:,} pnodes, {hour_count:,} hours)."
        ),
        source_system=DA_HRL_LMPS_SOURCE,
        payload=alert_payload,
    )


def reconcile_da_hrl_lmp_arrival_alerts(
    target_date: date | str | None = None,
    lookback_days: int = DEFAULT_RECONCILE_LOOKBACK_DAYS,
) -> list[dict[str, Any]]:
    """Backfill missing PJM DA HRL LMP arrival alerts from source data."""
    summaries = _load_lmp_summaries(
        target_date=target_date,
        lookback_days=lookback_days,
    )
    if summaries is None or summaries.empty:
        logger.info("No PJM DA HRL LMP rows found for alert reconciliation")
        return []

    today = date.today()
    emitted: list[dict[str, Any]] = []
    for _, row in summaries.iterrows():
        da_date = _coerce_date(row["da_date"])
        key = alert_key_for_da_hrl_lmps(da_date)
        if alert_exists(key):
            continue

        age_days = (today - da_date).days
        email_status = "pending" if age_days <= EMAIL_FRESHNESS_DAYS else "suppressed"

        payload = {
            "da_date": da_date.isoformat(),
            "row_count": int(row["row_count"]),
            "inserted_row_count": 0,
            "pnode_count": int(row["pnode_count"]),
            "hour_count": int(row["hour_count"]),
            "reconciled": True,
            "age_days": age_days,
        }
        emitted.append(
            emit_alert(
                alert_key=key,
                alert_type=DA_HRL_LMPS_ALERT_TYPE,
                severity="info",
                title=f"PJM DA HRL LMPs available for {da_date}",
                message=(
                    f"{int(row['row_count']):,} rows found for {da_date} "
                    f"({int(row['pnode_count']):,} pnodes, "
                    f"{int(row['hour_count']):,} hours)."
                ),
                source_system=DA_HRL_LMPS_SOURCE,
                payload=payload,
                email_status=email_status,
            )
        )

    return emitted


def main(
    target_date: date | str | None = None,
    lookback_days: int = DEFAULT_RECONCILE_LOOKBACK_DAYS,
) -> list[dict[str, Any]]:
    return reconcile_da_hrl_lmp_arrival_alerts(
        target_date=target_date,
        lookback_days=lookback_days,
    )


def _load_existing_lmp_keys(start_date: date, end_date: date) -> pd.DataFrame | None:
    start = start_date.isoformat()
    end_exclusive = (end_date + timedelta(days=1)).isoformat()
    # Pull PK columns plus datetime_beginning_ept: PKs feed _row_key for
    # dedup; ept lets _format_lmp_df_for_compare compute da_date without
    # KeyError when the query returns rows.
    select_cols = sorted(set(DA_HRL_LMPS_PRIMARY_KEY) | {"datetime_beginning_ept"})
    columns = ", ".join(select_cols)
    query = f"""
        SELECT {columns}
        FROM {DA_HRL_LMPS_SCHEMA}.{DA_HRL_LMPS_TABLE}
        WHERE datetime_beginning_ept >= '{start}'::timestamp
          AND datetime_beginning_ept < '{end_exclusive}'::timestamp;
    """
    try:
        return db.fetch_df(query=query)
    except errors.UndefinedTable:
        logger.info(
            "%s.%s does not exist yet; treating all pulled rows as new",
            DA_HRL_LMPS_SCHEMA,
            DA_HRL_LMPS_TABLE,
        )
        return pd.DataFrame()


def _load_lmp_summaries(
    target_date: date | str | None,
    lookback_days: int,
) -> pd.DataFrame | None:
    if target_date is not None:
        start_date = end_date = _coerce_date(target_date)
    else:
        end_date = date.today()
        start_date = end_date - timedelta(days=lookback_days)

    start = start_date.isoformat()
    end_exclusive = (end_date + timedelta(days=1)).isoformat()
    query = f"""
        SELECT
            datetime_beginning_ept::date AS da_date,
            COUNT(*)::int AS row_count,
            COUNT(DISTINCT pnode_id)::int AS pnode_count,
            COUNT(DISTINCT (EXTRACT(HOUR FROM datetime_beginning_ept)::int + 1))::int
                AS hour_count
        FROM {DA_HRL_LMPS_SCHEMA}.{DA_HRL_LMPS_TABLE}
        WHERE datetime_beginning_ept >= '{start}'::timestamp
          AND datetime_beginning_ept < '{end_exclusive}'::timestamp
        GROUP BY 1
        ORDER BY 1;
    """
    return db.fetch_df(query=query)


def _format_lmp_df_for_compare(df: pd.DataFrame) -> pd.DataFrame:
    formatted = df.copy()
    # PJM CSV responses sometimes carry a UTF-8 BOM on the first column
    # header (ï»¿datetime_beginning_utc). Strip it so column lookups by
    # name resolve consistently with the producer's _format step.
    formatted.columns = formatted.columns.str.replace("ï»¿", "")
    for col in ["datetime_beginning_utc", "datetime_beginning_ept"]:
        formatted[col] = pd.to_datetime(formatted[col]).dt.tz_localize(None)
    formatted["da_date"] = formatted["datetime_beginning_ept"].dt.date
    return formatted


def _filter_lmp_df_for_date(df: pd.DataFrame, da_date: date) -> pd.DataFrame:
    formatted = _format_lmp_df_for_compare(df)
    return formatted[formatted["da_date"] == da_date]


def _row_key(row: pd.Series) -> tuple[Any, ...]:
    return (
        pd.Timestamp(row["datetime_beginning_utc"]).to_pydatetime(),
        int(row["pnode_id"]),
        str(row["pnode_name"]),
        bool(row["row_is_current"]),
        int(row["version_nbr"]),
    )


def _coerce_date(value: date | str | pd.Timestamp) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.Timestamp(value).date()


if __name__ == "__main__":
    main()
