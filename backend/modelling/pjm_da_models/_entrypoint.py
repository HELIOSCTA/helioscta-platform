"""Backend script-logging wrapper for PJM DA model entrypoints."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

from backend.utils import script_logging


T = TypeVar("T")


def run_entrypoint(
    *,
    name: str,
    module_file: str,
    runner: Callable[[], T],
) -> T:
    """Run an operator entrypoint with backend-standard script logging."""
    log_dir = script_logging.get_log_dir(Path(module_file).resolve().parent / "logs")
    run_logger = script_logging.init_logging(
        name=name,
        log_dir=log_dir,
        log_to_file=True,
        delete_if_no_errors=True,
    )
    try:
        run_logger.header(name)
        result = runner()
        run_logger.success(f"{name} completed.")
        return result
    except Exception as exc:
        run_logger.exception(f"{name} failed: {exc}")
        raise
    finally:
        script_logging.close_logging()
