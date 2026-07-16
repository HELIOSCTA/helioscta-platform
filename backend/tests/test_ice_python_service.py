from __future__ import annotations

from datetime import datetime
from datetime import time as dt_time
from zoneinfo import ZoneInfo

from backend.orchestration.ice_python import service


LOCAL_TZ = ZoneInfo("America/Denver")


def _job(name: str, cadence: str = "hourly") -> service.ServiceJob:
    return service.ServiceJob(
        name=name,
        cadence=cadence,
        runner=lambda: {"rows_processed": 3},
        windows=service.DEFAULT_HOURLY_WINDOWS if cadence == "hourly" else (),
        daily_start=dt_time(15, 0) if cadence == "daily" else None,
    )


def test_hourly_job_is_due_once_inside_service_window():
    current_time = datetime(2026, 6, 18, 6, 15, tzinfo=LOCAL_TZ)
    run_state: dict[str, str] = {}
    job = _job("pjm_short_term")

    assert service.is_job_due(job, current_time, run_state) is True

    run_state[service.job_run_key(job, current_time)] = current_time.isoformat()

    assert service.is_job_due(job, current_time, run_state) is False


def test_hourly_job_is_not_due_outside_service_window():
    current_time = datetime(2026, 6, 18, 10, 0, tzinfo=LOCAL_TZ)

    assert service.due_jobs(current_time, {}, jobs=[_job("pjm_short_term")]) == []


def test_daily_job_catches_up_after_daily_start_once():
    current_time = datetime(2026, 6, 18, 21, 30, tzinfo=LOCAL_TZ)
    run_state: dict[str, str] = {}
    job = _job("daily_archive", cadence="daily")

    assert service.is_job_due(job, current_time, run_state) is True

    run_state[service.job_run_key(job, current_time)] = current_time.isoformat()

    assert service.is_job_due(job, current_time, run_state) is False


def test_run_due_jobs_persists_success_state_after_runner_call(tmp_path):
    current_time = datetime(2026, 6, 18, 14, 1, tzinfo=LOCAL_TZ)
    state_file = tmp_path / "state.json"
    calls: list[str] = []

    def fake_runner() -> dict[str, object]:
        calls.append("ran")
        return {"rows_processed": 7}

    job = service.ServiceJob(
        name="gas_balmo",
        runner=fake_runner,
        cadence="hourly",
        windows=service.DEFAULT_HOURLY_WINDOWS,
    )
    run_state: dict[str, str] = {}

    summary = service.run_due_jobs(
        current_time=current_time,
        run_state=run_state,
        jobs=[job],
        state_file=state_file,
    )

    assert calls == ["ran"]
    assert summary == {
        "jobs_due": 1,
        "jobs_succeeded": 1,
        "jobs_failed": 0,
        "jobs_timed_out": 0,
    }
    run_key = service.job_run_key(job, current_time)
    assert run_state[run_key]["status"] == "succeeded"
    assert run_state[run_key]["rows_processed"] == 7
    assert service.load_run_state(state_file) == run_state


def test_run_due_jobs_records_failed_attempt_without_retrying_same_hour():
    current_time = datetime(2026, 6, 18, 14, 1, tzinfo=LOCAL_TZ)

    def failing_runner() -> dict[str, object]:
        raise RuntimeError("boom")

    job = service.ServiceJob(
        name="ercot_futures",
        runner=failing_runner,
        cadence="hourly",
        windows=service.DEFAULT_HOURLY_WINDOWS,
    )
    run_state: dict[str, str] = {}

    summary = service.run_due_jobs(
        current_time=current_time,
        run_state=run_state,
        jobs=[job],
    )

    assert summary == {
        "jobs_due": 1,
        "jobs_succeeded": 0,
        "jobs_failed": 1,
        "jobs_timed_out": 0,
    }
    run_key = service.job_run_key(job, current_time)
    assert run_state[run_key]["status"] == "failed"
    assert run_state[run_key]["error_type"] == "RuntimeError"
    assert service.due_jobs(current_time, run_state, jobs=[job]) == []


def test_task_scheduler_tick_ignores_same_hour_failed_state():
    current_time = datetime(2026, 6, 18, 14, 1, tzinfo=LOCAL_TZ)
    calls: list[str] = []

    def fake_runner() -> dict[str, object]:
        calls.append("ran")
        return {"rows_processed": 9}

    job = service.ServiceJob(
        name="ercot_futures",
        runner=fake_runner,
        cadence="hourly",
        windows=service.DEFAULT_HOURLY_WINDOWS,
    )
    run_state = {
        service.job_run_key(job, current_time): {
            "status": "failed",
            "finished_at": datetime(2026, 6, 18, 14, 0, tzinfo=LOCAL_TZ).isoformat(),
        }
    }

    summary = service.run_due_jobs(
        current_time=current_time,
        run_state=run_state,
        jobs=[job],
        respect_run_state=False,
    )

    assert calls == ["ran"]
    assert summary == {
        "jobs_due": 1,
        "jobs_succeeded": 1,
        "jobs_failed": 0,
        "jobs_timed_out": 0,
    }
    assert run_state[service.job_run_key(job, current_time)]["status"] == "succeeded"
    assert run_state[service.job_run_key(job, current_time)]["rows_processed"] == 9


