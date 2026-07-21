"""Local Windows ICE Python coordinator for scheduled settlement pulls."""
from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import sys
import time
from collections.abc import Callable, MutableMapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from datetime import time as dt_time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from backend.orchestration.ice_python import job_runner
from backend.scrapes.ice_python import settings
from backend.utils.ops_logging import log_api_fetch, redact_secrets


DEFAULT_TIMEZONE = "America/Denver"
DEFAULT_POLL_SECONDS = 60
DEFAULT_JOB_TIMEOUT_SECONDS = 45 * 60
DEFAULT_STATE_FILENAME = "ice_python_service_state.json"
ENV_POLL_SECONDS = "HELIOS_ICE_SERVICE_POLL_SECONDS"
ENV_JOB_TIMEOUT_SECONDS = "HELIOS_ICE_JOB_TIMEOUT_SECONDS"
ENV_STATE_DIR = "HELIOS_STATE_DIR"
PROCESS_LOG_TAIL_LINES = 80
PRICE_REFRESH_FIELDS = ["Settle", "VWAP Close", "Volume"]
SHORT_TERM_PRICE_REFRESH_KWARGS: dict[str, Any] = {
    "fields": PRICE_REFRESH_FIELDS,
    "lookback_days": 0,
    "pull_contract_dates_enabled": False,
    "require_rows": False,
}

RUN_RECORD = dict[str, Any]
RUN_STATE = MutableMapping[str, RUN_RECORD]
RUNNER = Callable[[], dict[str, object]]

_STOP_REQUESTED = False


@dataclass(frozen=True)
class TimeWindow:
    """A local-time service window with an exclusive end."""

    start: dt_time
    end: dt_time

    def contains(self, current_time: dt_time) -> bool:
        return self.start <= current_time < self.end


@dataclass(frozen=True)
class ServiceJob:
    """A named ICE service job and its schedule policy."""

    name: str
    cadence: str
    module_name: str | None = None
    module_kwargs: dict[str, Any] | None = None
    runner: RUNNER | None = None
    windows: tuple[TimeWindow, ...] = ()
    daily_start: dt_time | None = None
    timeout_seconds: int | None = None


DEFAULT_HOURLY_WINDOWS: tuple[TimeWindow, ...] = (
    TimeWindow(start=dt_time(5, 0), end=dt_time(23, 0)),
)

SETTLEMENTS_MODULE_ROOT = "backend.orchestration.ice_python.settlements"

PJM_SHORT_TERM_JOB = ServiceJob(
    name="pjm_short_term",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.pjm_short_term",
    windows=DEFAULT_HOURLY_WINDOWS,
)
PJM_SHORT_TERM_PRICE_JOB = ServiceJob(
    name="pjm_short_term",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.pjm_short_term",
    module_kwargs=SHORT_TERM_PRICE_REFRESH_KWARGS,
    windows=DEFAULT_HOURLY_WINDOWS,
)
PJM_FUTURES_JOB = ServiceJob(
    name="pjm_futures",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.pjm_futures",
    windows=DEFAULT_HOURLY_WINDOWS,
)
ERCOT_SHORT_TERM_JOB = ServiceJob(
    name="ercot_short_term",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.ercot_short_term",
    windows=DEFAULT_HOURLY_WINDOWS,
)
ERCOT_SHORT_TERM_PRICE_JOB = ServiceJob(
    name="ercot_short_term",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.ercot_short_term",
    module_kwargs=SHORT_TERM_PRICE_REFRESH_KWARGS,
    windows=DEFAULT_HOURLY_WINDOWS,
)
ERCOT_FUTURES_JOB = ServiceJob(
    name="ercot_futures",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.ercot_futures",
    windows=DEFAULT_HOURLY_WINDOWS,
)
WEST_POWER_FUTURES_JOB = ServiceJob(
    name="west_power_futures",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.west_power_futures",
    windows=DEFAULT_HOURLY_WINDOWS,
)
EAST_POWER_FUTURES_JOB = ServiceJob(
    name="east_power_futures",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.east_power_futures",
    windows=DEFAULT_HOURLY_WINDOWS,
)
GAS_NEXT_DAY_JOB = ServiceJob(
    name="gas_next_day",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.gas_next_day",
    windows=DEFAULT_HOURLY_WINDOWS,
)
GAS_NEXT_DAY_PRICE_JOB = ServiceJob(
    name="gas_next_day",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.gas_next_day",
    module_kwargs=SHORT_TERM_PRICE_REFRESH_KWARGS,
    windows=DEFAULT_HOURLY_WINDOWS,
)
GAS_BALMO_JOB = ServiceJob(
    name="gas_balmo",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.gas_balmo",
    windows=DEFAULT_HOURLY_WINDOWS,
)
GAS_BALMO_PRICE_JOB = ServiceJob(
    name="gas_balmo",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.gas_balmo",
    module_kwargs=SHORT_TERM_PRICE_REFRESH_KWARGS,
    windows=DEFAULT_HOURLY_WINDOWS,
)
GAS_FUTURES_CORE_JOB = ServiceJob(
    name="gas_futures_core",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.gas_futures_core",
    windows=DEFAULT_HOURLY_WINDOWS,
)
GAS_FUTURES_GULF_JOB = ServiceJob(
    name="gas_futures_gulf",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.gas_futures_gulf",
    windows=DEFAULT_HOURLY_WINDOWS,
)
GAS_FUTURES_WEST_JOB = ServiceJob(
    name="gas_futures_west",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.gas_futures_west",
    windows=DEFAULT_HOURLY_WINDOWS,
)
GAS_FUTURES_EAST_JOB = ServiceJob(
    name="gas_futures_east",
    cadence="hourly",
    module_name=f"{SETTLEMENTS_MODULE_ROOT}.gas_futures_east",
    windows=DEFAULT_HOURLY_WINDOWS,
)

