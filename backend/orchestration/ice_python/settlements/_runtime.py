"""Runtime helpers for local ICE settlement orchestration wrappers."""
from __future__ import annotations

from collections.abc import Callable
from contextlib import contextmanager
import os
from pathlib import Path
import re
import sys
import time
from typing import Any
from typing import TypeVar

from backend.scrapes.ice_python import settings
from backend.utils import script_logging
from backend.utils.ops_logging import log_api_fetch, redact_secrets


SUMMARY = TypeVar("SUMMARY", bound=dict[str, object])
SYMBOL_PREVIEW_LIMIT = 20
DEFAULT_LOCK_FILENAME = "ice_python_jobs.lock"
ENV_JOB_LOCK_FILE = "HELIOS_ICE_JOB_LOCK_FILE"
LOCK_SCOPE_PATTERN = re.compile(r"[^A-Za-z0-9_.-]+")


def preview_values(values: list[str], limit: int = SYMBOL_PREVIEW_LIMIT) -> str:
    """Return a compact preview string for long symbol lists."""
    shown = values[:limit]
    preview = ", ".join(shown)
    remaining = len(values) - len(shown)
    if remaining > 0:
        preview = f"{preview}, ... +{remaining} more"
    return preview or "(none)"


def _safe_lock_scope(lock_scope: str) -> str:
    safe_scope = LOCK_SCOPE_PATTERN.sub("_", lock_scope.strip())
    return safe_scope.strip("._") or "default"


def _scoped_lock_file(base_lock_file: Path, lock_scope: str | None = None) -> Path:
    if not lock_scope:
        return base_lock_file
    safe_scope = _safe_lock_scope(lock_scope)
    return base_lock_file.with_name(
        f"{base_lock_file.stem}.{safe_scope}{base_lock_file.suffix}"
    )


def resolve_lock_file(
    lock_file: str | Path | None = None,
    lock_scope: str | None = None,
) -> Path:
    """Resolve the cross-process local ICE job lock file."""
    if lock_file is not None:
        return _scoped_lock_file(Path(lock_file), lock_scope=lock_scope)

    configured_lock_file = os.environ.get(ENV_JOB_LOCK_FILE)
    if configured_lock_file:
        return _scoped_lock_file(Path(configured_lock_file), lock_scope=lock_scope)

    configured_state_dir = os.environ.get("HELIOS_STATE_DIR")
    if configured_state_dir:
        return _scoped_lock_file(
            Path(configured_state_dir) / DEFAULT_LOCK_FILENAME,
            lock_scope=lock_scope,
        )

    configured_log_dir = os.environ.get("HELIOS_LOG_DIR")
    if configured_log_dir:
        return _scoped_lock_file(
            Path(configured_log_dir).parent / "state" / DEFAULT_LOCK_FILENAME,
            lock_scope=lock_scope,
        )

    return _scoped_lock_file(
        Path(__file__).parent / "logs" / DEFAULT_LOCK_FILENAME,
        lock_scope=lock_scope,
    )


@contextmanager
def exclusive_job_lock(
    lock_file: str | Path | None = None,
    lock_scope: str | None = None,
):
    """Hold an OS-released lock so the same ICE job cannot overlap itself."""
    resolved_lock_file = resolve_lock_file(lock_file, lock_scope=lock_scope)
    resolved_lock_file.parent.mkdir(parents=True, exist_ok=True)
    with resolved_lock_file.open("a+", encoding="utf-8") as handle:
        _acquire_file_lock(handle)
        try:
            handle.seek(0)
            handle.truncate()
            handle.write(f"pid={os.getpid()} started_at={script_logging.utc_now()}\n")
            handle.flush()
            yield resolved_lock_file
        finally:
            _release_file_lock(handle)


def _acquire_file_lock(handle) -> None:
    try:
        handle.seek(0)
        if not handle.read(1):
            handle.write("\0")
            handle.flush()
        handle.seek(0)

        if sys.platform == "win32":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        raise RuntimeError(
            "Another ICE Python job with the same lock scope is already running; "
            "refusing to overlap it."
        ) from exc


def _release_file_lock(handle) -> None:
    handle.seek(0)
    if sys.platform == "win32":
        import msvcrt

        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _target_table_from_summary(summary: dict[str, object] | None) -> str:
    if not summary:
        return f"{settings.SCHEMA}.{settings.SETTLEMENTS_TABLE}"

    tables: list[str] = []
    for key in ("contract_dates", "settlements"):
        step_summary = summary.get(key)
        if isinstance(step_summary, dict):
            target_table = step_summary.get("target_table")
            if target_table:
                tables.append(str(target_table))

    target_table = summary.get("target_table")
    if target_table:
        tables.append(str(target_table))

    unique_tables = list(dict.fromkeys(tables))
    return ",".join(unique_tables) or f"{settings.SCHEMA}.{settings.SETTLEMENTS_TABLE}"


