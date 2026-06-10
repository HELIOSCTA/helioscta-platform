import requests
import time
from io import StringIO
import logging
from datetime import datetime
from dateutil.relativedelta import relativedelta
from pathlib import Path
import sys
from urllib.parse import urlsplit

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend import credentials
from backend.orchestration.power.pjm._policies import (
    DataNotYetAvailable,
    api_poll_policy,
)
from backend.orchestration.power.pjm import alerts as pjm_alerts
from backend.utils import (
    db,
    script_logging,
)
from backend.utils.ops_logging import PipelineRunLogger, log_api_fetch

API_SCRAPE_NAME: str = "da_hrl_lmps"
TARGET_DATABASE = "helios_prod"
TARGET_SCHEMA = "pjm"
TARGET_TABLE = API_SCRAPE_NAME
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"

logger = logging.getLogger(__name__)


POLL_CEILING_SECONDS = 3 * 60 * 60  # 3 hours


def _build_url(
    start_date: str,
    end_date: str,
    base_url: str = "https://api.pjm.com/api/v1/da_hrl_lmps",
) -> str:
    """Build the PJM API URL for DA LMPs."""

    url = (
        f"{base_url}"
        f"?rowCount=50000"
        f"&startRow=1"
        f"&datetime_beginning_ept={start_date}%20to%20{end_date}"
        f"&type=hub"
        f"&format=csv"
        f"&subscription-key={credentials.PJM_API_KEY}"
    )
    logger.info(
        "Built PJM URL for %s from %s to %s",
        urlsplit(base_url).path,
        start_date,
        end_date,
    )
    return url


@api_poll_policy(max_seconds=POLL_CEILING_SECONDS, wait_seconds=1)
def _wait_for_data(url: str) -> requests.Response:
    """Poll the PJM API until a non-empty response is returned.

    PJM rate-limit note: PJM Data Miner 2 does *not* return HTTP 429 on
    burst traffic — observed 20 rapid sequential requests against
    /api/v1/da_hrl_lmps all returned 200 with the subscription key.
    The "not yet published" signal is a 200 with an empty body, which is
    why we poll on `DataNotYetAvailable` rather than on a status code.
    Don't add Retry-After handling here unless PJM's behavior changes.

    Aggressive 1s polling is intentional: DA latency to user-visible
    alerts matters, the API is not rate-limited, and the 3h ceiling caps
    total request volume per cron tick.
    """
    response = requests.get(url, timeout=60)
    response.raise_for_status()

    if not response.content:
        raise DataNotYetAvailable(
            "PJM DA HRL LMPs API returned empty response"
        )

    logger.info("Data received from PJM API")
    return response


def _wait_for_data_logged(
    url: str,
    run_id: str | None = None,
    database: str = TARGET_DATABASE,
) -> requests.Response:
    """Run the polling fetch and write one resolved ops.api_fetch_log row.

    ``_wait_for_data`` polls PJM every second (up to 3h) and the request URL
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
        response = _wait_for_data(url=url)
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
            error_message=str(exc),
            metadata={"poll_count": _poll_count(), "poll_seconds": round(elapsed_ms / 1000, 1)},
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
        metadata={"poll_count": poll_count, "poll_seconds": round(elapsed_ms / 1000, 1)},
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

    # read data
    df = pd.read_csv(StringIO(response.text))

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


def handle_event(payload: dict) -> None:
    """Emit a PJM DA HRL LMP arrival alert from a structured payload.

    Args:
        payload: JSON-like payload containing da_date, row_count,
            pnode_count, hour_count, and any source-specific metadata.
    """
    da_date = payload.get("da_date")
    logger.info(f"Event received for da_date={da_date}: {payload}")
    pjm_alerts.handle_da_hrl_lmp_arrival_payload(payload)


def main(
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.DataFrame:

    target_day = datetime.now() + relativedelta(days=1)
    start_date = start_date or target_day.strftime("%Y-%m-%d 00:00")
    end_date = end_date or target_day.strftime("%Y-%m-%d 23:00")
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=Path(__file__).parent / "logs",
        log_to_file=True,
        delete_if_no_errors=True,
    )
    run = PipelineRunLogger(
        pipeline_name=API_SCRAPE_NAME,
        source="power",
        target_table=TARGET_TABLE_FQN,
        operation_type="upsert",
        log_file_path=run_logger.log_file_path,
        database=TARGET_DATABASE,
    )
    run.start()

    run_logger.header(API_SCRAPE_NAME)
    try:

        run_logger.section("Building URL ...")
        url: str = _build_url(start_date=start_date, end_date=end_date)

        run_logger.section("Waiting for data ...")
        response = _wait_for_data_logged(
            url=url,
            run_id=run.run_id,
            database=TARGET_DATABASE,
        )

        run_logger.section("Pulling data ...")
        df = _pull(response=response)

        run_logger.section("Formatting data ...")
        df = _format(df=df)

        run_logger.section("Checking for new DA HRL LMP rows ...")
        missing_counts_by_date = (
            pjm_alerts.count_missing_da_hrl_lmp_rows_by_date(df)
        )

        run_logger.section("Upserting data ...")
        _upsert(df=df)

        if missing_counts_by_date:
            run_logger.section("Emitting DA HRL LMP arrival alerts ...")
            pjm_alerts.emit_da_hrl_lmp_arrival_alerts_for_new_rows(
                df=df,
                missing_counts_by_date=missing_counts_by_date,
            )
        else:
            logger.info("No new DA HRL LMP rows detected; no alert emitted")

        run.success(rows_processed=len(df))

    except Exception as e:
        run_logger.exception(f"Error pulling data: {e}")
        run.failure(error=e)
        raise

    finally:
        script_logging.close_logging()

    if 'df' in locals() and df is not None:
        return df

if __name__ == "__main__":
    df = main()