SHORT_TERM_JOBS: tuple[ServiceJob, ...] = (
    PJM_SHORT_TERM_PRICE_JOB,
    ERCOT_SHORT_TERM_PRICE_JOB,
    GAS_NEXT_DAY_PRICE_JOB,
    GAS_BALMO_PRICE_JOB,
)

FUTURES_JOBS: tuple[ServiceJob, ...] = (
    PJM_FUTURES_JOB,
    ERCOT_FUTURES_JOB,
    WEST_POWER_FUTURES_JOB,
    EAST_POWER_FUTURES_JOB,
    GAS_FUTURES_CORE_JOB,
    GAS_FUTURES_GULF_JOB,
    GAS_FUTURES_WEST_JOB,
    GAS_FUTURES_EAST_JOB,
)

DEFAULT_JOBS: tuple[ServiceJob, ...] = (
    PJM_SHORT_TERM_JOB,
    PJM_FUTURES_JOB,
    ERCOT_SHORT_TERM_JOB,
    ERCOT_FUTURES_JOB,
    WEST_POWER_FUTURES_JOB,
    EAST_POWER_FUTURES_JOB,
    GAS_NEXT_DAY_JOB,
    GAS_BALMO_JOB,
    GAS_FUTURES_CORE_JOB,
    GAS_FUTURES_GULF_JOB,
    GAS_FUTURES_WEST_JOB,
    GAS_FUTURES_EAST_JOB,
)

JOB_GROUPS: dict[str, tuple[ServiceJob, ...]] = {
    "all": DEFAULT_JOBS,
    "short_term": SHORT_TERM_JOBS,
    "futures": FUTURES_JOBS,
}


def resolve_job_group(job_group: str | None = None) -> tuple[ServiceJob, ...]:
    """Return the configured ICE jobs for a scheduler group name."""
    normalized = (job_group or "all").strip().lower().replace("-", "_")
    try:
        return JOB_GROUPS[normalized]
    except KeyError as exc:
        valid = ", ".join(sorted(JOB_GROUPS))
        raise ValueError(f"Unknown ICE job group {job_group!r}. Valid groups: {valid}.") from exc


def configure_service_logging(level: int = logging.INFO) -> logging.Logger:
    """Configure process-level logging that survives per-job logger resets."""
    logger = logging.getLogger("backend.orchestration.ice_python.service")
    logger.setLevel(level)
    logger.propagate = False
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        logger.addHandler(handler)
    return logger


