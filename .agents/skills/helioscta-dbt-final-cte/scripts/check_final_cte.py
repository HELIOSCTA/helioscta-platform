#!/usr/bin/env python3
"""Check HeliosCTA dbt SQL models for the terminal FINAL CTE style."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


FINAL_CTE_RE = re.compile(r"\bFINAL\s+as\s*\(", re.IGNORECASE)
FINAL_SELECT_RE = re.compile(
    r"select\s+\*\s+from\s+FINAL\b(?:\s+order\s+by\b[\s\S]*)?\s*;?\s*$",
    re.IGNORECASE,
)


def strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*[\s\S]*?\*/", "", sql)
    return re.sub(r"--.*", "", sql)


def check_file(path: Path) -> list[str]:
    sql = strip_sql_comments(path.read_text(encoding="utf-8"))
    problems: list[str] = []
    if not FINAL_CTE_RE.search(sql):
        problems.append("missing FINAL CTE")
    if not FINAL_SELECT_RE.search(sql):
        problems.append("does not end with SELECT * FROM FINAL")
    return problems


def iter_sql_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_file() and path.suffix.lower() == ".sql":
            files.append(path)
        elif path.is_dir():
            files.extend(sorted(path.rglob("*.sql")))
    return sorted(set(files))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check dbt SQL files for terminal FINAL CTE style."
    )
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()

    failures: list[tuple[Path, list[str]]] = []
    for sql_file in iter_sql_files(args.paths):
        problems = check_file(sql_file)
        if problems:
            failures.append((sql_file, problems))

    if failures:
        for path, problems in failures:
            print(f"{path}: {', '.join(problems)}")
        return 1

    print("All checked SQL files use terminal FINAL CTE style.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
