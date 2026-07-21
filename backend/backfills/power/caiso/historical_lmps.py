"""Chunked historical backfill runner for CAISO DA and RT LMPs."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from time import sleep
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from backend import credentials
from backend.backfills.power.caiso._shared import normalize_date
from backend.scrapes.power.caiso import bulk_oasis, da_lmps, rt_lmps


LOCAL_MARKET_TIMEZONE = ZoneInfo("America/Los_Angeles")
HISTORICAL_BACKFILL_FAMILY = "caiso_lmp_historical_backfill"
DEFAULT_START_DATE = date(2020, 1, 1)
DEFAULT_CHUNK_DAYS = 31
DEFAULT_REQUEST_DELAY_SECONDS = 8.0
DEFAULT_INTER_CHUNK_DELAY_SECONDS = 0.0
DEFAULT_DRY_RUN = True
DEFAULT_FEEDS: tuple[str, ...] = ("da", "rt")


@dataclass(frozen=True)
class FeedConfig:
    feed_name: str
    workflow_name: str
    bulk_prefix: str
    source_query_name: str
    source_version: int
    target_table: str
    module: Any


@dataclass(frozen=True)
class ChunkBackfillResult:
    feed_name: str
    workflow_name: str
    start_date: date
    end_date: date
    days_requested: int
    rows_processed: int
    status: str
    dry_run: bool = False


@dataclass(frozen=True)
class FeedBackfillResult:
    feed_name: str
    workflow_name: str
    start_date: date
    end_date: date
    chunks_requested: int
    days_requested: int
    rows_processed: int
    status: str
    dry_run: bool = False


@dataclass(frozen=True)
class HistoricalBackfillResult:
    start_date: date
    da_end_date: date | None
    rt_end_date: date | None
    feed_results: tuple[FeedBackfillResult, ...]
    status: str
    dry_run: bool = False

    @property
    def rows_processed(self) -> int:
        return sum(result.rows_processed for result in self.feed_results)

    @property
    def days_requested(self) -> int:
        return sum(result.days_requested for result in self.feed_results)

    @property
    def chunks_requested(self) -> int:
        return sum(result.chunks_requested for result in self.feed_results)


FEED_CONFIGS: dict[str, FeedConfig] = {
    "da": FeedConfig(
        feed_name="da",
        workflow_name="caiso_da_lmps_historical",
        bulk_prefix="DAM_LMP",
        source_query_name="DAM_LMP",
        source_version=12,
        target_table=da_lmps.TARGET_TABLE_FQN,
        module=da_lmps,
    ),
    "rt": FeedConfig(
        feed_name="rt",
        workflow_name="caiso_rt_lmps_historical",
        bulk_prefix="RTM_LMP",
        source_query_name="RTM_LMP",
        source_version=3,
        target_table=rt_lmps.TARGET_TABLE_FQN,
        module=rt_lmps,
    ),
}


def _market_today(now: datetime | None = None) -> date:
    timestamp = now or datetime.now(tz=LOCAL_MARKET_TIMEZONE)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=LOCAL_MARKET_TIMEZONE)
    else:
        timestamp = timestamp.astimezone(LOCAL_MARKET_TIMEZONE)
    return timestamp.date()


DEFAULT_DA_END_DATE = _market_today()
DEFAULT_RT_END_DATE = DEFAULT_DA_END_DATE - timedelta(days=1)


def _date_chunks(
    *,
    start_date: date,
    end_date: date,
    chunk_days: int,
) -> tuple[tuple[date, date], ...]:
    if chunk_days < 1:
        raise ValueError("chunk_days must be at least 1.")
    if start_date > end_date:
        raise ValueError("start_date must be on or before end_date.")

    chunks: list[tuple[date, date]] = []
    current = start_date
    while current <= end_date:
        chunk_end = min(end_date, current + timedelta(days=chunk_days - 1))
        chunks.append((current, chunk_end))
        current = chunk_end + timedelta(days=1)
    return tuple(chunks)


def _normalize_feeds(feeds: Iterable[str]) -> tuple[str, ...]:
    normalized = tuple(dict.fromkeys(feed.strip().lower() for feed in feeds))
    if not normalized:
        raise ValueError("At least one CAISO feed must be selected.")

    unknown = sorted(set(normalized) - set(FEED_CONFIGS))
    if unknown:
        raise ValueError(
            "Unsupported CAISO feed(s): "
            f"{', '.join(unknown)}. Expected one or more of: "
            f"{', '.join(sorted(FEED_CONFIGS))}."
        )
    return normalized


def _metadata(
    *,
    workflow_name: str,
    start_date: date,
    end_date: date,
    chunk_start_date: date,
    chunk_end_date: date,
    business_date: date,
) -> dict[str, Any]:
    return {
        "run_mode": "backfill",
        "backfill_family": HISTORICAL_BACKFILL_FAMILY,
        "backfill_workflow": workflow_name,
        "backfill_start_date": start_date.isoformat(),
        "backfill_end_date": end_date.isoformat(),
        "backfill_chunk_start_date": chunk_start_date.isoformat(),
        "backfill_chunk_end_date": chunk_end_date.isoformat(),
        "backfill_business_date": business_date.isoformat(),
        "source_system": "caiso_historical_oasis_bulk",
    }


def _run_feed_chunk(
    *,
    config: FeedConfig,
    start_date: date,
    end_date: date,
    requested_start_date: date,
    requested_end_date: date,
    dry_run: bool,
    database: str | None,
    request_delay_seconds: float,
) -> ChunkBackfillResult:
    days_requested = (end_date - start_date).days + 1
    if dry_run:
        return ChunkBackfillResult(
            feed_name=config.feed_name,
            workflow_name=config.workflow_name,
            start_date=start_date,
            end_date=end_date,
            days_requested=days_requested,
            rows_processed=0,
            status="dry_run",
            dry_run=True,
        )

    run_id = str(uuid4())
    rows_processed = 0
    current = start_date
    while current <= end_date:
        metadata = _metadata(
            workflow_name=config.workflow_name,
            start_date=requested_start_date,
            end_date=requested_end_date,
            chunk_start_date=start_date,
            chunk_end_date=end_date,
            business_date=current,
        )
        frame = bulk_oasis.pull_bulk_lmps_for_trading_date(
            prefix=config.bulk_prefix,
            trading_date=current,
            nodes=config.module.DEFAULT_NODES,
            source_query_name=config.source_query_name,
            source_version=config.source_version,
            pipeline_name=config.workflow_name,
            target_table=config.target_table,
            run_id=run_id,
            database=database,
            metadata=metadata,
        )
        if not frame.empty:
            config.module._upsert(df=frame, database=database)
            rows_processed += int(len(frame))

        current += timedelta(days=1)
        if current <= end_date and request_delay_seconds > 0:
            sleep(request_delay_seconds)

    return ChunkBackfillResult(
        feed_name=config.feed_name,
        workflow_name=config.workflow_name,
        start_date=start_date,
        end_date=end_date,
        days_requested=days_requested,
        rows_processed=rows_processed,
        status="success",
    )


def _run_feed(
    *,
    config: FeedConfig,
    start_date: date,
    end_date: date,
    chunk_days: int,
    dry_run: bool,
    database: str | None,
    request_delay_seconds: float,
    inter_chunk_delay_seconds: float,
) -> FeedBackfillResult:
    chunks = _date_chunks(
        start_date=start_date,
        end_date=end_date,
        chunk_days=chunk_days,
    )

    rows_processed = 0
    for index, (chunk_start, chunk_end) in enumerate(chunks, start=1):
        print(
            "CAISO historical LMP backfill "
            f"{config.feed_name} chunk {index}/{len(chunks)}: "
            f"{chunk_start} to {chunk_end}; dry_run={dry_run}",
            flush=True,
        )
        result = _run_feed_chunk(
            config=config,
            start_date=chunk_start,
            end_date=chunk_end,
            requested_start_date=start_date,
            requested_end_date=end_date,
            dry_run=dry_run,
            database=database,
            request_delay_seconds=request_delay_seconds,
        )
        rows_processed += result.rows_processed

        if (
            index < len(chunks)
            and not dry_run
            and inter_chunk_delay_seconds > 0
        ):
            sleep(inter_chunk_delay_seconds)

    return FeedBackfillResult(
        feed_name=config.feed_name,
        workflow_name=config.workflow_name,
        start_date=start_date,
        end_date=end_date,
        chunks_requested=len(chunks),
        days_requested=(end_date - start_date).days + 1,
        rows_processed=rows_processed,
        status="dry_run" if dry_run else "success",
        dry_run=dry_run,
    )


def main(
    start_date: date | datetime | str = DEFAULT_START_DATE,
    da_end_date: date | datetime | str | None = DEFAULT_DA_END_DATE,
    rt_end_date: date | datetime | str | None = DEFAULT_RT_END_DATE,
    feeds: tuple[str, ...] = DEFAULT_FEEDS,
    chunk_days: int = DEFAULT_CHUNK_DAYS,
    dry_run: bool = DEFAULT_DRY_RUN,
    database: str | None = None,
    request_delay_seconds: float = DEFAULT_REQUEST_DELAY_SECONDS,
    inter_chunk_delay_seconds: float = DEFAULT_INTER_CHUNK_DELAY_SECONDS,
) -> HistoricalBackfillResult:
    """Backfill historical CAISO DA/RT LMP rows with chunked raw upserts."""
    start = normalize_date(start_date)
    selected_feeds = _normalize_feeds(feeds)
    end_dates: dict[str, date | None] = {
        "da": normalize_date(da_end_date) if da_end_date is not None else None,
        "rt": normalize_date(rt_end_date) if rt_end_date is not None else None,
    }
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME

    print(
        "Starting CAISO historical LMP backfill; "
        f"start_date={start}; da_end_date={end_dates['da']}; "
        f"rt_end_date={end_dates['rt']}; feeds={','.join(selected_feeds)}; "
        f"chunk_days={chunk_days}; dry_run={dry_run}",
        flush=True,
    )

    feed_results: list[FeedBackfillResult] = []
    for feed_name in selected_feeds:
        end = end_dates[feed_name]
        if end is None:
            continue
        result = _run_feed(
            config=FEED_CONFIGS[feed_name],
            start_date=start,
            end_date=end,
            chunk_days=chunk_days,
            dry_run=dry_run,
            database=database,
            request_delay_seconds=request_delay_seconds,
            inter_chunk_delay_seconds=inter_chunk_delay_seconds,
        )
        feed_results.append(result)
        print(
            "CAISO historical LMP backfill "
            f"{result.status}: {result.feed_name} "
            f"{result.start_date} to {result.end_date}; "
            f"chunks={result.chunks_requested}; days={result.days_requested}; "
            f"rows={result.rows_processed}",
            flush=True,
        )

    status = "dry_run" if dry_run else "success"
    final = HistoricalBackfillResult(
        start_date=start,
        da_end_date=end_dates["da"],
        rt_end_date=end_dates["rt"],
        feed_results=tuple(feed_results),
        status=status,
        dry_run=dry_run,
    )
    print(
        "Completed CAISO historical LMP backfill "
        f"{status}: feeds={len(final.feed_results)}; "
        f"chunks={final.chunks_requested}; days={final.days_requested}; "
        f"rows={final.rows_processed}",
        flush=True,
    )
    return final


if __name__ == "__main__":
    result = main()
    print(result)
    raise SystemExit(0 if result.status in {"success", "dry_run"} else 1)