def resolve_poll_seconds(poll_seconds: int | None = None) -> int:
    """Resolve the service poll cadence from a function arg or environment."""
    if poll_seconds is None:
        configured = os.environ.get(ENV_POLL_SECONDS)
        poll_seconds = int(configured) if configured else DEFAULT_POLL_SECONDS
    if poll_seconds < 5:
        raise ValueError("poll_seconds must be at least 5.")
    return poll_seconds


def resolve_job_timeout_seconds(timeout_seconds: int | None = None) -> int:
    """Resolve the per-job hard timeout from a function arg or environment."""
    if timeout_seconds is None:
        configured = os.environ.get(ENV_JOB_TIMEOUT_SECONDS)
        timeout_seconds = (
            int(configured) if configured else DEFAULT_JOB_TIMEOUT_SECONDS
        )
    if timeout_seconds < 60:
        raise ValueError("job timeout must be at least 60 seconds.")
    return timeout_seconds


def resolve_state_file(state_file: str | Path | None = None) -> Path:
    """Resolve the persistent service state file."""
    if state_file is not None:
        return Path(state_file)

    configured_state_dir = os.environ.get(ENV_STATE_DIR)
    if configured_state_dir:
        return Path(configured_state_dir) / DEFAULT_STATE_FILENAME

    configured_log_dir = os.environ.get("HELIOS_LOG_DIR")
    if configured_log_dir:
        return Path(configured_log_dir).parent / "state" / DEFAULT_STATE_FILENAME

    return Path(__file__).parent / "logs" / DEFAULT_STATE_FILENAME


def _normalize_run_record(value: object) -> RUN_RECORD | None:
    if isinstance(value, str):
        return {
            "status": "attempted",
            "started_at": value,
            "finished_at": value,
            "legacy_state": True,
        }
    if isinstance(value, dict):
        return {str(key): record_value for key, record_value in value.items()}
    return None


def load_run_state(state_file: Path) -> dict[str, RUN_RECORD]:
    """Load persisted job records for once-per-window service behavior."""
    if not state_file.exists():
        return {}

    payload = json.loads(state_file.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return {}
    records: dict[str, RUN_RECORD] = {}
    for key, value in payload.items():
        if not isinstance(key, str):
            continue
        record = _normalize_run_record(value)
        if record is not None:
            records[str(key)] = record
    return records


def save_run_state(state_file: Path, run_state: RUN_STATE) -> None:
    """Persist service run state atomically."""
    state_file.parent.mkdir(parents=True, exist_ok=True)
    temp_file = state_file.with_suffix(f"{state_file.suffix}.tmp")
    temp_file.write_text(
        json.dumps(dict(sorted(run_state.items())), indent=2) + "\n",
        encoding="utf-8",
    )
    temp_file.replace(state_file)


def job_run_key(job: ServiceJob, current_time: datetime) -> str:
    """Return the once-per-hour or once-per-day key for a service job."""
    if job.cadence == "hourly":
        return f"{job.name}:{current_time:%Y-%m-%dT%H}"
    if job.cadence == "daily":
        return f"{job.name}:{current_time:%Y-%m-%d}"
    raise ValueError(f"Unsupported ICE service cadence: {job.cadence}")


def _scheduled_at_current_time(job: ServiceJob, current_time: datetime) -> bool:
    local_time = current_time.timetz().replace(tzinfo=None)
    if job.cadence == "hourly":
        if current_time.weekday() >= 5:
            return False
        return any(window.contains(local_time) for window in job.windows)
    if job.cadence == "daily":
        if job.daily_start is None:
            raise ValueError(f"Daily job {job.name} is missing daily_start.")
        return local_time >= job.daily_start
    raise ValueError(f"Unsupported ICE service cadence: {job.cadence}")


def _scheduled_for_task_scheduler_tick(
    job: ServiceJob,
    current_time: datetime,
) -> bool:
    """Return whether a visible Task Scheduler start should run this job."""
    local_time = current_time.timetz().replace(tzinfo=None)
    if job.cadence == "hourly":
        return any(window.contains(local_time) for window in job.windows)
    if job.cadence == "daily":
        if job.daily_start is None:
            raise ValueError(f"Daily job {job.name} is missing daily_start.")
        return (
            local_time.hour == job.daily_start.hour
            and local_time >= job.daily_start
        )
    raise ValueError(f"Unsupported ICE service cadence: {job.cadence}")


def _is_running_record_stale(
    job: ServiceJob,
    current_time: datetime,
    record: RUN_RECORD,
) -> bool:
    started_at_value = record.get("started_at")
    if not isinstance(started_at_value, str):
        return True
    try:
        started_at = datetime.fromisoformat(started_at_value)
    except ValueError:
        return True

    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=current_time.tzinfo)

    timeout_seconds = resolve_job_timeout_seconds(job.timeout_seconds)
    return (current_time - started_at).total_seconds() > timeout_seconds + 60


