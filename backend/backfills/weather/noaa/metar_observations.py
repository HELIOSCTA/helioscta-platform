"""Manual rolling backfill runner for NOAA METAR observations."""

from __future__ import annotations

from backend import credentials
from backend.backfills.weather._shared import (
    WeatherBackfillResult,
    backfill_metadata,
    rows_processed,
    validate_lookback_hours,
)
from backend.orchestration.weather.noaa import metar_observations as source

API_SCRAPE_NAME = source.API_SCRAPE_NAME
DEFAULT_REGION = source.DEFAULT_REGION
DEFAULT_HOURS = source.scrape.MAX_API_HOURS
DEFAULT_MAX_HOURS = source.scrape.MAX_API_HOURS


def main(
    hours: int = DEFAULT_HOURS,
    max_hours: int = DEFAULT_MAX_HOURS,
    dry_run: bool = False,
    region: str = DEFAULT_REGION,
    database: str | None = None,
) -> WeatherBackfillResult:
    """Replay the rolling NOAA METAR lookback with production upsert semantics."""
    hours_requested = validate_lookback_hours(hours=int(hours), max_hours=max_hours)
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME

    if dry_run:
        return WeatherBackfillResult(
            pipeline_name=API_SCRAPE_NAME,
            rows_processed=0,
            status="dry_run",
            region=region,
            dry_run=True,
            hours_requested=hours_requested,
        )

    frame = source.main(
        region=region,
        hours=hours_requested,
        database=database,
        run_mode="backfill",
        metadata=backfill_metadata(
            workflow=API_SCRAPE_NAME,
            extra={
                "backfill_hours": hours_requested,
                "backfill_region": region,
                "backfill_type": "rolling_hours",
            },
        ),
    )

    return WeatherBackfillResult(
        pipeline_name=API_SCRAPE_NAME,
        rows_processed=rows_processed(frame),
        status="success",
        region=region,
        hours_requested=hours_requested,
    )


if __name__ == "__main__":
    result = main()
    print(result)
    raise SystemExit(0 if result.status in {"success", "dry_run"} else 1)
