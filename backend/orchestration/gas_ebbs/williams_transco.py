"""Orchestrate Williams Transco gas EBB notice refreshes."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import requests

from backend import credentials
from backend.scrapes.gas_ebbs import williams_transco as scrape
from backend.utils import script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets


PIPELINE_NAME = "gas_ebb_williams_transco"
PROVIDER = "gas_ebb"
TARGET_TABLE = scrape.NOTICES_TABLE_FQN
DEFAULT_RUN_MODE = "scheduled"
DEFAULT_MAX_DETAIL_FETCHES = scrape.DEFAULT_MAX_DETAIL_FETCHES
DEFAULT_TIMEOUT_SECONDS = scrape.DEFAULT_TIMEOUT_SECONDS
DEFAULT_BUSINESS_RETENTION_DAYS = scrape.DEFAULT_BUSINESS_RETENTION_DAYS
DEFAULT_SUPPORTING_RETENTION_DAYS = scrape.DEFAULT_SUPPORTING_RETENTION_DAYS


@dataclass
class StreamRunResult:
    stream: str
    status: str = "failure"
    rows_returned: int = 0
    rows_written: int = 0
    listing_url: str | None = None
    fetch_result: scrape.FetchResult | None = None
    listings: list[scrape.NoticeListing] = field(default_factory=list)
    existing_state: dict[str, scrape.NoticeState] = field(default_factory=dict)
    error_type: str | None = None
    error_message: str | None = None


@dataclass
class RunSummary:
    run_id: str
    status: str
    streams: dict[str, StreamRunResult]
    detail_candidates: int = 0
    detail_attempted: int = 0
    detail_succeeded: int = 0
    detail_failed: int = 0
    revision_rows_inserted: int = 0
    detail_rows_inserted: int = 0
    planned_outage_rows_inserted: int = 0
    missing_notices_marked: int = 0
    retention_deleted: dict[str, int] = field(default_factory=dict)


def main(
    *,
    database: str | None = None,
    run_mode: str = DEFAULT_RUN_MODE,
    max_detail_fetches: int = DEFAULT_MAX_DETAIL_FETCHES,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    business_retention_days: int = DEFAULT_BUSINESS_RETENTION_DAYS,
    supporting_retention_days: int = DEFAULT_SUPPORTING_RETENTION_DAYS,
    metadata: dict[str, Any] | None = None,
    session: requests.Session | None = None,
) -> int:
    """Run the Williams Transco listing/detail scrape and lifecycle maintenance."""
    if max_detail_fetches < 0:
        raise ValueError("max_detail_fetches must be >= 0")

    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_id = str(uuid4())
    run_logger = script_logging.init_logging(
        name=PIPELINE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    http = session or requests.Session()
    run_metadata = {
        "run_mode": run_mode,
        "source_family": scrape.SOURCE_FAMILY,
        "pipeline_key": scrape.PIPELINE_KEY,
        **(metadata or {}),
    }
    stream_results: dict[str, StreamRunResult] = {}

    try:
        run_logger.header(PIPELINE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Max detail fetches: {max_detail_fetches}")

        for stream in scrape.STREAMS:
            stream_results[stream] = _run_listing_stream(
                stream=stream,
                run_id=run_id,
                database=database,
                timeout_seconds=timeout_seconds,
                session=http,
                metadata=run_metadata,
                run_logger=run_logger,
            )

        successful_results = [
            result for result in stream_results.values() if result.status == "success"
        ]
        all_streams_succeeded = len(successful_results) == len(scrape.STREAMS)
        all_successful_listings = [
            listing for result in successful_results for listing in result.listings
        ]
        all_existing_state: dict[str, scrape.NoticeState] = {}
        for result in successful_results:
            all_existing_state.update(result.existing_state)

        detail_summary = _run_detail_refresh(
            listings=all_successful_listings,
            existing_state=all_existing_state,
            max_detail_fetches=max_detail_fetches,
            run_id=run_id,
            database=database,
            timeout_seconds=timeout_seconds,
            session=http,
            metadata=run_metadata,
            run_logger=run_logger,
        )

        missing_notices_marked = 0
        retention_deleted: dict[str, int] = {}
        if all_streams_succeeded:
            current_notice_ids = [item.source_notice_id for item in all_successful_listings]
            started_at = time.perf_counter()
            try:
                missing_notices_marked = scrape.mark_missing_notices(
                    current_notice_ids,
                    missing_at_utc=_now_utc(),
                    database=database,
                )
                _log_stage(
                    run_id=run_id,
                    operation_name="lifecycle",
                    feed_name="notices",
                    status="success",
                    elapsed_ms=_elapsed_ms(started_at),
                    target_path="gas_ebbs.notices",
                    rows_returned=len(current_notice_ids),
                    rows_written=missing_notices_marked,
                    metadata={
                        **run_metadata,
                        "telemetry_stage": "lifecycle",
                        "missing_notices_marked": missing_notices_marked,
                    },
                    database=database,
                )
            except Exception as exc:
                _log_stage(
                    run_id=run_id,
                    operation_name="lifecycle",
                    feed_name="notices",
                    status="failure",
                    elapsed_ms=_elapsed_ms(started_at),
                    target_path="gas_ebbs.notices",
                    error_type=type(exc).__name__,
                    error_message=str(exc),
                    metadata={**run_metadata, "telemetry_stage": "lifecycle"},
                    database=database,
                )
                raise

            started_at = time.perf_counter()
            try:
                retention_deleted = scrape.purge_retention(
                    business_retention_days=business_retention_days,
                    supporting_retention_days=supporting_retention_days,
                    database=database,
                )
                _log_stage(
                    run_id=run_id,
                    operation_name="retention",
                    feed_name="notices",
                    status="success",
                    elapsed_ms=_elapsed_ms(started_at),
                    target_path="gas_ebbs.*",
                    rows_written=sum(retention_deleted.values()),
                    metadata={
                        **run_metadata,
                        "telemetry_stage": "retention",
                        "business_retention_days": business_retention_days,
                        "supporting_retention_days": supporting_retention_days,
                        "deleted_rows": retention_deleted,
                    },
                    database=database,
                )
            except Exception as exc:
                _log_stage(
                    run_id=run_id,
                    operation_name="retention",
                    feed_name="notices",
                    status="failure",
                    elapsed_ms=_elapsed_ms(started_at),
                    target_path="gas_ebbs.*",
                    error_type=type(exc).__name__,
                    error_message=str(exc),
                    metadata={**run_metadata, "telemetry_stage": "retention"},
                    database=database,
                )
                raise
        else:
            failed_streams = [
                stream for stream, result in stream_results.items() if result.status != "success"
            ]
            _log_stage(
                run_id=run_id,
                operation_name="retention",
                feed_name="notices",
                status="success",
                elapsed_ms=0,
                target_path="gas_ebbs.*",
                rows_written=0,
                metadata={
                    **run_metadata,
                    "telemetry_stage": "retention",
                    "skipped": True,
                    "skip_reason": "listing_stream_failure",
                    "failed_streams": failed_streams,
                },
                database=database,
            )

        failed_streams = [
            stream for stream, result in stream_results.items() if result.status != "success"
        ]
        summary = RunSummary(
            run_id=run_id,
            status="failure" if failed_streams else "success",
            streams=stream_results,
            detail_candidates=detail_summary["detail_candidates"],
            detail_attempted=detail_summary["detail_attempted"],
            detail_succeeded=detail_summary["detail_succeeded"],
            detail_failed=detail_summary["detail_failed"],
            revision_rows_inserted=detail_summary["revision_rows_inserted"],
            detail_rows_inserted=detail_summary["detail_rows_inserted"],
            planned_outage_rows_inserted=detail_summary["planned_outage_rows_inserted"],
            missing_notices_marked=missing_notices_marked,
            retention_deleted=retention_deleted,
        )

        if failed_streams:
            raise RuntimeError(
                "Williams Transco listing stream failure: "
                + ", ".join(failed_streams)
            )

        run_logger.success(
            f"{PIPELINE_NAME} completed; "
            f"{sum(result.rows_written for result in stream_results.values())} "
            "listing rows upserted, "
            f"{summary.detail_succeeded} details fetched."
        )
        return 0
    except Exception as exc:
        run_logger.exception(
            "Williams Transco gas EBB orchestration failed: "
            f"{redact_secrets(str(exc))}"
        )
        raise
    finally:
        script_logging.close_logging()


def _run_listing_stream(
    *,
    stream: str,
    run_id: str,
    database: str | None,
    timeout_seconds: int,
    session: requests.Session,
    metadata: dict[str, Any],
    run_logger: Any,
) -> StreamRunResult:
    result = StreamRunResult(stream=stream, listing_url=scrape.build_listing_url(stream))
    run_logger.section(f"Fetching Williams Transco {stream} listing...")

    started_at = time.perf_counter()
    try:
        result.fetch_result = scrape.fetch_text(
            result.listing_url or scrape.build_listing_url(stream),
            session=session,
            timeout_seconds=timeout_seconds,
        )
        _log_stage(
            run_id=run_id,
            operation_name="fetch_listing",
            feed_name=f"{stream}_listing",
            status="success",
            elapsed_ms=result.fetch_result.elapsed_ms,
            http_status=result.fetch_result.http_status,
            target_path=_url_path_with_query(result.fetch_result.url),
            metadata={
                **metadata,
                "telemetry_stage": "fetch_listing",
                "notice_stream": stream,
                "content_type": result.fetch_result.content_type,
                "content_length": result.fetch_result.content_length,
            },
            database=database,
        )
    except Exception as exc:
        result.error_type = type(exc).__name__
        result.error_message = redact_secrets(str(exc))
        _log_stage(
            run_id=run_id,
            operation_name="fetch_listing",
            feed_name=f"{stream}_listing",
            status="failure",
            elapsed_ms=_elapsed_ms(started_at),
            target_path=_url_path_with_query(result.listing_url or ""),
            error_type=result.error_type,
            error_message=result.error_message,
            metadata={
                **metadata,
                "telemetry_stage": "fetch_listing",
                "notice_stream": stream,
            },
            database=database,
        )
        run_logger.error(f"{stream} listing fetch failed: {result.error_message}")
        return result

    started_at = time.perf_counter()
    try:
        result.listings = scrape.parse_listing_page(
            result.fetch_result.text,
            stream=stream,
            listing_url=result.fetch_result.url,
        )
        result.rows_returned = len(result.listings)
        _log_stage(
            run_id=run_id,
            operation_name="parse_listing",
            feed_name=f"{stream}_listing",
            status="success",
            elapsed_ms=_elapsed_ms(started_at),
            http_status=result.fetch_result.http_status,
            target_path=_url_path_with_query(result.fetch_result.url),
            rows_returned=result.rows_returned,
            metadata={
                **metadata,
                "telemetry_stage": "parse_listing",
                "notice_stream": stream,
            },
            database=database,
        )
    except Exception as exc:
        result.error_type = type(exc).__name__
        result.error_message = redact_secrets(str(exc))
        _log_stage(
            run_id=run_id,
            operation_name="parse_listing",
            feed_name=f"{stream}_listing",
            status="failure",
            elapsed_ms=_elapsed_ms(started_at),
            http_status=result.fetch_result.http_status,
            target_path=_url_path_with_query(result.fetch_result.url),
            rows_returned=0,
            error_type=result.error_type,
            error_message=result.error_message,
            metadata={
                **metadata,
                "telemetry_stage": "parse_listing",
                "notice_stream": stream,
            },
            database=database,
        )
        run_logger.error(f"{stream} listing parse failed: {result.error_message}")
        return result

    started_at = time.perf_counter()
    try:
        result.existing_state = scrape.fetch_notice_state(
            [listing.source_notice_id for listing in result.listings],
            database=database,
        )
        result.rows_written = scrape.upsert_notices(
            result.listings,
            scrape_run_at_utc=_now_utc(),
            database=database,
        )
        _log_stage(
            run_id=run_id,
            operation_name="upsert_listing",
            feed_name=f"{stream}_listing",
            status="success",
            elapsed_ms=_elapsed_ms(started_at),
            target_path=TARGET_TABLE,
            rows_returned=result.rows_returned,
            rows_written=result.rows_written,
            metadata={
                **metadata,
                "telemetry_stage": "upsert_listing",
                "notice_stream": stream,
                "existing_notice_count": len(result.existing_state),
            },
            database=database,
        )
        result.status = "success"
        run_logger.info(
            f"{stream} listing parsed {result.rows_returned} rows and upserted "
            f"{result.rows_written} rows."
        )
        return result
    except Exception as exc:
        result.error_type = type(exc).__name__
        result.error_message = redact_secrets(str(exc))
        _log_stage(
            run_id=run_id,
            operation_name="upsert_listing",
            feed_name=f"{stream}_listing",
            status="failure",
            elapsed_ms=_elapsed_ms(started_at),
            target_path=TARGET_TABLE,
            rows_returned=result.rows_returned,
            rows_written=0,
            error_type=result.error_type,
            error_message=result.error_message,
            metadata={
                **metadata,
                "telemetry_stage": "upsert_listing",
                "notice_stream": stream,
            },
            database=database,
        )
        run_logger.error(f"{stream} listing upsert failed: {result.error_message}")
        return result


def _run_detail_refresh(
    *,
    listings: list[scrape.NoticeListing],
    existing_state: dict[str, scrape.NoticeState],
    max_detail_fetches: int,
    run_id: str,
    database: str | None,
    timeout_seconds: int,
    session: requests.Session,
    metadata: dict[str, Any],
    run_logger: Any,
) -> dict[str, int]:
    candidates = scrape.select_detail_candidates(
        listings,
        existing_state,
        max_detail_fetches=max_detail_fetches,
    )
    summary = {
        "detail_candidates": len(
            scrape.select_detail_candidates(
                listings,
                existing_state,
                max_detail_fetches=len(listings),
            )
        ),
        "detail_attempted": 0,
        "detail_succeeded": 0,
        "detail_failed": 0,
        "revision_rows_inserted": 0,
        "detail_rows_inserted": 0,
        "planned_outage_rows_inserted": 0,
    }
    run_logger.section(
        "Refreshing Williams Transco detail pages for "
        f"{len(candidates)} notices."
    )

    for listing in candidates:
        summary["detail_attempted"] += 1
        started_at = time.perf_counter()
        try:
            fetch_result = scrape.fetch_text(
                listing.detail_url,
                session=session,
                timeout_seconds=timeout_seconds,
            )
            detail = scrape.parse_detail_page(fetch_result.text)
            fetched_at_utc = _now_utc()
            revision = scrape.build_notice_revision(
                listing,
                detail,
                observed_at_utc=fetched_at_utc,
            )
            planned_outages = scrape.extract_planned_outages(
                listing,
                detail,
                source_content_hash=revision.source_content_hash,
                derived_at_utc=fetched_at_utc,
            )
            inserted = scrape.insert_revision_detail_and_outages(
                listing,
                detail,
                revision,
                detail_fetched_at_utc=fetched_at_utc,
                planned_outages=planned_outages,
                database=database,
            )
            summary["detail_succeeded"] += 1
            summary["revision_rows_inserted"] += inserted["revision_rows_inserted"]
            summary["detail_rows_inserted"] += inserted["detail_rows_inserted"]
            summary["planned_outage_rows_inserted"] += inserted[
                "planned_outage_rows_inserted"
            ]
            _log_stage(
                run_id=run_id,
                operation_name="detail_fetch",
                feed_name="notice_detail",
                status="success",
                elapsed_ms=fetch_result.elapsed_ms,
                http_status=fetch_result.http_status,
                target_path=_url_path_with_query(fetch_result.url),
                rows_returned=1,
                rows_written=(
                    inserted["revision_rows_inserted"]
                    + inserted["detail_rows_inserted"]
                    + inserted["planned_outage_rows_inserted"]
                ),
                metadata={
                    **metadata,
                    "telemetry_stage": "detail_fetch",
                    "notice_stream": listing.notice_stream,
                    "source_notice_id": listing.source_notice_id,
                    "source_content_hash": revision.source_content_hash,
                    "detail_content_hash": detail.detail_content_hash,
                    "planned_outage_rows": len(planned_outages),
                    "content_length": fetch_result.content_length,
                    **inserted,
                },
                database=database,
            )
        except Exception as exc:
            summary["detail_failed"] += 1
            error_message = redact_secrets(str(exc))
            try:
                scrape.mark_detail_failure(
                    listing,
                    error=exc,
                    failed_at_utc=_now_utc(),
                    database=database,
                )
            except Exception as marker_exc:
                run_logger.error(
                    "Failed to record detail failure for notice "
                    f"{listing.source_notice_id}: {redact_secrets(str(marker_exc))}"
                )
            _log_stage(
                run_id=run_id,
                operation_name="detail_fetch",
                feed_name="notice_detail",
                status="failure",
                elapsed_ms=_elapsed_ms(started_at),
                target_path=_url_path_with_query(listing.detail_url),
                rows_returned=0,
                rows_written=0,
                error_type=type(exc).__name__,
                error_message=error_message,
                metadata={
                    **metadata,
                    "telemetry_stage": "detail_fetch",
                    "notice_stream": listing.notice_stream,
                    "source_notice_id": listing.source_notice_id,
                },
                database=database,
            )
            run_logger.error(
                "Detail fetch failed for Williams Transco notice "
                f"{listing.source_notice_id}: {error_message}"
            )

    _log_stage(
        run_id=run_id,
        operation_name="detail_fetch_summary",
        feed_name="notice_detail",
        status="success",
        elapsed_ms=0,
        target_path=scrape.DETAIL_PATH,
        rows_returned=summary["detail_succeeded"],
        rows_written=(
            summary["revision_rows_inserted"]
            + summary["detail_rows_inserted"]
            + summary["planned_outage_rows_inserted"]
        ),
        metadata={
            **metadata,
            "telemetry_stage": "detail_fetch",
            "detail_fetch_cap": max_detail_fetches,
            "detail_fetch_capped": summary["detail_candidates"] > max_detail_fetches,
            **summary,
        },
        database=database,
    )
    return summary


def _log_stage(
    *,
    run_id: str,
    operation_name: str,
    feed_name: str,
    status: str,
    elapsed_ms: int,
    target_path: str,
    metadata: dict[str, Any],
    database: str | None,
    http_status: int | None = None,
    rows_returned: int | None = None,
    rows_written: int | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    log_api_fetch(
        actor_type="backend",
        provider=PROVIDER,
        pipeline_name=PIPELINE_NAME,
        run_id=run_id,
        operation_name=operation_name,
        feed_name=feed_name,
        target_table=TARGET_TABLE,
        method="GET" if operation_name.startswith(("fetch", "detail")) else "DB",
        target_host=urlsplit(scrape.BASE_URL).netloc,
        target_path=target_path,
        status=status,
        http_status=http_status,
        elapsed_ms=elapsed_ms,
        rows_returned=rows_returned,
        rows_written=rows_written,
        error_type=error_type,
        error_message=redact_secrets(error_message),
        metadata=metadata,
        database=database,
    )


def _url_path_with_query(url: str) -> str:
    parsed = urlsplit(url)
    return parsed.path + (f"?{parsed.query}" if parsed.query else "")


def _elapsed_ms(started_at: float) -> int:
    return round((time.perf_counter() - started_at) * 1000)


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


if __name__ == "__main__":
    raise SystemExit(main())
