-- Source-table indexes for nav.positions.
--
-- This file is disabled as a dbt model in dbt_project.yml. It is retained as
-- operator reference SQL only. Read-only dbt credentials cannot run this.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nav_positions_updated_at
    ON nav.positions (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nav_positions_fund_nav_date
    ON nav.positions (fund_code, nav_date DESC, sftp_upload_timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nav_positions_account_trade_date
    ON nav.positions (account_group, account, trade_date DESC);
