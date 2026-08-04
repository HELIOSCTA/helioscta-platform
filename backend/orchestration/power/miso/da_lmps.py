"""Orchestrate MISO day-ahead hourly LMPs."""
from __future__ import annotations

from typing import Any

import pandas as pd
from dateutil.relativedelta import relativedelta

from backend.orchestration.power.miso import _lmp_readiness, _lmp_workflow
from backend.scrapes.power.miso import _lmp
from backend.scrapes.power.miso import da_lmps as scrape
from backend.utils import email_notifications


API_SCRAPE_NAME = scrape.API_SCRAPE_NAME
TARGET_DATABASE: str | None = None
TARGET_SCHEMA = scrape.TARGET_SCHEMA
TARGET_TABLE = scrape.TARGET_TABLE
TARGET_TABLE_FQN = scrape.TARGET_TABLE_FQN
DATASET_NAME = "miso_da_lmps"
DATA_SCOPE = "hubs_indiana_plus_ice"
DATA_GRAIN = "operating_date_hour_node"
INTERVAL_MINUTES = 60
DEFAULT_NODES = scrape.DEFAULT_NODES
DEFAULT_DELTA = relativedelta(days=1)
DEFAULT_LOOKAHEAD_DAYS = scrape.DEFAULT_LOOKAHEAD_DAYS
POLL_CEILING_SECONDS = 2 * 60 * 60
POLL_WAIT_SECONDS = 10 * 60

DataNotYetAvailable = _lmp_workflow.DataNotYetAvailable


def main(
    start_date=None,
    end_date=None,
    delta: relativedelta = DEFAULT_DELTA,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
    nodes: list[str] | tuple[str, ...] | None = None,
    poll_ceiling_seconds: int = POLL_CEILING_SECONDS,
    poll_wait_seconds: int = POLL_WAIT_SECONDS,
) -> pd.DataFrame | None:
    """Run the MISO DA LMP workflow and emit readiness events."""
    return _lmp_workflow.run_lmp_workflow(
        scrape_module=scrape,
        dataset_name=DATASET_NAME,
        data_scope=DATA_SCOPE,
        data_grain=DATA_GRAIN,
        interval_minutes=INTERVAL_MINUTES,
        target_operating_date=_target_operating_date,
        start_date=start_date,
        end_date=end_date,
        delta=delta,
        database=database,
        run_mode=run_mode,
        metadata=metadata,
        nodes=nodes,
        poll_ceiling_seconds=poll_ceiling_seconds,
        poll_wait_seconds=poll_wait_seconds,
        release_notification_handler=_notify_da_email_release_events,
    )


def _target_operating_date(value=None, now: pd.Timestamp | None = None):
    if value is not None:
        return _lmp.coerce_operating_date(value)
    timestamp = now or pd.Timestamp.now(tz="UTC")
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize("UTC")
    else:
        timestamp = timestamp.tz_convert("UTC")
    return (timestamp + relativedelta(days=DEFAULT_LOOKAHEAD_DAYS)).date()


def _wait_for_complete_data_logged(**kwargs) -> pd.DataFrame:
    return _lmp_workflow.wait_for_complete_data_logged(
        scrape_module=scrape,
        interval_minutes=INTERVAL_MINUTES,
        **kwargs,
    )


def _fetch_complete_market_day(**kwargs) -> pd.DataFrame:
    return _lmp_workflow.fetch_complete_market_day(
        scrape_module=scrape,
        interval_minutes=INTERVAL_MINUTES,
        **kwargs,
    )


def _emit_data_availability_events(
    *,
    df: pd.DataFrame,
    run_id: str | None,
    database: str | None = TARGET_DATABASE,
    expected_nodes: list[str] | tuple[str, ...] = DEFAULT_NODES,
) -> list[dict[str, Any]]:
    return _lmp_workflow.emit_data_availability_events(
        df=df,
        run_id=run_id,
        database=database,
        expected_nodes=expected_nodes,
        dataset_name=DATASET_NAME,
        source_table=TARGET_TABLE_FQN,
        data_scope=DATA_SCOPE,
        data_grain=DATA_GRAIN,
        interval_minutes=INTERVAL_MINUTES,
    )


def _data_availability_event_key(business_date) -> str:
    return _lmp_readiness.data_availability_event_key(
        dataset_name=DATASET_NAME,
        business_date=business_date,
        scope=DATA_SCOPE,
    )


def _expected_period_count_for_date(business_date) -> int:
    return _lmp_readiness.expected_period_count_for_date(
        business_date,
        interval_minutes=INTERVAL_MINUTES,
    )


def _notify_da_email_release_events(
    *,
    events: list[dict[str, Any]],
    run_mode: str,
    database: str | None,
    run_logger: Any,
) -> int:
    if run_mode != "scheduled":
        run_logger.info("Skipping MISO DA release emails outside scheduled mode.")
        return 0
    if not events:
        return 0

    queued = 0
    try:
        for event in events:
            enqueued_rows = (
                email_notifications.enqueue_miso_da_lmp_release_notifications(
                    event=event,
                    database=database,
                )
            )
            queued += sum(1 for row in enqueued_rows if row.get("created"))

        if not email_notifications.notifications_enabled():
            run_logger.info(
                "MISO DA release email notifications "
                f"queued={queued}; sending is disabled."
            )
            return queued

        processed = email_notifications.send_due_email_notifications(
            limit=20,
            database=database,
        )
        run_logger.info(
            "MISO DA release email notifications "
            f"queued={queued}, processed={len(processed)}."
        )
    except Exception:
        run_logger.exception(
            "MISO DA release email notification handling failed; "
            "scrape data and readiness events remain committed."
        )

    return queued


if __name__ == "__main__":
    main()