def is_job_due(
    job: ServiceJob,
    current_time: datetime,
    run_state: RUN_STATE,
) -> bool:
    """Return whether a job should be attempted at current_time."""
    if not _scheduled_at_current_time(job, current_time):
        return False

    run_key = job_run_key(job, current_time)
    record = _normalize_run_record(run_state.get(run_key))
    if record is None:
        return True

    status = str(record.get("status", "attempted"))
    if status == "running" and _is_running_record_stale(job, current_time, record):
        return True
    if status:
        return False
    return True


def due_jobs(
    current_time: datetime,
    run_state: RUN_STATE,
    jobs: Sequence[ServiceJob] = DEFAULT_JOBS,
) -> list[ServiceJob]:
    """Return the jobs due at current_time."""
    return [job for job in jobs if is_job_due(job, current_time, run_state)]


def task_scheduler_tick_jobs(
    current_time: datetime,
    jobs: Sequence[ServiceJob] = DEFAULT_JOBS,
) -> list[ServiceJob]:
    """Return jobs for one Task Scheduler tick, ignoring persisted run state."""
    return [
        job
        for job in jobs
        if _scheduled_for_task_scheduler_tick(job, current_time)
    ]


def _parse_job_run_time(
    *,
    job: ServiceJob,
    run_key: str,
    timezone: ZoneInfo,
) -> datetime | None:
    prefix = f"{job.name}:"
    if not run_key.startswith(prefix):
        return None

    window_text = run_key[len(prefix) :]
    try:
        if job.cadence == "hourly":
            return datetime.strptime(window_text, "%Y-%m-%dT%H").replace(
                tzinfo=timezone
            )
        if job.cadence == "daily":
            parsed_date = datetime.strptime(window_text, "%Y-%m-%d")
            start_time = job.daily_start or dt_time(0, 0)
            return datetime.combine(
                parsed_date.date(),
                start_time,
                tzinfo=timezone,
            )
    except ValueError:
        return None
    return None


def latest_failed_job_attempts(
    *,
    current_time: datetime,
    run_state: RUN_STATE,
    jobs: Sequence[ServiceJob] = DEFAULT_JOBS,
) -> list[tuple[ServiceJob, datetime]]:
    """Return latest failed or stale-running records that should be replayed."""
    timezone = current_time.tzinfo
    if not isinstance(timezone, ZoneInfo):
        timezone = ZoneInfo(DEFAULT_TIMEZONE)

    attempts: list[tuple[ServiceJob, datetime]] = []
    for job in jobs:
        records: list[tuple[datetime, RUN_RECORD]] = []
        for run_key, value in run_state.items():
            run_time = _parse_job_run_time(
                job=job,
                run_key=run_key,
                timezone=timezone,
            )
            if run_time is None:
                continue
            record = _normalize_run_record(value)
            if record is not None:
                records.append((run_time, record))

        if not records:
            continue

        run_time, record = sorted(
            records,
            key=lambda item: item[0],
            reverse=True,
        )[0]
        status = str(record.get("status", "attempted"))
        if status in {"failed", "timed_out"}:
            attempts.append((job, run_time))
        elif status == "running" and _is_running_record_stale(
            job=job,
            current_time=current_time,
            record=record,
        ):
            attempts.append((job, run_time))

    return attempts


def _tail_text(value: str | bytes | None, line_limit: int = PROCESS_LOG_TAIL_LINES) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    lines = value.splitlines()
    return "\n".join(lines[-line_limit:])


def _parse_child_summary(stdout: str | None) -> dict[str, object]:
    if not stdout:
        return {}
    for line in reversed(stdout.splitlines()):
        if line.startswith(job_runner.SUMMARY_PREFIX):
            payload = line[len(job_runner.SUMMARY_PREFIX) :]
            parsed = json.loads(payload)
            if isinstance(parsed, dict):
                summary = parsed.get("summary")
                return summary if isinstance(summary, dict) else {}
    return {}


