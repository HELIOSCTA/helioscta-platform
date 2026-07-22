"""Install the proprietary ICE Python wheel on a licensed Windows host.

The wheel is supplied by ICE XL and must stay outside this repository. This
operator helper installs it into the selected Python environment and verifies
that the target interpreter can import ``icepython``.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Sequence

DEFAULT_ICE_WHEEL_NAME = "theice.com_ICEPython-0.0.6-py3-none-any.whl"
ICE_WHEEL_GLOB = "theice.com_ICEPython-*.whl"


def default_ice_bin_path() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    root = Path(local_app_data) if local_app_data else Path.home() / "AppData" / "Local"
    return root / "ICE Data Services" / "ICE XL" / "bin"


def expand_path(value: str | Path) -> Path:
    return Path(os.path.expandvars(str(value))).expanduser()


def resolve_python_exe(python_exe: str | Path) -> str:
    candidate = expand_path(python_exe)
    if candidate.exists():
        return str(candidate.resolve())

    resolved = shutil.which(str(python_exe))
    if resolved:
        return resolved

    raise FileNotFoundError(f"Python executable not found: {python_exe}")


def resolve_wheel_path(
    wheel_path: str | Path | None = None,
    ice_bin_path: str | Path | None = None,
    wheel_name: str = DEFAULT_ICE_WHEEL_NAME,
) -> Path:
    if wheel_path:
        resolved_wheel = expand_path(wheel_path)
        if not resolved_wheel.exists():
            raise FileNotFoundError(f"ICE Python wheel not found: {resolved_wheel}")
        if not resolved_wheel.is_file():
            raise FileNotFoundError(f"ICE Python wheel is not a file: {resolved_wheel}")
        return resolved_wheel.resolve()

    resolved_ice_bin = (
        expand_path(ice_bin_path) if ice_bin_path else default_ice_bin_path()
    )
    if not resolved_ice_bin.exists():
        raise FileNotFoundError(f"ICE XL bin directory not found: {resolved_ice_bin}")
    if not resolved_ice_bin.is_dir():
        raise NotADirectoryError(f"ICE XL bin path is not a directory: {resolved_ice_bin}")

    candidate = resolved_ice_bin / wheel_name
    if candidate.exists():
        if not candidate.is_file():
            raise FileNotFoundError(f"ICE Python wheel is not a file: {candidate}")
        return candidate.resolve()

    if wheel_name != DEFAULT_ICE_WHEEL_NAME:
        raise FileNotFoundError(f"ICE Python wheel not found: {candidate}")

    matches = sorted(
        resolved_ice_bin.glob(ICE_WHEEL_GLOB),
        key=lambda path: (path.stat().st_mtime, path.name),
        reverse=True,
    )
    if matches:
        return matches[0].resolve()

    raise FileNotFoundError(
        "ICE Python wheel not found. Expected "
        f"{candidate} or a {ICE_WHEEL_GLOB} wheel in {resolved_ice_bin}."
    )


def is_missing_icepython(diagnostics: str) -> bool:
    return (
        "No module named 'icepython'" in diagnostics
        or 'No module named "icepython"' in diagnostics
    )


def check_icepython_installation(
    python_exe: str,
    report_missing: bool = False,
) -> str | None:
    command = [
        python_exe,
        "-c",
        "import icepython; print(getattr(icepython, '__file__', '') or '<installed>')",
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode == 0:
        return result.stdout.strip()

    diagnostics = (result.stderr or result.stdout).strip()
    if diagnostics and (report_missing or not is_missing_icepython(diagnostics)):
        print(f"icepython import check failed: {diagnostics}", file=sys.stderr)
    return None


def run_install_command(
    python_exe: str,
    wheel_path: Path,
    force_reinstall: bool,
    dry_run: bool,
) -> None:
    command = [python_exe, "-m", "pip", "install", str(wheel_path)]
    if force_reinstall:
        command.append("--force-reinstall")

    if dry_run:
        print("Dry run; would execute:")
        print(subprocess.list2cmdline(command))
        return

    print(f"Installing ICE Python wheel: {wheel_path}")
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.stdout:
        print(result.stdout.strip())
    if result.returncode != 0:
        if result.stderr:
            print(result.stderr.strip(), file=sys.stderr)
        raise RuntimeError(f"pip install failed with exit code {result.returncode}")


def install_icepython(
    python_exe: str | Path = sys.executable,
    wheel_path: str | Path | None = None,
    ice_bin_path: str | Path | None = None,
    wheel_name: str = DEFAULT_ICE_WHEEL_NAME,
    force_reinstall: bool = True,
    dry_run: bool = False,
) -> bool:
    resolved_python = resolve_python_exe(python_exe)
    resolved_wheel = resolve_wheel_path(
        wheel_path=wheel_path,
        ice_bin_path=ice_bin_path,
        wheel_name=wheel_name,
    )

    print(f"Python: {resolved_python}")
    print(f"Wheel: {resolved_wheel}")

    existing_path = check_icepython_installation(resolved_python)
    if existing_path:
        print(f"Existing icepython installation: {existing_path}")
    else:
        print("icepython is not currently importable in the target Python.")

    run_install_command(
        python_exe=resolved_python,
        wheel_path=resolved_wheel,
        force_reinstall=force_reinstall,
        dry_run=dry_run,
    )

    if dry_run:
        return True

    installed_path = check_icepython_installation(
        resolved_python,
        report_missing=True,
    )
    if not installed_path:
        raise RuntimeError("icepython import failed after installation")

    print(f"icepython installed successfully: {installed_path}")
    return True


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Install the proprietary ICE Python wheel from a licensed ICE XL "
            "installation into the selected Python environment."
        )
    )
    parser.add_argument(
        "--python-exe",
        default=sys.executable,
        help="Target Python executable. Defaults to the interpreter running this script.",
    )
    parser.add_argument(
        "--wheel",
        default=None,
        help="Explicit path to the ICE Python wheel. Overrides --ice-bin and --wheel-name.",
    )
    parser.add_argument(
        "--ice-bin",
        default=None,
        help=(
            "ICE XL bin directory containing the ICE Python wheel. Defaults to "
            "%%LOCALAPPDATA%%\\ICE Data Services\\ICE XL\\bin."
        ),
    )
    parser.add_argument(
        "--wheel-name",
        default=DEFAULT_ICE_WHEEL_NAME,
        help=(
            "Wheel filename to install from --ice-bin. If the default name is "
            f"missing, the newest {ICE_WHEEL_GLOB} match is used."
        ),
    )
    parser.add_argument(
        "--no-force-reinstall",
        dest="force_reinstall",
        action="store_false",
        default=True,
        help="Do not pass --force-reinstall to pip.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolve paths and print the pip command without installing.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        install_icepython(
            python_exe=args.python_exe,
            wheel_path=args.wheel,
            ice_bin_path=args.ice_bin,
            wheel_name=args.wheel_name,
            force_reinstall=args.force_reinstall,
            dry_run=args.dry_run,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
