"""Child-process runner for scheduled local ICE Python jobs."""
from __future__ import annotations

import importlib
import json
import logging
import os
from typing import Any

from backend.utils.ops_logging import redact_secrets


ENV_JOB_MODULE = "HELIOS_ICE_JOB_MODULE"
ENV_JOB_NAME = "HELIOS_ICE_JOB_NAME"
SUMMARY_PREFIX = "HELIOS_ICE_JOB_SUMMARY="
FAILURE_PREFIX = "HELIOS_ICE_JOB_FAILURE="

logger = logging.getLogger(__name__)


def _emit(prefix: str, payload: dict[str, Any]) -> None:
    print(f"{prefix}{json.dumps(payload, default=str, sort_keys=True)}", flush=True)


def run_job_module(module_name: str) -> dict[str, object]:
    """Import an ICE orchestration module and run its default job function."""
    module = importlib.import_module(module_name)
    runner = getattr(module, "run", None)
    if runner is None:
        raise AttributeError(f"{module_name} does not expose a run() function.")

    summary = runner()
    if not isinstance(summary, dict):
        raise TypeError(f"{module_name}.run() returned {type(summary).__name__}.")
    return summary


def main(
    module_name: str | None = None,
    job_name: str | None = None,
) -> int:
    """Run the configured child job and emit one parseable JSON summary line."""
    resolved_module_name = module_name or os.environ.get(ENV_JOB_MODULE)
    if not resolved_module_name:
        _emit(
            FAILURE_PREFIX,
            {
                "error_type": "ValueError",
                "error_message": f"{ENV_JOB_MODULE} is required.",
            },
        )
        return 2

    resolved_job_name = (
        job_name
        or os.environ.get(ENV_JOB_NAME)
        or resolved_module_name.rsplit(".", maxsplit=1)[-1]
    )
    try:
        summary = run_job_module(resolved_module_name)
        _emit(
            SUMMARY_PREFIX,
            {
                "job_name": resolved_job_name,
                "module_name": resolved_module_name,
                "summary": summary,
            },
        )
        return 0
    except Exception as exc:
        error_message = redact_secrets(str(exc))
        logger.exception("ICE Python child job failed: %s", resolved_job_name)
        _emit(
            FAILURE_PREFIX,
            {
                "job_name": resolved_job_name,
                "module_name": resolved_module_name,
                "error_type": type(exc).__name__,
                "error_message": error_message,
            },
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