def test_task_scheduler_tick_includes_split_gas_futures_in_hourly_batch():
    gas_futures_jobs = [
        service.ServiceJob(
            name=name,
            cadence="hourly",
            runner=lambda: {"rows_processed": 3},
            windows=service.DEFAULT_HOURLY_WINDOWS,
        )
        for name in [
            "gas_futures_core",
            "gas_futures_gulf",
            "gas_futures_west",
            "gas_futures_east",
        ]
    ]

    assert service.task_scheduler_tick_jobs(
        datetime(2026, 6, 18, 10, 0, tzinfo=LOCAL_TZ),
        jobs=gas_futures_jobs,
    ) == []
    assert service.task_scheduler_tick_jobs(
        datetime(2026, 6, 18, 15, 30, tzinfo=LOCAL_TZ),
        jobs=gas_futures_jobs,
    ) == gas_futures_jobs
    assert service.task_scheduler_tick_jobs(
        datetime(2026, 6, 18, 16, 0, tzinfo=LOCAL_TZ),
        jobs=gas_futures_jobs,
    ) == gas_futures_jobs


def test_latest_failed_job_attempts_skips_old_failures_after_success():
    current_time = datetime(2026, 6, 18, 9, 30, tzinfo=LOCAL_TZ)
    pjm = _job("pjm_futures")
    gas = _job("gas_balmo")
    run_state = {
        "pjm_futures:2026-06-18T08": {
            "status": "failed",
            "finished_at": datetime(2026, 6, 18, 8, 30, tzinfo=LOCAL_TZ).isoformat(),
        },
        "pjm_futures:2026-06-18T09": {
            "status": "succeeded",
            "finished_at": datetime(2026, 6, 18, 9, 5, tzinfo=LOCAL_TZ).isoformat(),
        },
        "gas_balmo:2026-06-18T08": {
            "status": "failed",
            "finished_at": datetime(2026, 6, 18, 8, 30, tzinfo=LOCAL_TZ).isoformat(),
        },
    }

    attempts = service.latest_failed_job_attempts(
        current_time=current_time,
        run_state=run_state,
        jobs=[pjm, gas],
    )

    assert attempts == [(gas, datetime(2026, 6, 18, 8, tzinfo=LOCAL_TZ))]


def test_run_failed_jobs_replays_latest_failed_window(tmp_path):
    current_time = datetime(2026, 6, 18, 9, 30, tzinfo=LOCAL_TZ)
    state_file = tmp_path / "state.json"
    calls: list[str] = []

    def fake_runner() -> dict[str, object]:
        calls.append("ran")
        return {"rows_processed": 11}

    job = service.ServiceJob(
        name="gas_next_day",
        runner=fake_runner,
        cadence="hourly",
        windows=service.DEFAULT_HOURLY_WINDOWS,
    )
    run_state = {
        "gas_next_day:2026-06-18T08": {
            "status": "failed",
            "finished_at": datetime(2026, 6, 18, 8, 30, tzinfo=LOCAL_TZ).isoformat(),
        },
    }

    summary = service.run_failed_jobs(
        current_time=current_time,
        run_state=run_state,
        jobs=[job],
        state_file=state_file,
    )

    assert calls == ["ran"]
    assert summary == {
        "jobs_due": 1,
        "jobs_succeeded": 1,
        "jobs_failed": 0,
        "jobs_timed_out": 0,
    }
    assert run_state["gas_next_day:2026-06-18T08"]["status"] == "succeeded"
    assert run_state["gas_next_day:2026-06-18T08"]["rows_processed"] == 11
    assert service.load_run_state(state_file) == run_state


def test_legacy_timestamp_state_is_attempted_not_succeeded(tmp_path):
    state_file = tmp_path / "state.json"
    state_file.write_text(
        '{"gas_balmo:2026-06-18T14": "2026-06-18T14:00:15.476167-06:00"}\n',
        encoding="utf-8",
    )
    current_time = datetime(2026, 6, 18, 14, 30, tzinfo=LOCAL_TZ)
    job = _job("gas_balmo")

    run_state = service.load_run_state(state_file)
    record = run_state[service.job_run_key(job, current_time)]

    assert record["status"] == "attempted"
    assert record["legacy_state"] is True
    assert service.due_jobs(current_time, run_state, jobs=[job]) == []


def test_stale_running_state_is_due_after_timeout():
    current_time = datetime(2026, 6, 18, 14, 10, tzinfo=LOCAL_TZ)
    job = service.ServiceJob(
        name="west_power_futures",
        cadence="hourly",
        runner=lambda: {"rows_processed": 3},
        windows=service.DEFAULT_HOURLY_WINDOWS,
        timeout_seconds=60,
    )
    run_state = {
        service.job_run_key(job, current_time): {
            "status": "running",
            "started_at": datetime(2026, 6, 18, 14, 7, tzinfo=LOCAL_TZ).isoformat(),
        }
    }

    assert service.is_job_due(job, current_time, run_state) is True
