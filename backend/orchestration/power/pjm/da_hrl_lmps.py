import requests
import time
from io import BytesIO
import logging
from datetime import date, datetime, timezone
from dateutil.relativedelta import relativedelta
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import credentials
from backend.orchestration.power.pjm._policies import (
    DataNotYetAvailable,
    api_poll_policy,
)
from backend.utils import (
    db,
    email_notifications,
    slack_notifications,
    script_logging,
)
from backend.utils.data_availability import emit_data_availability_event
from backend.utils.ops_logging import log_api_fetch, redact_secrets

API_SCRAPE_NAME: str = "da_hrl_lmps"
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = "pjm"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
DATASET_NAME = "pjm_da_hrl_lmps"
DATA_SOURCE_SYSTEM = "pjm"
DATA_AVAILABILITY_TYPE = "data_ready"
DATA_SCOPE = "hub"
DATA_GRAIN = "date_hour_hub"
LOCAL_MARKET_TIMEZONE = "America/New_York"
DEFAULT_LOOKAHEAD_DAYS = 1

logger = logging.getLogger(__name__)


POLL_CEILING_SECONDS = 5 * 60 * 60
POLL_WAIT_SECONDS = 60


def _build_request(
    start_date: str,
    end_date: str,
    base_url: str = "https://api.pjm.com/api/v1/da_hrl_lmps",
) -> tuple[str, dict[str, str | int]]:
    """Build the PJM API request for DA LMPs without embedding secrets."""
    if not credentials.PJM_API_KEY:
        raise RuntimeError(
            "Missing PJM credentials. Configure PJM_API_KEY in backend/.env."
        )

    params = {
        "rowCount": 50000,
        "startRow": 1,
        "datetime_beginning_ept": f"{start_date} to {end_date}",
        "type": "hub",
        "format": "csv",
        "subscription-key": credentials.PJM_API_KEY,
    }
    logger.info(
        "Built PJM request for %s from %s to %s",
        urlsplit(base_url).path,
        start_date,
        end_date,
    )
    return base_url, params


@api_poll_policy(max_seconds=POLL_CEILING_SECONDS, wait_seconds=POLL_WAIT_SECONDS)
def _wait_for_data(url: str, params: dict[str, str | int]) -> requests.Response:
    """Poll the PJM API until a non-empty response is returned.

    PJM rate-limit note: PJM Data Miner 2 does *not* return HTTP 429 on
    burst traffic — observed 20 rapid sequential requests against
    /api/v1/da_hrl_lmps all returned 200 with the subscription key.
    The "not yet published" signal is a 200 with an empty body, which is
    why we poll on `DataNotYetAvailable` rather than on a status code.
    Don't add Retry-After handling here unless PJM's behavior changes.

    Minute polling keeps DA latency low without generating per-second request
    volume, and the 5h ceiling covers late postings while bounding each timer
    run.
    """
    response = requests.get(url, params=params, timeout=60)
    try:
        response.raise_for_status()
    except requests.HTTPError:
        raise RuntimeError(
            "PJM DA HRL LMPs API returned "
            f"HTTP {response.status_code}: {response.reason}"
        ) from None

    if not response.content:
        raise DataNotYetAvailable(
            "PJM DA HRL LMPs API returned empty response"
        )

    logger.info("Data received from PJM API")
    return response


