-- Source-table indexes for nav.positions.
--
-- This file is reference/operator SQL only. It is outside dbt model-paths and
-- should not be run by dbt. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nav_positions_latest_fund
    ON nav.positions (
        fund_code,
        nav_date DESC,
        sftp_upload_timestamp DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nav_positions_latest_file
    ON nav.positions (
        nav_date DESC,
        sftp_upload_timestamp DESC,
        source_file_name
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nav_positions_product_lookup
    ON nav.positions (
        product,
        product_id_internal,
        client_symbol,
        month_year
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nav_positions_account_lookup
    ON nav.positions (
        account,
        broker_name,
        fund_code,
        nav_date DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nav_positions_updated_at
    ON nav.positions (
        updated_at DESC
    );