def _parse_child_failure(stdout: str | None) -> dict[str, object]:
    if not stdout:
        return {}
    for line in reversed(stdout.splitlines()):
        if line.startswith(job_runner.FAILURE_PREFIX):
            payload = line[len(job_runner.FAILURE_PREFIX) :]
            parsed = json.loads(payload)
            return parsed if isinstance(parsed, dict) else {}
    return {}


def _log_process_tail(
    *,
    logger: logging.Logger,
    job_name: str,
    stdout: str | bytes | None,
    stderr: str | bytes | None,
) -> None:
    stdout_tail = _tail_text(stdout)
    stderr_tail = _tail_text(stderr)
    if stdout_tail:
        logger.warning("Child stdout tail for %s:\n%s", job_name, stdout_tail)
    if stderr_tail:
        logger.warning("Child stderr tail for %s:\n%s", job_name, stderr_tail)


def _run_job_callable(job: ServiceJob) -> RUN_RECORD:
    if job.runner is None:
        raise ValueError(f"Service job {job.name} has no runner.")
    summary = job.runner()
    return {
        "status": "succeeded",
        "rows_processed": int(summary.get("rows_processed", 0)),
        "summary": summary,
    }


def _run_job_subprocess(
    job: ServiceJob,
    logger: logging.Logger,
) -> RUN_RECORD:
    if not job.module_name:
        raise ValueError(f"Service job {job.name} has no module_name.")

    timeout_seconds = resolve_job_timeout_seconds(job.timeout_seconds)
    env = os.environ.copy()
    env[job_runner.ENV_JOB_MODULE] = job.module_name
    env[job_runner.ENV_JOB_NAME] = job.name
    if job.module_kwargs:
        env[job_runner.ENV_JOB_KWARGS] = json.dumps(job.module_kwargs)
    env.setdefault("PYTHONUNBUFFERED", "1")
    command = [
        sys.executable,
        "-m",
        "backend.orchestration.ice_python.job_runner",
    ]
    started_at = time.perf_counter()
    try:
        completed = subprocess.run(
            command,
            cwd=Path.cwd(),
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        _log_process_tail(
            logger=logger,
            job_name=job.name,
            stdout=exc.stdout,
            stderr=exc.stderr,
        )
        return {
            "status": "timed_out",
            "rows_processed": 0,
            "elapsed_ms": elapsed_ms,
            "timeout_seconds": timeout_seconds,
            "error_type": "TimeoutExpired",
            "error_message": (
                f"ICE Python job exceeded hard timeout of {timeout_seconds} seconds."
            ),
        }

    elapsed_ms = round((time.perf_counter() - started_at) * 1000)
    child_summary = _parse_child_summary(completed.stdout)
    rows_processed = int(child_summary.get("rows_processed", 0))
    if completed.returncode == 0:
        return {
            "status": "succeeded",
            "rows_processed": rows_processed,
            "elapsed_ms": elapsed_ms,
            "returncode": completed.returncode,
            "summary": child_summary,
        }

    child_failure = _parse_child_failure(completed.stdout)
    _log_process_tail(
        logger=logger,
        job_name=job.name,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )
    return {
        "status": "failed",
        "rows_processed": rows_processed,
        "elapsed_ms": elapsed_ms,
        "returncode": completed.returncode,
        "error_type": str(child_failure.get("error_type") or "ChildProcessError"),
        "error_message": redact_secrets(
            str(child_failure.get("error_message") or "ICE Python child job failed.")
        ),
    }


def run_service_job(job: ServiceJob, logger: logging.Logger) -> RUN_RECORD:
    """Run one scheduled job via callable test hook or isolated child process."""
    if job.runner is not None:
        return _run_job_callable(job)
    return _run_job_subprocess(job=job, logger=logger)


def _started_record(job: ServiceJob, current_time: datetime) -> RUN_RECORD:
    return {
        "status": "running",
        "job_name": job.name,
        "module_name": job.module_name,
        "module_kwargs": job.module_kwargs,
        "cadence": job.cadence,
        "started_at": current_time.isoformat(),
        "timeout_seconds": resolve_job_timeout_seconds(job.timeout_seconds),
    }


def _finished_record(
    *,
    job: ServiceJob,
    current_time: datetime,
    result: RUN_RECORD,
) -> RUN_RECORD:
    return {
        **result,
        "job_name": job.name,
        "module_name": job.module_name,
        "module_kwargs": job.module_kwargs,
        "cadence": job.cadence,
        "finished_at": current_time.isoformat(),
    }


def _log_timeout_telemetry(
    *,
    job: ServiceJob,
    result: RUN_RECORD,
) -> None:
    log_api_fetch(
        actor_type="backend",
        provider="ice_python",
        pipeline_name=job.name,
        operation_name=job.name,
        target_table=f"{settings.SCHEMA}.{settings.SETTLEMENTS_TABLE}",
        method="ICE_PYTHON",
        target_host="local-ice-runtime",
        target_path=f"/{job.name}",
        status="failure",
        http_status=None,
        elapsed_ms=int(result.get("elapsed_ms") or 0),
        rows_returned=0,
        rows_written=0,
        error_type=str(result.get("error_type") or "TimeoutExpired"),
        error_message=str(result.get("error_message") or "ICE Python job timed out."),
        metadata={
            "runtime": "local_windows_ice_python_service",
            "module_name": job.module_name,
            "module_kwargs": job.module_kwargs,
            "timeout_seconds": result.get("timeout_seconds"),
        },
    )


def run_due_jobs(
    current_time: datetime,
    run_state: RUN_STATE,
    jobs: Sequence[ServiceJob] = DEFAULT_JOBS,
    state_file: Path | None = None,
    logger: logging.Logger | None = None,
    respect_run_state: bool = True,
) -> dict[str, int]:
    """Attempt due jobs and return a compact service-loop summary."""
    service_logger = logger or configure_service_logging()
    if respect_run_state:
        selected_jobs = [
            (job, current_time)
            for job in due_jobs(
                current_time=current_time,
                run_state=run_state,
                jobs=jobs,
            )
        ]
    else:
        selected_jobs = [
            (job, current_time)
            for job in task_scheduler_tick_jobs(
                current_time=current_time,
                jobs=jobs,
            )
        ]
    return run_selected_jobs(
        selected_jobs=selected_jobs,
        run_state=run_state,
        state_file=state_file,
        logger=service_logger,
    )


def run_failed_jobs(
    current_time: datetime,
    run_state: RUN_STATE,
    jobs: Sequence[ServiceJob] = DEFAULT_JOBS,
    state_file: Path | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, int]:
    """Replay latest failed or stale-running job records from persisted state."""
    service_logger = logger or configure_service_logging()
    selected_jobs = latest_failed_job_attempts(
        current_time=current_time,
        run_state=run_state,
        jobs=jobs,
    )
    return run_selected_jobs(
        selected_jobs=selected_jobs,
        run_state=run_state,
        state_file=state_file,
        logger=service_logger,
    )


def run_selected_jobs(
    *,
    selected_jobs: Sequence[tuple[ServiceJob, datetime]],
    run_state: RUN_STATE,
    state_file: Path | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, int]:
    """Attempt selected jobs and persist results under their scheduler window."""
    service_logger = logger or configure_service_logging()
    succeeded = 0
    failed = 0
    timed_out = 0

    for job, run_key_time in selected_jobs:
        run_key = job_run_key(job, run_key_time)
        started_at = datetime.now(run_key_time.tzinfo)
        run_state[run_key] = _started_record(job=job, current_time=started_at)
        if state_file is not None:
            try:
                save_run_state(state_file=state_file, run_state=run_state)
            except OSError:
                service_logger.exception("Failed to persist ICE service state.")

        service_logger.info("Starting ICE Python job: %s", job.name)
        try:
            result = run_service_job(job=job, logger=service_logger)
            finished_at = datetime.now(started_at.tzinfo)
            run_state[run_key] = _finished_record(
                job=job,
                current_time=finished_at,
                result=result,
            )
            rows_processed = int(result.get("rows_processed", 0))
            status = str(result.get("status", "failed"))
            if status == "succeeded":
                succeeded += 1
            else:
                failed += 1
                if status == "timed_out":
                    timed_out += 1
                    _log_timeout_telemetry(job=job, result=result)
            service_logger.info(
                "Finished ICE Python job: %s status=%s rows_processed=%s",
                job.name,
                status,
                f"{rows_processed:,}",
            )
        except Exception as exc:
            failed += 1
            finished_at = datetime.now(started_at.tzinfo)
            run_state[run_key] = _finished_record(
                job=job,
                current_time=finished_at,
                result={
                    "status": "failed",
                    "rows_processed": 0,
                    "error_type": type(exc).__name__,
                    "error_message": redact_secrets(str(exc)),
                },
            )
            service_logger.exception("ICE Python job failed: %s", job.name)
        finally:
            if state_file is not None:
                try:
                    save_run_state(state_file=state_file, run_state=run_state)
                except OSError:
                    service_logger.exception("Failed to persist ICE service state.")

    return {
        "jobs_due": len(selected_jobs),
        "jobs_succeeded": succeeded,
        "jobs_failed": failed,
        "jobs_timed_out": timed_out,
    }


def _request_stop(signum: int, _frame: object) -> None:
    del signum
    global _STOP_REQUESTED
    _STOP_REQUESTED = True


def install_stop_handlers() -> None:
    """Install signal handlers used by service wrappers and console runs."""
    signal.signal(signal.SIGINT, _request_stop)
    signal.signal(signal.SIGTERM, _request_stop)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, _request_stop)


