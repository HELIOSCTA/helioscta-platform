"""Shared CAISO OASIS LMP normalization."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pandas as pd

from backend.scrapes.power.caiso import oasis
from backend.utils import db


LOCAL_MARKET_TIMEZONE = "America/Los_Angeles"
DEFAULT_TRADING_HUB_NODES = ("TH_NP15_GEN-APND", "TH_SP15_GEN-APND")

PRIMARY_KEY = ["interval_start_time_utc", "node_id", "market_run_id"]
TARGET_COLUMNS = [
    "interval_start_time_utc",
    "interval_end_time_utc",
    "operating_date",
    "operating_hour",
    "operating_interval",
    "node_id_xml",
    "node_id",
    "node",
    "market_run_id",
    "pnode_resmrid",
    "grp_type",
    "locational_marginal_price",
    "energy_component",
    "congestion_component",
    "loss_component",
    "greenhouse_gas_component",
    "source_query_name",
    "source_version",
]
TARGET_DATA_TYPES = [
    "TIMESTAMPTZ",
    "TIMESTAMPTZ",
    "DATE",
    "INTEGER",
    "INTEGER",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "VARCHAR",
    "FLOAT",
    "FLOAT",
    "FLOAT",
    "FLOAT",
    "FLOAT",
    "VARCHAR",
    "INTEGER",
]

COMPONENT_COLUMN_BY_LMP_TYPE = {
    "LMP": "locational_marginal_price",
    "MCE": "energy_component",
    "MCC": "congestion_component",
    "MCL": "loss_component",
    "MGHG": "greenhouse_gas_component",
}
COMPONENT_COLUMNS = list(COMPONENT_COLUMN_BY_LMP_TYPE.values())
PRICE_COLUMN_CANDIDATES = ("mw", "value", "prc")


def pull_lmps(
    *,
    trading_date,
    query_name: str,
    market_run_id: str,
    version: int,
    pipeline_name: str,
    target_table: str,
    nodes: list[str] | tuple[str, ...] | None = None,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
    log_fetch: bool = True,
) -> pd.DataFrame:
    """Pull and normalize CAISO OASIS LMP rows for one Pacific trading date."""
    nodes = tuple(nodes or DEFAULT_TRADING_HUB_NODES)
    business_date = coerce_trading_date(trading_date)
    start_utc, end_utc = market_day_window_utc(business_date)
    startdatetime = format_oasis_datetime(start_utc)
    enddatetime = format_oasis_datetime(end_utc)
    raw_df = oasis.fetch_single_zip_csv(
        query_name=query_name,
        market_run_id=market_run_id,
        version=version,
        startdatetime=startdatetime,
        enddatetime=enddatetime,
        nodes=nodes,
        pipeline_name=pipeline_name,
        run_id=run_id,
        feed_name=pipeline_name,
        target_table=target_table,
        operation_name=pipeline_name,
        metadata={
            "trading_date": business_date.isoformat(),
            **(metadata or {}),
        },
        database=database,
        log_fetch=log_fetch,
    )
    return format_oasis_lmp_rows(
        raw_df,
        source_query_name=query_name,
        source_version=version,
    )


def format_oasis_lmp_rows(
    df: pd.DataFrame,
    *,
    source_query_name: str,
    source_version: int,
) -> pd.DataFrame:
    """Normalize CAISO OASIS component rows into one row per node interval."""
    if df.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    current = df.copy()
    current.columns = (
        current.columns.str.strip()
        .str.replace(" ", "_")
        .str.replace("-", "_")
        .str.lower()
    )
    _require_columns(
        current,
        [
            "intervalstarttime_gmt",
            "intervalendtime_gmt",
            "opr_dt",
            "opr_hr",
            "node_id_xml",
            "node_id",
            "node",
            "market_run_id",
            "lmp_type",
            "pnode_resmrid",
            "grp_type",
        ],
    )
    price_column = _resolve_price_column(current)

    current["interval_start_time_utc"] = pd.to_datetime(
        current["intervalstarttime_gmt"],
        utc=True,
        errors="raise",
    )
    current["interval_end_time_utc"] = pd.to_datetime(
        current["intervalendtime_gmt"],
        utc=True,
        errors="raise",
    )
    current["operating_date"] = pd.to_datetime(
        current["opr_dt"],
        errors="raise",
    ).dt.date
    current["operating_hour"] = pd.to_numeric(
        current["opr_hr"],
        errors="raise",
    ).astype(int)
    if "opr_interval" in current.columns:
        current["operating_interval"] = pd.to_numeric(
            current["opr_interval"],
            errors="raise",
        ).astype(int)
    else:
        current["operating_interval"] = 0

    for column in [
        "node_id_xml",
        "node_id",
        "node",
        "market_run_id",
        "pnode_resmrid",
        "grp_type",
        "lmp_type",
    ]:
        current[column] = current[column].astype(str).str.strip()

    current["component_column"] = current["lmp_type"].str.upper().map(
        COMPONENT_COLUMN_BY_LMP_TYPE
    )
    current = current.dropna(subset=["component_column"]).copy()
    if current.empty:
        return pd.DataFrame(columns=TARGET_COLUMNS)

    current["component_price"] = pd.to_numeric(
        current[price_column],
        errors="coerce",
    )
    base_columns = [
        "interval_start_time_utc",
        "interval_end_time_utc",
        "operating_date",
        "operating_hour",
        "operating_interval",
        "node_id_xml",
        "node_id",
        "node",
        "market_run_id",
        "pnode_resmrid",
        "grp_type",
    ]
    wide = (
        current.groupby(base_columns + ["component_column"], dropna=False)[
            "component_price"
        ]
        .last()
        .unstack("component_column")
        .reset_index()
        .rename_axis(columns=None)
    )
    for column in COMPONENT_COLUMNS:
        if column not in wide.columns:
            wide[column] = pd.NA

    wide["source_query_name"] = source_query_name
    wide["source_version"] = int(source_version)
    wide.dropna(subset=PRIMARY_KEY, inplace=True)
    wide.drop_duplicates(subset=PRIMARY_KEY, keep="last", inplace=True)
    wide.sort_values(PRIMARY_KEY, inplace=True)
    wide.reset_index(drop=True, inplace=True)
    return wide[TARGET_COLUMNS]


def upsert_lmps(
    *,
    df: pd.DataFrame,
    schema: str,
    table_name: str,
    database: str | None = None,
    primary_key: list[str] | None = None,
) -> None:
    """Upsert normalized CAISO LMP rows into a pre-created target table."""
    if df.empty:
        return

    key_columns = primary_key or PRIMARY_KEY
    missing_keys = [column for column in key_columns if column not in df.columns]
    if missing_keys:
        raise ValueError(
            f"Missing primary key columns for {schema}.{table_name}: {missing_keys}"
        )

    db.upsert_dataframe(
        database=database,
        schema=schema,
        table_name=table_name,
        df=df[TARGET_COLUMNS],
        columns=TARGET_COLUMNS,
        data_types=TARGET_DATA_TYPES,
        primary_key=key_columns,
    )


def coerce_trading_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.Timestamp(value).date()


def market_day_window_utc(trading_date) -> tuple[pd.Timestamp, pd.Timestamp]:
    business_date = coerce_trading_date(trading_date)
    start_local = pd.Timestamp(business_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    end_local = pd.Timestamp(business_date + timedelta(days=1)).tz_localize(
        LOCAL_MARKET_TIMEZONE
    )
    return start_local.tz_convert("UTC"), end_local.tz_convert("UTC")


def format_oasis_datetime(timestamp: pd.Timestamp) -> str:
    return timestamp.strftime("%Y%m%dT%H:%M-0000")


def _resolve_price_column(df: pd.DataFrame) -> str:
    for column in PRICE_COLUMN_CANDIDATES:
        if column in df.columns:
            return column
    raise ValueError(
        "CAISO OASIS LMP response missing price column; expected one of "
        f"{PRICE_COLUMN_CANDIDATES}"
    )


def _require_columns(df: pd.DataFrame, columns: list[str]) -> None:
    missing = [column for column in columns if column not in df.columns]
    if missing:
        raise ValueError(f"CAISO OASIS LMP response missing columns: {missing}")