def _wait_for_data_logged(
    url: str,
    params: dict[str, str | int],
    run_id: str | None = None,
    database: str | None = TARGET_DATABASE,
    metadata: dict[str, Any] | None = None,
) -> requests.Response:
    """Run the polling fetch and write one resolved ops.api_fetch_log row.

    ``_wait_for_data`` polls PJM every minute (up to 5h) and the request URL
    carries the subscription key, so per-poll logging would both flood the
    table and risk leaking the key. Instead this logs a single row for the
    resolved outcome — success when the body finally arrives, failure on the
    poll ceiling — with the total wait and poll count in metadata. The
    central redaction in log_api_fetch scrubs the key from any error string.
    """
    parsed_url = urlsplit(url)  # path only; the query holds subscription-key
    started = time.perf_counter()

    def _poll_count() -> int:
        stats = getattr(_wait_for_data, "statistics", {}) or {}
        return int(stats.get("attempt_number", 1))

    try:
        response = _wait_for_data(url=url, params=params)
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        log_api_fetch(
            actor_type="scrape",
            provider="pjm",
            pipeline_name=API_SCRAPE_NAME,
            run_id=run_id,
            operation_name="da_hrl_lmps_poll",
            target_table=f"pjm.{API_SCRAPE_NAME}",
            method="GET",
            target_host=parsed_url.netloc,
            target_path=parsed_url.path,
            status="failure",
            elapsed_ms=elapsed_ms,
            attempt=_poll_count(),
            error_type=type(exc).__name__,
            error_message=redact_secrets(str(exc)),
            metadata={
                **(metadata or {}),
                "poll_count": _poll_count(),
                "poll_seconds": round(elapsed_ms / 1000, 1),
            },
            database=database,
        )
        raise

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    text = response.text
    rows = max(0, sum(1 for line in text.splitlines() if line.strip()) - 1)
    poll_count = _poll_count()
    log_api_fetch(
        actor_type="scrape",
        provider="pjm",
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        operation_name="da_hrl_lmps_poll",
        target_table=f"pjm.{API_SCRAPE_NAME}",
        method="GET",
        target_host=parsed_url.netloc,
        target_path=parsed_url.path,
        status="success",
        http_status=response.status_code,
        elapsed_ms=elapsed_ms,
        attempt=poll_count,
        rows_returned=rows,
        metadata={
            **(metadata or {}),
            "poll_count": poll_count,
            "poll_seconds": round(elapsed_ms / 1000, 1),
        },
        database=database,
    )
    return response


def _pull(
    response: requests.Response,
) -> pd.DataFrame:
    """
        Day-Ahead Hourly LMPs
        https://dataminer2.pjm.com/feed/da_hrl_lmps/definition

        Posting Frequency: Daily
        Update Availability: Daily between 12:00 p.m. and 01:30 p.m. EPT (10:00 a.m. to 11:30 a.m. MST)
        Retention Time: Indefinitely
        Last Updated: 10/19/2024 11:02
        First Available: 6/1/2000 00:00
    """

    df = pd.read_csv(BytesIO(response.content), encoding="utf-8-sig")

    return df


def _format(
    df: pd.DataFrame,
) -> pd.DataFrame:

    # Remove unwanted characters from column names
    df.columns = df.columns.str.replace('ï»¿', '')

    # Convert to datetime (format: 1/28/2026 5:00:00 AM)
    for col in ['datetime_beginning_utc', 'datetime_beginning_ept']:
        df[col] = pd.to_datetime(df[col], format='%m/%d/%Y %I:%M:%S %p')

    return df


def _upsert(
    df: pd.DataFrame,
    database: str = TARGET_DATABASE,
    schema: str = TARGET_SCHEMA,
    table_name: str = TARGET_TABLE,
    primary_key: list = ['datetime_beginning_utc', 'pnode_id', 'pnode_name', 'row_is_current', 'version_nbr'],
):

    data_types: list = db.infer_sql_data_types(df=df)

    db.upsert_dataframe(
        database=database,
        schema=schema,
        table_name=table_name,
        df=df,
        columns=df.columns.tolist(),
        data_types=data_types,
        primary_key=primary_key,
    )


def _emit_data_availability_events(
    df: pd.DataFrame,
    run_id: str | None,
    database: str | None = TARGET_DATABASE,
) -> list[dict[str, Any]]:
    """Emit one readiness event per complete current DA business date."""
    if df.empty:
        logger.info("No DA HRL LMP rows available for readiness emission")
        return []

    required_columns = {
        "datetime_beginning_utc",
        "datetime_beginning_ept",
        "pnode_id",
        "row_is_current",
    }
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        raise ValueError(
            "Cannot assess DA HRL LMP data readiness; missing columns: "
            f"{sorted(missing_columns)}"
        )

    current_df = df.loc[_is_current_mask(df)].copy()
    if current_df.empty:
        logger.info("No current DA HRL LMP rows available for readiness emission")
        return []

    current_df["datetime_beginning_utc"] = pd.to_datetime(
        current_df["datetime_beginning_utc"]
    )
    current_df["datetime_beginning_ept"] = pd.to_datetime(
        current_df["datetime_beginning_ept"]
    )
    current_df["business_date"] = current_df["datetime_beginning_ept"].dt.date

    emitted: list[dict[str, Any]] = []
    for business_date, date_df in sorted(current_df.groupby("business_date")):
        event = _emit_data_availability_event_for_date(
            business_date=business_date,
            date_df=date_df,
            run_id=run_id,
            database=database,
        )
        if event:
            emitted.append(event)

    return emitted