def _symbols_requested(summary: dict[str, object] | None) -> int | None:
    if not summary:
        return None
    symbols = summary.get("symbols")
    if isinstance(symbols, list):
        return len(symbols)
    symbols_requested = summary.get("symbols_requested")
    if isinstance(symbols_requested, int):
        return symbols_requested
    return None


def _missing_symbol_count(summary: dict[str, object] | None) -> int | None:
    if not summary:
        return None

    counts: list[int] = []
    for key in ("contract_dates", "settlements"):
        step_summary = summary.get(key)
        if isinstance(step_summary, dict):
            missing = step_summary.get("symbols_missing")
            if isinstance(missing, list):
                counts.append(len(missing))

    missing = summary.get("symbols_missing")
    if isinstance(missing, list):
        counts.append(len(missing))

    return max(counts) if counts else None


def _metadata_from_summary(
    *,
    summary: dict[str, object] | None,
    log_file_path: Path | None,
    lock_file_path: Path | None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "runtime": "local_windows_ice_python",
    }
    if log_file_path is not None:
        metadata["log_file_path"] = str(log_file_path)
    if lock_file_path is not None:
        metadata["lock_file_path"] = str(lock_file_path)
    if not summary:
        return metadata

    for key in ("registry", "start_date", "end_date"):
        if key in summary:
            metadata[key] = summary[key]

    contract_dates_required = summary.get("contract_dates_required")
    if isinstance(contract_dates_required, bool):
        metadata["contract_dates_required"] = contract_dates_required

    for step_name in ("contract_dates", "settlements"):
        step_summary = summary.get(step_name)
        if isinstance(step_summary, dict):
            rows_processed = step_summary.get("rows_processed")
            if isinstance(rows_processed, int):
                metadata[f"{step_name}_rows_processed"] = rows_processed

    symbols_requested = _symbols_requested(summary)
    if symbols_requested is not None:
        metadata["symbols_requested"] = symbols_requested

    missing_symbol_count = _missing_symbol_count(summary)
    if missing_symbol_count is not None:
        metadata["missing_symbol_count"] = missing_symbol_count

    fields = summary.get("fields")
    if isinstance(fields, list):
        metadata["fields_requested_count"] = len(fields)

    return metadata


def _log_job_fetch(
    *,
    pipeline_name: str,
    status: str,
    elapsed_ms: int,
    rows_processed: int | None,
    summary: dict[str, object] | None,
    error_type: str | None,
    error_message: str | None,
    log_file_path: Path | None,
    lock_file_path: Path | None,
    database: str | None,
) -> None:
    log_api_fetch(
        actor_type="backend",
        provider="ice_python",
        pipeline_name=pipeline_name,
        operation_name=pipeline_name,
        target_table=_target_table_from_summary(summary),
        method="ICE_PYTHON",
        target_host="local-ice-runtime",
        target_path=f"/{pipeline_name}",
        status=status,
        http_status=None,
        elapsed_ms=elapsed_ms,
        rows_returned=rows_processed,
        rows_written=rows_processed,
        error_type=error_type,
        error_message=error_message,
        metadata=_metadata_from_summary(
            summary=summary,
            log_file_path=log_file_path,
            lock_file_path=lock_file_path,
        ),
        database=database,
    )


def run_with_logging(
    *,
    pipeline_name: str,
    log_dir: Path,
    operation: Callable[[Path | None], SUMMARY],
    database: str | None = settings.TARGET_DATABASE,
) -> SUMMARY:
    """Run an orchestration operation with logging, telemetry, and a local lock."""
    run_logger = script_logging.init_logging(
        name=pipeline_name,
        log_dir=script_logging.get_log_dir(log_dir),
        log_to_file=True,
        delete_if_no_errors=True,
    )
    started_at = time.perf_counter()
    summary: SUMMARY | None = None
    status = "success"
    error_type: str | None = None
    error_message: str | None = None
    lock_file_path: Path | None = None
    try:
        run_logger.header(pipeline_name)
        with exclusive_job_lock(lock_scope=pipeline_name) as acquired_lock_file:
            lock_file_path = acquired_lock_file
            run_logger.info(f"Acquired ICE job lock: {acquired_lock_file}")
            summary = operation(run_logger.log_file_path)
        rows_processed = int(summary.get("rows_processed", 0))
        run_logger.success(
            f"{pipeline_name} completed; {rows_processed:,} rows processed."
        )
        return summary
    except Exception as exc:
        status = "failure"
        error_type = type(exc).__name__
        error_message = redact_secrets(str(exc))
        run_logger.exception(f"Orchestration failed: {error_message}")
        raise
    finally:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        rows_processed = (
            int(summary.get("rows_processed", 0)) if summary is not None else None
        )
        _log_job_fetch(
            pipeline_name=pipeline_name,
            status=status,
            elapsed_ms=elapsed_ms,
            rows_processed=rows_processed,
            summary=summary,
            error_type=error_type,
            error_message=error_message,
            log_file_path=run_logger.log_file_path,
            lock_file_path=lock_file_path,
            database=database,
        )
        script_logging.close_logging()
