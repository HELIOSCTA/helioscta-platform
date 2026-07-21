"""Orchestrate local ICE trade blotter file management and imports."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from backend.scrapes.ice_trade_blotters import settings
from backend.scrapes.ice_trade_blotters.scripts import (
    manage_csv_files,
    upsert_ice_trade_blotters,
)
from backend.utils import script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets


PIPELINE_NAME = settings.API_SCRAPE_NAME
PROVIDER = settings.SOURCE_SYSTEM
OPERATION_NAME = "ice_trade_blotters_manual_ingest"


def main(
    *,
    csv_filepath: str | Path | None = None,
    inbox_dir: str | Path = settings.CSV_INBOX_DIR,
    formatted_files_dir: str | Path = settings.CSV_FORMATTED_FILES_DIR,
    manage_inbox: bool = True,
    standardize_existing: bool = True,
    import_managed_files: bool = True,
    schema: str = settings.TRADE_BLOTTERS_SCHEMA,
    table_name: str = settings.TRADE_BLOTTERS_TABLE,
    manifest_table: str = settings.FILE_MANIFEST_TABLE,
    database: str | None = settings.TARGET_DATABASE,
    run_mode: str = "manual",
    metadata: dict[str, Any] | None = None,
) -> int:
    """Manage available ICE blotter files, import them, and write fetch telemetry."""
    run_logger = script_logging.init_logging(
        name=PIPELINE_NAME,
        log_dir=script_logging.get_log_dir(Path(__file__).parent / "logs"),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    started_at = time.perf_counter()
    summary: dict[str, object] | None = None
    status = "success"
    error_type: str | None = None
    error_message: str | None = None

    try:
        run_logger.header(PIPELINE_NAME)
        run_logger.info(f"Run mode: {run_mode}")

        managed_summary: dict[str, object] = {
            "files_processed": 0,
            "files_standardized": 0,
            "duplicate_files_removed": 0,
            "manifest_records_updated": 0,
            "rows_processed": 0,
            "manifest_table": f"{schema}.{manifest_table}",
            "managed_files": [],
        }
        if manage_inbox:
            managed_summary = manage_csv_files.manage_csv_files(
                inbox_dir=inbox_dir,
                formatted_files_dir=formatted_files_dir,
                schema=schema,
                manifest_table=manifest_table,
                move_files=True,
                standardize_existing=standardize_existing,
                database=database,
            )

        import_paths = _resolve_import_paths(
            csv_filepath=csv_filepath,
            managed_summary=managed_summary,
            import_managed_files=import_managed_files,
        )
        import_summaries: list[dict[str, object]] = []
        if import_paths:
            for filepath in import_paths:
                run_logger.info(f"Importing ICE trade blotter file: {filepath}")
                import_summaries.append(
                    upsert_ice_trade_blotters.run_import(
                        csv_filepath=filepath,
                        schema=schema,
                        table_name=table_name,
                        manifest_table=manifest_table,
                        formatted_files_dir=formatted_files_dir,
                        database=database,
                    )
                )
        else:
            run_logger.info("No managed files returned; importing latest managed file.")
            import_summaries.append(
                upsert_ice_trade_blotters.run_import(
                    csv_filepath=None,
                    schema=schema,
                    table_name=table_name,
                    manifest_table=manifest_table,
                    formatted_files_dir=formatted_files_dir,
                    database=database,
                )
            )

        rows_processed = sum(int(item["rows_processed"]) for item in import_summaries)
        source_rows_read = sum(int(item["source_rows_read"]) for item in import_summaries)
        duplicate_rows_dropped = sum(
            int(item["duplicate_rows_dropped"]) for item in import_summaries
        )
        summary = {
            "target_table": f"{schema}.{table_name}",
            "manifest_table": f"{schema}.{manifest_table}",
            "run_mode": run_mode,
            "files_processed": len(import_summaries),
            "rows_processed": rows_processed,
            "source_rows_read": source_rows_read,
            "duplicate_rows_dropped": duplicate_rows_dropped,
            "managed_summary": managed_summary,
            "import_summaries": import_summaries,
        }

        run_logger.success(
            f"{PIPELINE_NAME} completed; {rows_processed:,} row(s) processed "
            f"from {len(import_summaries):,} file(s)."
        )
        return 0
    except Exception as exc:
        status = "failure"
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.exception(f"ICE trade blotter orchestration failed: {error_message}")
        raise
    finally:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        _log_fetch(
            status=status,
            elapsed_ms=elapsed_ms,
            summary=summary,
            error_type=error_type,
            error_message=error_message,
            run_mode=run_mode,
            csv_filepath=csv_filepath,
            inbox_dir=inbox_dir,
            formatted_files_dir=formatted_files_dir,
            metadata=metadata,
            database=database,
        )
        script_logging.close_logging()


def _resolve_import_paths(
    *,
    csv_filepath: str | Path | None,
    managed_summary: dict[str, object],
    import_managed_files: bool,
) -> list[Path]:
    if csv_filepath is not None:
        return [Path(csv_filepath)]
    if not import_managed_files:
        return []

    managed_files = managed_summary.get("managed_files") or []
    return [Path(path) for path in managed_files]


def _log_fetch(
    *,
    status: str,
    elapsed_ms: int,
    summary: dict[str, object] | None,
    error_type: str | None,
    error_message: str | None,
    run_mode: str,
    csv_filepath: str | Path | None,
    inbox_dir: str | Path,
    formatted_files_dir: str | Path,
    metadata: dict[str, Any] | None,
    database: str | None,
) -> None:
    rows_returned = int(summary["source_rows_read"]) if summary else None
    rows_written = int(summary["rows_processed"]) if summary else None
    target_path = (
        str(csv_filepath)
        if csv_filepath is not None
        else f"inbox={Path(inbox_dir)};formatted={Path(formatted_files_dir)}"
    )
    telemetry_metadata: dict[str, Any] = {
        "run_mode": run_mode,
        "inbox_dir": str(inbox_dir),
        "formatted_files_dir": str(formatted_files_dir),
        **(metadata or {}),
    }
    if summary:
        telemetry_metadata.update(summary)

    log_api_fetch(
        actor_type="backend",
        provider=PROVIDER,
        pipeline_name=PIPELINE_NAME,
        operation_name=OPERATION_NAME,
        target_table=settings.TRADE_BLOTTERS_TARGET_TABLE,
        method="LOCAL_FILE",
        target_host="local-file-system",
        target_path=target_path,
        status=status,
        http_status=None,
        elapsed_ms=elapsed_ms,
        rows_returned=rows_returned,
        rows_written=rows_written,
        error_type=error_type,
        error_message=error_message,
        metadata=telemetry_metadata,
        database=database,
    )


if __name__ == "__main__":
    raise SystemExit(main())
