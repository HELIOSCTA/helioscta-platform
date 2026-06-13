"""ERCOT Real-Time Settlement Point Prices.

Source definition:
https://www.ercot.com/mp/data-products/data-product-details?id=NP6-905-CD

Feed metadata reviewed from ERCOT Data Product Details on 2026-06-13:
- Feed short name: settlement_point_prices
- EMIL ID: NP6-905-CD
- Report Type ID: 12301
- Display name: Settlement Point Prices at Resource Nodes, Hubs and Load Zones
- Category: Real-Time Market, Settlement Point Prices
- Description: Settlement Point Price for each Settlement Point, produced from
  SCED LMPs every 15 minutes.
- Posting frequency: Chron - 15 Minutes
- First available: 2010-11-30
- Audience: Public
- Channel: Public, EWS, Data Portal
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend import credentials
from backend.scrapes.power.ercot.feed_configs import FEED_CONFIGS
from backend.scrapes.power.ercot.public_report_feed import (
    pull_public_report,
    upsert_public_report_frame,
)
from backend.utils import script_logging


CONFIG = FEED_CONFIGS["settlement_point_prices"]
API_SCRAPE_NAME = CONFIG.feed_name
TARGET_DATABASE: str | None = CONFIG.target_database
TARGET_SCHEMA = CONFIG.target_schema
TARGET_TABLE = CONFIG.target_table
TARGET_TABLE_FQN = CONFIG.target_table_fqn
PRIMARY_KEY = list(CONFIG.primary_key)
DEFAULT_SETTLEMENT_POINTS = (
    "HB_NORTH",
    "HB_SOUTH",
    "HB_WEST",
    "HB_HOUSTON",
)
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKBACK_DAYS = CONFIG.default_lookback_days
DEFAULT_LOOKAHEAD_DAYS = CONFIG.default_lookahead_days

logger = logging.getLogger(__name__)


def _resolve_default_start_date() -> datetime:
    return datetime.now() - relativedelta(days=DEFAULT_LOOKBACK_DAYS)


def _resolve_default_end_date() -> datetime:
    return datetime.now() + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS)


def _pull(
    *,
    start_date: datetime,
    end_date: datetime | None = None,
    settlement_points: Iterable[str] = DEFAULT_SETTLEMENT_POINTS,
    run_id: str | None = None,
    database: str | None = None,
    metadata: dict | None = None,
) -> pd.DataFrame:
    """Pull ERCOT RT settlement point prices for configured settlement points."""
    end_date = end_date or start_date
    frames: list[pd.DataFrame] = []
    for settlement_point in settlement_points:
        params = {
            "deliveryDateFrom": start_date.strftime("%Y-%m-%d"),
            "deliveryDateTo": end_date.strftime("%Y-%m-%d"),
            "settlementPoint": settlement_point,
        }
        df = pull_public_report(
            CONFIG,
            params=params,
            run_id=run_id,
            database=database,
            metadata={
                "settlement_point": settlement_point,
                **(metadata or {}),
            },
        )
        if not df.empty:
            frames.append(df)

    combined = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    return _filter_and_format(combined, settlement_points=settlement_points)


def _filter_and_format(
    df: pd.DataFrame,
    *,
    settlement_points: Iterable[str] = DEFAULT_SETTLEMENT_POINTS,
) -> pd.DataFrame:
    if df.empty:
        return df

    settlement_point_set = {str(point).strip() for point in settlement_points}
    df = df.copy()
    df["settlementpoint"] = df["settlementpoint"].astype("string").str.strip()
    df = df.loc[df["settlementpoint"].isin(settlement_point_set)].copy()
    if df.empty:
        return df

    df["deliveryhour"] = pd.to_numeric(df["deliveryhour"], errors="coerce").astype("Int64")
    df["deliveryinterval"] = pd.to_numeric(
        df["deliveryinterval"],
        errors="coerce",
    ).astype("Int64")
    df["settlementpointprice"] = pd.to_numeric(
        df["settlementpointprice"],
        errors="coerce",
    )
    df = df.dropna(subset=PRIMARY_KEY)
    df["deliveryhour"] = df["deliveryhour"].astype(int)
    df["deliveryinterval"] = df["deliveryinterval"].astype(int)
    df.drop_duplicates(subset=PRIMARY_KEY, keep="last", inplace=True)
    df.sort_values(PRIMARY_KEY, inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def _upsert(
    df: pd.DataFrame,
    database: str | None = TARGET_DATABASE,
) -> None:
    upsert_public_report_frame(df, CONFIG, database=database)


def main(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    delta: relativedelta = DEFAULT_DELTA,
    settlement_points: Iterable[str] = DEFAULT_SETTLEMENT_POINTS,
    database: str | None = None,
) -> pd.DataFrame | None:
    """Run the ERCOT RT settlement point price scrape."""
    start_date = start_date or _resolve_default_start_date()
    end_date = end_date or _resolve_default_end_date()
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    settlement_points = tuple(settlement_points)
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())
    rows_processed = 0
    frames: list[pd.DataFrame] = []

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Settlement points: {', '.join(settlement_points)}")

        current_date = start_date
        while current_date <= end_date:
            run_logger.section(f"Pulling data for {current_date:%Y-%m-%d}...")
            df = _pull(
                start_date=current_date,
                end_date=current_date,
                settlement_points=settlement_points,
                run_id=run_id,
                database=database,
            )

            if df.empty:
                run_logger.section(f"No data returned for {current_date:%Y-%m-%d}.")
            else:
                run_logger.section(f"Upserting {len(df)} rows...")
                _upsert(df, database=database)
                rows_processed += len(df)
                frames.append(df)
                run_logger.success(
                    f"Successfully pulled and upserted data for {current_date:%Y-%m-%d}."
                )

            current_date += delta

        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {rows_processed} rows processed."
        )

    except Exception as exc:
        run_logger.exception(f"Pipeline failed: {exc}")
        raise

    finally:
        script_logging.close_logging()

    return pd.concat(frames, ignore_index=True) if frames else None


if __name__ == "__main__":
    main()