def _emit_data_availability_event_for_date(
    *,
    business_date: date,
    date_df: pd.DataFrame,
    run_id: str | None,
    database: str | None,
) -> dict[str, Any] | None:
    expected_period_count = _expected_period_count_for_date(business_date)
    row_count = int(len(date_df))
    entity_count = int(date_df["pnode_id"].nunique())
    period_count = int(date_df["datetime_beginning_utc"].nunique())
    periods_per_entity = date_df.groupby("pnode_id")["datetime_beginning_utc"].nunique()
    min_periods_per_entity = int(periods_per_entity.min()) if entity_count else 0
    max_periods_per_entity = int(periods_per_entity.max()) if entity_count else 0
    duplicate_entity_period_rows = int(
        date_df.duplicated(["pnode_id", "datetime_beginning_utc"]).sum()
    )
    expected_row_count = entity_count * expected_period_count

    is_complete = (
        entity_count > 0
        and period_count == expected_period_count
        and min_periods_per_entity == expected_period_count
        and max_periods_per_entity == expected_period_count
        and row_count == expected_row_count
        and duplicate_entity_period_rows == 0
    )
    if not is_complete:
        logger.warning(
            "Skipping DA HRL LMP readiness event for %s; incomplete current rows "
            "(rows=%s, entities=%s, periods=%s, expected_periods=%s, "
            "min_periods_per_entity=%s, max_periods_per_entity=%s, duplicates=%s)",
            business_date,
            row_count,
            entity_count,
            period_count,
            expected_period_count,
            min_periods_per_entity,
            max_periods_per_entity,
            duplicate_entity_period_rows,
        )
        return None

    event_key = _data_availability_event_key(business_date)
    window_start = _utc_timestamp(date_df["datetime_beginning_utc"].min())
    window_end = _utc_timestamp(
        date_df["datetime_beginning_utc"].max() + pd.Timedelta(hours=1)
    )
    payload = {
        "business_date": business_date.isoformat(),
        "expected_period_count": expected_period_count,
        "expected_row_count": expected_row_count,
        "min_periods_per_entity": min_periods_per_entity,
        "max_periods_per_entity": max_periods_per_entity,
        "duplicate_entity_period_rows": duplicate_entity_period_rows,
        "window_end_convention": "exclusive",
    }

    return emit_data_availability_event(
        event_key=event_key,
        dataset=DATASET_NAME,
        source_system=DATA_SOURCE_SYSTEM,
        availability_type=DATA_AVAILABILITY_TYPE,
        business_date=business_date,
        window_start=window_start,
        window_end=window_end,
        scope=DATA_SCOPE,
        grain=DATA_GRAIN,
        source_table=TARGET_TABLE_FQN,
        row_count=row_count,
        entity_count=entity_count,
        period_count=period_count,
        completeness_status="complete",
        run_id=run_id,
        payload=payload,
        database=database,
    )


def _is_current_mask(df: pd.DataFrame) -> pd.Series:
    values = df["row_is_current"]
    if pd.api.types.is_bool_dtype(values):
        return values.fillna(False)
    return (
        values.astype(str)
        .str.strip()
        .str.lower()
        .isin({"true", "t", "1", "yes", "y"})
    )


def _data_availability_event_key(business_date: date) -> str:
    return (
        f"{DATASET_NAME}:{DATA_AVAILABILITY_TYPE}:"
        f"{business_date.isoformat()}:{DATA_SCOPE}"
    )


def _expected_period_count_for_date(business_date: date) -> int:
    start = pd.Timestamp(business_date).tz_localize(LOCAL_MARKET_TIMEZONE)
    end = (pd.Timestamp(business_date) + pd.Timedelta(days=1)).tz_localize(
        LOCAL_MARKET_TIMEZONE
    )
    return int((end - start) / pd.Timedelta(hours=1))


def _utc_timestamp(value: Any) -> datetime:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(timezone.utc)
    else:
        timestamp = timestamp.tz_convert(timezone.utc)
    return timestamp.to_pydatetime()


