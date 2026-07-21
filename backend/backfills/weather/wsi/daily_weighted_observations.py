"""Manual backfill runner for WSI daily weighted observed weather."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from backend import credentials
from backend.backfills.weather._shared import (
    WeatherBackfillResult,
    backfill_metadata,
    normalize_date,
    validate_backfill_window,
)
from backend.orchestration.weather.wsi import daily_weighted_observations as source

API_SCRAPE_NAME = source.API_SCRAPE_NAME
DEFAULT_REGION = "NA"
DEFAULT_START_DATE = datetime.now(timezone.utc).date() - timedelta(days=1)
DEFAULT_END_DATE = DEFAULT_START_DATE
DEFAULT_MAX_DAYS = 366


def main(
    start_date: date | datetime | str = DEFAULT_START_DATE,
    end_date: date | datetime | str = DEFAULT_END_DATE,
    max_days: int = DEFAULT_MAX_DAYS,
    allow_future: bool = False,
    dry_run: bool = False,
    region: str = DEFAULT_REGION,
    database: str | None = None,
) -> WeatherBackfillResult:
    """Replay WSI daily weighted observed weather with production upserts."""
    start = normalize_date(start_date)
    end = normalize_date(end_date)
    days_requested = validate_backfill_window(
        start_date=start,
        end_date=end,
        max_days=max_days,
        allow_future=allow_future,
    )
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME

    if dry_run:
        return WeatherBackfillResult(
            pipeline_name=API_SCRAPE_NAME,
            rows_processed=0,
            status="dry_run",
            region=region,
            dry_run=True,
            start_date=start,
            end_date=end,
            days_requested=days_requested,
        )

    result = source.main(
        start_date=start,
        end_date=end,
        database=database,
        run_mode="backfill",
        metadata=backfill_metadata(
            workflow=API_SCRAPE_NAME,
            extra={
                "backfill_start_date": start.isoformat(),
                "backfill_end_date": end.isoformat(),
                "backfill_region": region,
            },
        ),
    )
    frames = [result.get("temperature"), result.get("degree_day")]
    rows = sum(0 if frame is None else int(len(frame)) for frame in frames)

    return WeatherBackfillResult(
        pipeline_name=API_SCRAPE_NAME,
        rows_processed=rows,
        status="success",
        region=region,
        start_date=start,
        end_date=end,
        days_requested=days_requested,
    )


if __name__ == "__main__":
    result = main()
    print(result)
    raise SystemExit(0 if result.status in {"success", "dry_run"} else 1)
