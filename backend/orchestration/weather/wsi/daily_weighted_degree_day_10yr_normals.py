"""Compute WSI daily weighted degree-day 10-year normals."""

from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from backend import credentials
from backend.scrapes.weather.wsi import daily_weighted_degree_day_observations
from backend.utils import db, script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets

API_SCRAPE_NAME = "wsi_daily_weighted_degree_day_10yr_normals"
SOURCE_PRODUCT_ID = daily_weighted_degree_day_observations.SOURCE_PRODUCT_ID
SOURCE_TABLE_FQN = daily_weighted_degree_day_observations.TARGET_TABLE_FQN
TARGET_SCHEMA = "weather"
TARGET_TABLE = "wsi_daily_weighted_degree_day_10yr_normals"
TARGET_TABLE_FQN = f"{TARGET_SCHEMA}.{TARGET_TABLE}"
DEFAULT_REQUEST_REGION = daily_weighted_degree_day_observations.DEFAULT_REQUEST_REGION
DEFAULT_LOOKBACK_YEARS = 10
DEFAULT_ENTITY_IDS = daily_weighted_degree_day_observations.DEFAULT_STATIONS
DEFAULT_METRIC_NAMES = daily_weighted_degree_day_observations.EXPECTED_METRIC_NAMES
EXPECTED_CALENDAR_DAY_COUNT = 365

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NormalComputationResult:
    pipeline_name: str
    status: str
    completeness_status: str
    normal_window_end_year: int
    lookback_years: int
    sample_start_date: date
    sample_end_date: date
    request_region: str
    entity_count: int
    metric_count: int
    calendar_day_count: int
    expected_normal_row_count: int
    normal_row_count: int
    expected_source_day_count: int
    source_day_count: int
    rows_written: int
    min_sample_year_count: int | None
    max_sample_year_count: int | None
    incomplete_normal_row_count: int
    dry_run: bool
    run_id: str

    @property
    def is_complete(self) -> bool:
        return (
            self.normal_row_count == self.expected_normal_row_count
            and self.source_day_count == self.expected_source_day_count
            and self.incomplete_normal_row_count == 0
            and self.min_sample_year_count == self.lookback_years
            and self.max_sample_year_count == self.lookback_years
        )


class NormalWindowIncomplete(RuntimeError):
    """Raised when the source history is incomplete for the requested window."""

    def __init__(self, result: NormalComputationResult) -> None:
        super().__init__(
            "WSI daily weighted degree-day 10-year normal window is incomplete "
            f"for {result.sample_start_date} through {result.sample_end_date}: "
            f"normal_rows={result.normal_row_count}/"
            f"{result.expected_normal_row_count}, "
            f"source_days={result.source_day_count}/"
            f"{result.expected_source_day_count}, "
            f"incomplete_normal_rows={result.incomplete_normal_row_count}"
        )
        self.result = result


def _default_normal_window_end_year() -> int:
    return datetime.now(timezone.utc).year - 1


def _sample_window(
    *,
    normal_window_end_year: int,
    lookback_years: int,
) -> tuple[date, date]:
    start_year = normal_window_end_year - lookback_years + 1
    return date(start_year, 1, 1), date(normal_window_end_year, 12, 31)


def _normalize_entity_ids(values: list[str] | tuple[str, ...] | None) -> list[str]:
    selected = values or DEFAULT_ENTITY_IDS
    normalized = sorted(
        {str(value).strip().upper() for value in selected if str(value).strip()}
    )
    if not normalized:
        raise ValueError("At least one WSI WDD entity_id is required.")
    return normalized


def _normalize_metric_names(values: list[str] | tuple[str, ...] | None) -> list[str]:
    selected = values or DEFAULT_METRIC_NAMES
    normalized = sorted(
        {str(value).strip().lower() for value in selected if str(value).strip()}
    )
    if not normalized:
        raise ValueError("At least one WSI WDD metric_name is required.")
    return normalized


def _validate_window(*, normal_window_end_year: int, lookback_years: int) -> None:
    if lookback_years <= 0:
        raise ValueError("lookback_years must be positive.")
    if normal_window_end_year < 1900:
        raise ValueError("normal_window_end_year must be 1900 or later.")


def _base_params(
    *,
    normal_window_end_year: int,
    lookback_years: int,
    request_region: str,
    entity_ids: list[str],
    metric_names: list[str],
    sample_start_date: date,
    sample_end_date: date,
) -> tuple[Any, ...]:
    return (
        SOURCE_PRODUCT_ID,
        request_region,
        entity_ids,
        metric_names,
        sample_start_date,
        sample_end_date,
        normal_window_end_year,
        lookback_years,
        SOURCE_PRODUCT_ID,
        sample_start_date,
        sample_end_date,
    )


