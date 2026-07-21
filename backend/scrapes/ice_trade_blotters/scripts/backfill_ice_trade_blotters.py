"""Compatibility wrapper for the ICE trade blotter legacy-cache backfill."""
from __future__ import annotations

from pathlib import Path

from backend.backfills.ice_trade_blotters import from_legacy_cache


def main(
    source_dir: str | Path = from_legacy_cache.DEFAULT_LEGACY_SOURCE_DIR,
    formatted_files_dir: str | Path = from_legacy_cache.DEFAULT_FORMATTED_FILES_DIR,
    start_trade_date=None,
    end_trade_date=None,
    batch_size: int = from_legacy_cache.DEFAULT_BATCH_SIZE,
    max_files: int | None = None,
    dry_run: bool = False,
    database: str | None = None,
) -> int:
    result = from_legacy_cache.main(
        source_dir=source_dir,
        formatted_files_dir=formatted_files_dir,
        start_trade_date=start_trade_date,
        end_trade_date=end_trade_date,
        batch_size=batch_size,
        max_files=max_files,
        dry_run=dry_run,
        database=database,
    )
    return 0 if result.status in {"success", "dry_run"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
