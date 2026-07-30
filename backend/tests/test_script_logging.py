from __future__ import annotations

from pathlib import Path
import shutil
from uuid import uuid4

from backend.utils import script_logging


def test_pipeline_logger_close_does_not_fail_when_success_log_delete_is_locked(
    monkeypatch,
):
    log_dir = Path("backend/tests/.script_logging_tmp") / uuid4().hex
    log_dir.mkdir(parents=True, exist_ok=True)
    run_logger = script_logging.PipelineLogger(
        name="locked-success-log",
        log_dir=log_dir,
        log_to_file=True,
        delete_if_no_errors=True,
        capture_root=True,
    )
    try:
        run_logger.info("successful run")
        delete_attempts = []

        def fake_remove(path):
            delete_attempts.append(path)
            raise PermissionError("file is still locked")

        monkeypatch.setattr(script_logging.os, "remove", fake_remove)

        run_logger.close()

        assert delete_attempts == [run_logger.log_file_path]
        assert run_logger._handlers == []
    finally:
        if run_logger._handlers:
            run_logger.close()
        monkeypatch.undo()
        shutil.rmtree(log_dir, ignore_errors=True)