def _normal_rows_cte_sql() -> str:
    return """
        WITH source_rows AS (
            SELECT
                request_region,
                entity_id,
                metric_name,
                observation_date,
                metric_value,
                metric_unit,
                DATE_PART('year', observation_date)::INTEGER AS observation_year,
                DATE_PART('month', observation_date)::SMALLINT AS calendar_month,
                DATE_PART('day', observation_date)::SMALLINT AS calendar_day
            FROM weather.wsi_daily_weighted_degree_day_observations
            WHERE source_product_id = %s
              AND request_region = %s
              AND entity_id = ANY(%s::TEXT[])
              AND metric_name = ANY(%s::TEXT[])
              AND observation_date BETWEEN %s AND %s
              AND metric_value IS NOT NULL
              AND NOT (
                  DATE_PART('month', observation_date)::INTEGER = 2
                  AND DATE_PART('day', observation_date)::INTEGER = 29
              )
        ),
        normal_rows AS (
            SELECT
                %s::INTEGER AS normal_window_end_year,
                %s::INTEGER AS lookback_years,
                %s::VARCHAR AS source_product_id,
                request_region,
                entity_id,
                metric_name,
                calendar_month,
                calendar_day,
                AVG(metric_value)::DOUBLE PRECISION AS normal_value,
                MAX(metric_unit)::VARCHAR AS metric_unit,
                %s::DATE AS sample_start_date,
                %s::DATE AS sample_end_date,
                COUNT(DISTINCT observation_year)::INTEGER AS sample_year_count,
                COUNT(*)::INTEGER AS sample_day_count,
                MAX(observation_date)::DATE AS source_observation_max_date,
                NOW() AS computed_at_utc
            FROM source_rows
            GROUP BY
                request_region,
                entity_id,
                metric_name,
                calendar_month,
                calendar_day
        )
    """


def _summary_sql() -> str:
    return (
        _normal_rows_cte_sql()
        + """
        SELECT
            COUNT(*)::INTEGER AS normal_row_count,
            COALESCE(SUM(sample_day_count), 0)::INTEGER AS source_day_count,
            MIN(sample_year_count)::INTEGER AS min_sample_year_count,
            MAX(sample_year_count)::INTEGER AS max_sample_year_count,
            COUNT(*) FILTER (
                WHERE sample_year_count <> %s
                   OR sample_day_count <> %s
            )::INTEGER AS incomplete_normal_row_count
        FROM normal_rows;
        """
    )


def _upsert_sql() -> str:
    return (
        _normal_rows_cte_sql()
        + """
        , upserted AS (
            INSERT INTO weather.wsi_daily_weighted_degree_day_10yr_normals (
                normal_window_end_year,
                lookback_years,
                source_product_id,
                request_region,
                entity_id,
                metric_name,
                calendar_month,
                calendar_day,
                normal_value,
                metric_unit,
                sample_start_date,
                sample_end_date,
                sample_year_count,
                sample_day_count,
                source_observation_max_date,
                computed_at_utc
            )
            SELECT
                normal_window_end_year,
                lookback_years,
                source_product_id,
                request_region,
                entity_id,
                metric_name,
                calendar_month,
                calendar_day,
                normal_value,
                metric_unit,
                sample_start_date,
                sample_end_date,
                sample_year_count,
                sample_day_count,
                source_observation_max_date,
                computed_at_utc
            FROM normal_rows
            ON CONFLICT (
                normal_window_end_year,
                lookback_years,
                request_region,
                entity_id,
                metric_name,
                calendar_month,
                calendar_day
            )
            DO UPDATE SET
                source_product_id = EXCLUDED.source_product_id,
                normal_value = EXCLUDED.normal_value,
                metric_unit = EXCLUDED.metric_unit,
                sample_start_date = EXCLUDED.sample_start_date,
                sample_end_date = EXCLUDED.sample_end_date,
                sample_year_count = EXCLUDED.sample_year_count,
                sample_day_count = EXCLUDED.sample_day_count,
                source_observation_max_date = EXCLUDED.source_observation_max_date,
                computed_at_utc = EXCLUDED.computed_at_utc,
                updated_at = NOW()
            RETURNING 1
        )
        SELECT
            (SELECT COUNT(*) FROM normal_rows)::INTEGER AS normal_row_count,
            (SELECT COALESCE(SUM(sample_day_count), 0) FROM normal_rows)::INTEGER
                AS source_day_count,
            (SELECT MIN(sample_year_count) FROM normal_rows)::INTEGER
                AS min_sample_year_count,
            (SELECT MAX(sample_year_count) FROM normal_rows)::INTEGER
                AS max_sample_year_count,
            (
                SELECT COUNT(*)
                FROM normal_rows
                WHERE sample_year_count <> %s
                   OR sample_day_count <> %s
            )::INTEGER AS incomplete_normal_row_count,
            (SELECT COUNT(*) FROM upserted)::INTEGER AS rows_written;
        """
    )


