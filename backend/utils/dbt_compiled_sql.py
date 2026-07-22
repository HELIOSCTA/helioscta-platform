"""Load compiled dbt SQL for backend runtime consumers."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from backend import credentials

REPO_ROOT = Path(__file__).resolve().parents[2]
DBT_PROJECT_DIR = REPO_ROOT / "dbt" / "azure_postgres"
DBT_COMPILED_MODELS_ROOT = (
    DBT_PROJECT_DIR
    / "target"
    / "compiled"
    / "helioscta_platform"
    / "models"
)
POSITIONS_TRADES_V3_COMPILED_ROOT = (
    DBT_COMPILED_MODELS_ROOT / "positions_and_trades_v3"
)
DBT_COMPILE_TIMEOUT_SECONDS = 180


def load_positions_trades_v3_model_sql(
    model_path: str | Path,
    *,
    compile_before_load: bool = True,
) -> str:
    """Compile and load a positions/trades v3 dbt model as executable SQL."""
    relative_model_path = Path(model_path)
    if relative_model_path.is_absolute() or ".." in relative_model_path.parts:
        raise ValueError(f"model_path must be relative to positions_and_trades_v3: {model_path}")

    if compile_before_load:
        compile_positions_trades_v3_model(relative_model_path)

    compiled_path = POSITIONS_TRADES_V3_COMPILED_ROOT / relative_model_path
    if not compiled_path.exists():
        raise FileNotFoundError(
            "Compiled dbt SQL file not found: "
            f"{compiled_path}. Run dbt compile for positions_and_trades_v3 first."
        )
    return _normalize_sql(compiled_path.read_text(encoding="utf-8"))


def compile_positions_trades_v3_model(model_path: str | Path) -> None:
    """Run dbt compile for one positions/trades v3 model using read-only env vars."""
    relative_model_path = Path(model_path)
    select_arg = (
        "path:models/positions_and_trades_v3/"
        + relative_model_path.as_posix()
    )
    env = _dbt_environment()
    missing = [
        name
        for name in (
            "DBT_POSTGRES_HOST",
            "DBT_POSTGRES_READONLY_USER",
            "DBT_POSTGRES_READONLY_PASSWORD",
            "DBT_POSTGRES_DBNAME",
        )
        if not env.get(name)
    ]
    if missing:
        raise RuntimeError(
            "Missing dbt read-only environment variables: " + ", ".join(missing)
        )

    profiles_dir_arg, temp_profiles_dir = _dbt_profiles_dir_arg(DBT_PROJECT_DIR)
    command = [
        _resolve_dbt_executable(),
        "compile",
        "--profiles-dir",
        profiles_dir_arg,
        "--select",
        select_arg,
    ]
    try:
        completed = subprocess.run(
            command,
            cwd=DBT_PROJECT_DIR,
            env=env,
            check=False,
            capture_output=True,
            text=True,
            timeout=DBT_COMPILE_TIMEOUT_SECONDS,
        )
    finally:
        if temp_profiles_dir is not None:
            temp_profiles_dir.cleanup()

    if completed.returncode != 0:
        stdout_tail = _tail_lines(_strip_ansi(completed.stdout))
        stderr_tail = _tail_lines(_strip_ansi(completed.stderr))
        detail = "\n".join(line for line in (stdout_tail, stderr_tail) if line)
        raise RuntimeError(
            "dbt compile failed for "
            f"positions_and_trades_v3/{relative_model_path.as_posix()}."
            + (f"\n{detail}" if detail else "")
        )


def _dbt_environment() -> dict[str, str]:
    env = os.environ.copy()
    defaults = {
        "DBT_POSTGRES_HOST": credentials.AZURE_POSTGRESQL_DB_HOST,
        "DBT_POSTGRES_PORT": credentials.AZURE_POSTGRESQL_DB_PORT,
        "DBT_POSTGRES_DBNAME": credentials.AZURE_POSTGRESQL_DB_NAME,
        "DBT_POSTGRES_SSLMODE": credentials.AZURE_POSTGRESQL_DB_SSLMODE,
        "DBT_POSTGRES_READONLY_USER": "helios_readonly",
    }
    for name, value in defaults.items():
        if value and not env.get(name):
            env[name] = str(value)
    return env


def _dbt_profiles_dir_arg(
    dbt_project_dir: Path,
) -> tuple[str, tempfile.TemporaryDirectory[str] | None]:
    if (dbt_project_dir / "profiles.yml").exists():
        return ".", None

    profile_template = dbt_project_dir / "profiles.yml.example"
    if not profile_template.exists():
        return ".", None

    temp_profiles_dir = tempfile.TemporaryDirectory(prefix="helios_dbt_profiles_")
    shutil.copy2(profile_template, Path(temp_profiles_dir.name) / "profiles.yml")
    return temp_profiles_dir.name, temp_profiles_dir


def _resolve_dbt_executable() -> str:
    python_dir = Path(sys.executable).parent
    candidates = [
        python_dir / "dbt",
        python_dir / "dbt.exe",
        python_dir / "Scripts" / "dbt",
        python_dir / "Scripts" / "dbt.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    return shutil.which("dbt") or "dbt"


def _normalize_sql(value: str) -> str:
    return value.strip().rstrip(";").strip()


def _strip_ansi(text: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


def _tail_lines(text: str, line_count: int = 25) -> str:
    lines = text.splitlines()
    return "\n".join(lines[-line_count:])