def _notify_da_slack_release_events(
    *,
    events: list[dict[str, Any]],
    run_mode: str,
    database: str | None,
    run_logger: Any,
) -> int:
    if run_mode != "scheduled":
        run_logger.info("Skipping DA release Slack notifications outside scheduled mode.")
        return 0
    if not events:
        return 0

    queued = 0
    try:
        for event in events:
            message = slack_notifications.build_pjm_da_hrl_lmp_release_slack(
                event=event,
            )
            enqueued = slack_notifications.enqueue_slack_notification(
                database=database,
                **message,
            )
            if enqueued.get("created"):
                queued += 1

        if not slack_notifications.notifications_enabled():
            run_logger.info(
                "DA release Slack notifications "
                f"queued={queued}; sending is disabled."
            )
            return queued

        processed = slack_notifications.send_due_slack_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "DA release Slack notifications "
            f"queued={queued}, processed={len(processed)}."
        )
    except Exception:
        run_logger.exception(
            "DA release Slack notification handling failed; "
            "scrape data and readiness events remain committed."
        )

    return queued


def _notify_da_email_release_events(
    *,
    events: list[dict[str, Any]],
    run_mode: str,
    database: str | None,
    run_logger: Any,
) -> int:
    if run_mode != "scheduled":
        run_logger.info("Skipping DA release email notifications outside scheduled mode.")
        return 0
    if not events:
        return 0

    queued = 0
    try:
        for event in events:
            enqueued_rows = (
                email_notifications.enqueue_pjm_da_hrl_lmp_release_notifications(
                    event=event,
                    database=database,
                )
            )
            queued += sum(1 for row in enqueued_rows if row.get("created"))

        if not email_notifications.notifications_enabled():
            run_logger.info(
                "DA release email notifications "
                f"queued={queued}; sending is disabled."
            )
            return queued

        processed = email_notifications.send_due_email_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "DA release email notifications "
            f"queued={queued}, processed={len(processed)}."
        )
    except Exception:
        run_logger.exception(
            "DA release email notification handling failed; "
            "scrape data and readiness events remain committed."
        )

    return queued


def main(
    start_date: str | None = None,
    end_date: str | None = None,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> pd.DataFrame:

    target_day = datetime.now() + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS)
    start_date = start_date or target_day.strftime("%Y-%m-%d 00:00")
    end_date = end_date or target_day.strftime("%Y-%m-%d 23:00")
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run_id = str(uuid4())

    run_logger.header(API_SCRAPE_NAME)
    run_logger.info(f"Run ID: {run_id}")
    run_logger.info(f"Run mode: {run_mode}")
    run_logger.info(
        "Polling window: "
        f"{POLL_CEILING_SECONDS // 3600}h ceiling, "
        f"{POLL_WAIT_SECONDS}s interval"
    )
    fetch_metadata = {"run_mode": run_mode, **(metadata or {})}
    try:

        run_logger.section("Building request ...")
        url, params = _build_request(start_date=start_date, end_date=end_date)

        run_logger.section("Waiting for data ...")
        response = _wait_for_data_logged(
            url=url,
            params=params,
            run_id=run_id,
            database=database,
            metadata=fetch_metadata,
        )

        run_logger.section("Pulling data ...")
        df = _pull(response=response)

        run_logger.section("Formatting data ...")
        df = _format(df=df)

        run_logger.section("Upserting data ...")
        _upsert(df=df, database=database)

        run_logger.section("Emitting data availability event(s) ...")
        events = _emit_data_availability_events(
            df=df,
            run_id=run_id,
            database=database,
        )
        if events:
            for event in events:
                status = "created" if event.get("created") else "already existed"
                run_logger.info(
                    f"Data availability event {event['event_key']} {status}."
                )
        else:
            run_logger.info(
                "No complete DA HRL LMP business date detected; "
                "no data availability event emitted."
            )

        run_logger.section("Handling release email notification(s) ...")
        _notify_da_email_release_events(
            events=events,
            run_mode=run_mode,
            database=database,
            run_logger=run_logger,
        )

        run_logger.section("Handling release Slack notification(s) ...")
        _notify_da_slack_release_events(
            events=events,
            run_mode=run_mode,
            database=database,
            run_logger=run_logger,
        )

        run_logger.success(f"{API_SCRAPE_NAME} completed; {len(df)} rows processed.")

    except Exception as e:
        run_logger.exception(f"Error pulling data: {redact_secrets(str(e))}")
        raise

    finally:
        script_logging.close_logging()

    if 'df' in locals() and df is not None:
        return df

if __name__ == "__main__":
    df = main()