def _fetch_one(
    query: str,
    *,
    params: tuple[Any, ...],
    database: str | None,
) -> dict[str, Any]:
    rows = db.execute_sql(query, params=params, fetch=True, database=database) or []
    if not rows:
        raise RuntimeError("WSI WDD normal calculation returned no summary row.")
    return rows[0]


def _summary_result(
    *,
    row: dict[str, Any],
    status: str,
    dry_run: bool,
    normal_window_end_year: int,
    lookback_years: int,
    sample_start_date: date,
    sample_end_date: date,
    request_region: str,
    entity_count: int,
    metric_count: int,
    run_id: str,
) -> NormalComputationResult:
    expected_normal_row_count = (
        entity_count * metric_count * EXPECTED_CALENDAR_DAY_COUNT
    )
    expected_source_day_count = expected_normal_row_count * lookback_years
    normal_row_count = _int_value(row.get("normal_row_count"))
    source_day_count = _int_value(row.get("source_day_count"))
    incomplete_normal_row_count = _int_value(row.get("incomplete_normal_row_count"))
    min_sample_year_count = _optional_int_value(row.get("min_sample_year_count"))
    max_sample_year_count = _optional_int_value(row.get("max_sample_year_count"))
    rows_written = 0 if dry_run else _int_value(row.get("rows_written"))
    completeness_status = (
        "complete"
        if (
            normal_row_count == expected_normal_row_count
            and source_day_count == expected_source_day_count
            and incomplete_normal_row_count == 0
            and min_sample_year_count == lookback_years
            and max_sample_year_count == lookback_years
        )
        else "partial"
    )
    return NormalComputationResult(
        pipeline_name=API_SCRAPE_NAME,
        status=status,
        completeness_status=completeness_status,
        normal_window_end_year=normal_window_end_year,
        lookback_years=lookback_years,
        sample_start_date=sample_start_date,
        sample_end_date=sample_end_date,
        request_region=request_region,
        entity_count=entity_count,
        metric_count=metric_count,
        calendar_day_count=EXPECTED_CALENDAR_DAY_COUNT,
        expected_normal_row_count=expected_normal_row_count,
        normal_row_count=normal_row_count,
        expected_source_day_count=expected_source_day_count,
        source_day_count=source_day_count,
        rows_written=rows_written,
        min_sample_year_count=min_sample_year_count,
        max_sample_year_count=max_sample_year_count,
        incomplete_normal_row_count=incomplete_normal_row_count,
        dry_run=dry_run,
        run_id=run_id,
    )


def _int_value(value: Any) -> int:
    if value is None:
        return 0
    return int(value)


