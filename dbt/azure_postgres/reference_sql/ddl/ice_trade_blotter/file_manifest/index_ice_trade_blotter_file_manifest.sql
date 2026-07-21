-- Source-table indexes for ice_trade_blotter.file_manifest.
--
-- This file is reference/operator SQL only. It is outside dbt model-paths and
-- should not be run by dbt. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_file_manifest_latest_managed
    ON ice_trade_blotter.file_manifest (
        status,
        max_trade_date DESC,
        row_count DESC,
        managed_at DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_file_manifest_backfill_order
    ON ice_trade_blotter.file_manifest (
        status,
        min_trade_date,
        max_trade_date,
        managed_at
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_file_manifest_managed_overlap
    ON ice_trade_blotter.file_manifest (min_trade_date, max_trade_date)
    WHERE status = 'managed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ice_trade_blotter_file_manifest_loaded_files
    ON ice_trade_blotter.file_manifest (min_trade_date, max_trade_date, loaded_at DESC)
    WHERE is_loaded;