def sleep_until_next_poll(poll_seconds: int) -> None:
    """Sleep in short chunks so stop signals are handled promptly."""
    deadline = time.monotonic() + poll_seconds
    while not _STOP_REQUESTED:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return
        time.sleep(min(remaining, 1.0))


def run_service_loop(
    poll_seconds: int | None = None,
    run_once: bool = False,
    rerun_failed: bool = False,
    timezone_name: str = DEFAULT_TIMEZONE,
    state_file: str | Path | None = None,
    jobs: Sequence[ServiceJob] | None = None,
    job_group: str = "all",
) -> int:
    """Run the ICE service scheduler loop."""
    service_logger = configure_service_logging()
    local_timezone = ZoneInfo(timezone_name)
    resolved_poll_seconds = resolve_poll_seconds(poll_seconds)
    resolved_state_file = resolve_state_file(state_file)
    selected_jobs = tuple(jobs) if jobs is not None else resolve_job_group(job_group)

    try:
        run_state = load_run_state(resolved_state_file)
    except (OSError, json.JSONDecodeError):
        service_logger.exception(
            "Failed to load ICE service state from %s; starting with empty state.",
            resolved_state_file,
        )
        run_state = {}

    service_logger.info(
        "ICE Python service starting: timezone=%s poll_seconds=%s "
        "state_file=%s job_group=%s jobs=%s",
        timezone_name,
        resolved_poll_seconds,
        resolved_state_file,
        job_group,
        ", ".join(job.name for job in selected_jobs),
    )

    if rerun_failed:
        current_time = datetime.now(local_timezone)
        summary = run_failed_jobs(
            current_time=current_time,
            run_state=run_state,
            jobs=selected_jobs,
            state_file=resolved_state_file,
            logger=service_logger,
        )
        return 1 if summary["jobs_failed"] else 0

    while not _STOP_REQUESTED:
        current_time = datetime.now(local_timezone)
        summary = run_due_jobs(
            current_time=current_time,
            run_state=run_state,
            jobs=selected_jobs,
            state_file=resolved_state_file,
            logger=service_logger,
            respect_run_state=not run_once,
        )
        if run_once:
            return 1 if summary["jobs_failed"] else 0
        sleep_until_next_poll(resolved_poll_seconds)

    service_logger.info("ICE Python service stopping.")
    return 0


def main(
    poll_seconds: int | None = None,
    run_once: bool = False,
    rerun_failed: bool = False,
    timezone_name: str = DEFAULT_TIMEZONE,
    state_file: str | Path | None = None,
    job_group: str = "all",
) -> int:
    """Entry point for Task Scheduler run_once and legacy service wrappers."""
    install_stop_handlers()
    return run_service_loop(
        poll_seconds=poll_seconds,
        run_once=run_once,
        rerun_failed=rerun_failed,
        timezone_name=timezone_name,
        state_file=state_file,
        job_group=job_group,
    )


if __name__ == "__main__":
    raise SystemExit(main())