def _optional_int_value(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _log_result(
    *,
    result: NormalComputationResult | None,
    run_id: str,
    status: str,
    elapsed_ms: int,
    metadata: dict[str, Any],
    database: str | None,
    error_type: str | None = None,
    error_message: str | None = None,
) -> None:
    result_metadata = asdict(result) if result else {}
    log_api_fetch(
        actor_type="orchestration",
        provider="wsi",
        pipeline_name=API_SCRAPE_NAME,
        run_id=run_id,
        operation_name=API_SCRAPE_NAME,
        target_table=TARGET_TABLE_FQN,
        method="SQL",
        target_host=credentials.AZURE_POSTGRESQL_DB_HOST or "azure-postgres",
        target_path=SOURCE_TABLE_FQN,
        status=status,
        elapsed_ms=elapsed_ms,
        rows_returned=result.source_day_count if result else None,
        rows_written=result.rows_written if result else None,
        error_type=error_type,
        error_message=redact_secrets(error_message),
        metadata={**metadata, **result_metadata},
        database=database,
    )


def main(
    *,
    normal_window_end_year: int | None = None,
    lookback_years: int = DEFAULT_LOOKBACK_YEARS,
    request_region: str = DEFAULT_REQUEST_REGION,
    entity_ids: list[str] | tuple[str, ...] | None = None,
    metric_names: list[str] | tuple[str, ...] | None = None,
    require_complete: bool = True,
    dry_run: bool = False,
    database: str | None = None,
    run_mode: str = "scheduled",
    metadata: dict[str, Any] | None = None,
) -> NormalComputationResult:
    """Compute and upsert WSI WDD 10-year normals from observed history."""
    end_year = (
        int(normal_window_end_year)
        if normal_window_end_year is not None
        else _default_normal_window_end_year()
    )
    _validate_window(
        normal_window_end_year=end_year,
        lookback_years=lookback_years,
    )
    sample_start_date, sample_end_date = _sample_window(
        normal_window_end_year=end_year,
        lookback_years=lookback_years,
    )
    selected_entity_ids = _normalize_entity_ids(entity_ids)
    selected_metric_names = _normalize_metric_names(metric_names)
    normalized_request_region = str(request_region).strip().upper()
    if not normalized_request_region:
        raise ValueError("request_region is required.")
    database = database or credentials.AZURE_POSTGRESQL_DB_NAME
    run_id = str(uuid4())
    run_metadata = {
        "run_mode": run_mode,
        "source_table": SOURCE_TABLE_FQN,
        "source_product_id": SOURCE_PRODUCT_ID,
        "target_table": TARGET_TABLE_FQN,
        "entity_ids": selected_entity_ids,
        "metric_names": selected_metric_names,
        "feb_29_policy": "excluded",
        **(metadata or {}),
    }
    params = _base_params(
        normal_window_end_year=end_year,
        lookback_years=lookback_years,
        request_region=normalized_request_region,
        entity_ids=selected_entity_ids,
        metric_names=selected_metric_names,
        sample_start_date=sample_start_date,
        sample_end_date=sample_end_date,
    )
    completeness_params = (lookback_years, lookback_years)
    run_logger = script_logging.init_logging(
        name=API_SCRAPE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    started = time.perf_counter()
    result: NormalComputationResult | None = None

    try:
        run_logger.header(API_SCRAPE_NAME)
        run_logger.info(f"Run ID: {run_id}")
        run_logger.info(f"Run mode: {run_mode}")
        run_logger.info(f"Dry run: {dry_run}")
        run_logger.info(f"Request region: {normalized_request_region}")
        run_logger.info(f"Window end year: {end_year}")
        run_logger.info(f"Lookback years: {lookback_years}")
        run_logger.info(
            f"Sample window: {sample_start_date:%Y-%m-%d} through "
            f"{sample_end_date:%Y-%m-%d}"
        )
        run_logger.info(f"Entity count: {len(selected_entity_ids)}")
        run_logger.info(f"Metric count: {len(selected_metric_names)}")

        run_logger.section("Checking source-history completeness ...")
        summary_row = _fetch_one(
            _summary_sql(),
            params=params + completeness_params,
            database=database,
        )
        result = _summary_result(
            row=summary_row,
            status="dry_run" if dry_run else "checked",
            dry_run=dry_run,
            normal_window_end_year=end_year,
            lookback_years=lookback_years,
            sample_start_date=sample_start_date,
            sample_end_date=sample_end_date,
            request_region=normalized_request_region,
            entity_count=len(selected_entity_ids),
            metric_count=len(selected_metric_names),
            run_id=run_id,
        )
        run_logger.info(
            "Normal rows: "
            f"{result.normal_row_count}/{result.expected_normal_row_count}; "
            "source days: "
            f"{result.source_day_count}/{result.expected_source_day_count}; "
            f"completeness: {result.completeness_status}"
        )
        if require_complete and not result.is_complete:
            raise NormalWindowIncomplete(result)

        if dry_run:
            _log_result(
                result=result,
                run_id=run_id,
                status="dry_run",
                elapsed_ms=round((time.perf_counter() - started) * 1000),
                metadata=run_metadata,
                database=database,
            )
            return result

        run_logger.section(f"Upserting {TARGET_TABLE_FQN} ...")
        upsert_row = _fetch_one(
            _upsert_sql(),
            params=params + completeness_params,
            database=database,
        )
        result = _summary_result(
            row=upsert_row,
            status="success",
            dry_run=False,
            normal_window_end_year=end_year,
            lookback_years=lookback_years,
            sample_start_date=sample_start_date,
            sample_end_date=sample_end_date,
            request_region=normalized_request_region,
            entity_count=len(selected_entity_ids),
            metric_count=len(selected_metric_names),
            run_id=run_id,
        )
        _log_result(
            result=result,
            run_id=run_id,
            status="success",
            elapsed_ms=round((time.perf_counter() - started) * 1000),
            metadata=run_metadata,
            database=database,
        )
        run_logger.success(
            f"{API_SCRAPE_NAME} completed; {result.rows_written} rows upserted."
        )
        return result
    except Exception as exc:
        _log_result(
            result=result,
            run_id=run_id,
            status="failure",
            elapsed_ms=round((time.perf_counter() - started) * 1000),
            metadata=run_metadata,
            database=database,
            error_type=type(exc).__name__,
            error_message=str(exc),
        )
        run_logger.exception(f"Pipeline failed: {redact_secrets(str(exc))}")
        raise
    finally:
        script_logging.close_logging()


def cli() -> int:
    result = main()
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
