-- Source-table DDL for ice_trade_blotter.file_manifest.
--
-- This file is reference/operator SQL only. It is outside dbt model-paths and
-- should not be run by dbt. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before running the ICE trade
-- blotter file manager or importer.
--
-- Source system: manually downloaded ICE Deal Report .xls/CSV exports.
-- Grain: one content hash for one managed source file.
-- Safe rerun: backend upserts by file_hash and recomputes load state after
-- trade rows are written.
-- Downstream consumers: freshness checks and read-only inspection SQL.

CREATE TABLE IF NOT EXISTS ice_trade_blotter.file_manifest (
    file_hash VARCHAR NOT NULL,
    source_filename VARCHAR NOT NULL,
    stored_filename VARCHAR NOT NULL,
    min_trade_date DATE NOT NULL,
    max_trade_date DATE NOT NULL,
    row_count INTEGER NOT NULL,
    source_file_modified_at TIMESTAMPTZ NOT NULL,
    managed_at TIMESTAMPTZ NOT NULL,
    status VARCHAR NOT NULL,
    is_loaded BOOLEAN NOT NULL DEFAULT FALSE,
    loaded_at TIMESTAMPTZ,
    loaded_row_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (file_hash)
);

COMMENT ON TABLE ice_trade_blotter.file_manifest IS
    'File lineage and load state for managed ICE Deal Report trade blotter exports.';
