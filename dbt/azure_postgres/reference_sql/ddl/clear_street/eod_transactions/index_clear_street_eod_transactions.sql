-- Source-table indexes for clear_street.eod_transactions.
--
-- This file is reference/operator SQL only. It is outside dbt model-paths and
-- should not be run by dbt. If an operator applies it, use a write-capable
-- role in a SQL editor with autocommit enabled. Do not wrap CREATE INDEX
-- CONCURRENTLY in BEGIN/COMMIT.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clear_street_eod_txn_latest_file
    ON clear_street.eod_transactions (
        trade_date_from_sftp DESC,
        sftp_upload_timestamp DESC
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clear_street_eod_txn_mufg_extract
    ON clear_street.eod_transactions (
        give_in_out_firm_num,
        trade_date_from_sftp DESC,
        sftp_upload_timestamp DESC
    )
    INCLUDE (
        account_number,
        exch_comm_cd,
        futures_code,
        security_description,
        instrument_description,
        contract_year_month,
        prompt_day,
        put_call,
        strike_price,
        quantity,
        trade_price,
        settlement_price
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clear_street_eod_txn_product_lookup
    ON clear_street.eod_transactions (
        exch_comm_cd,
        futures_code,
        contract_year_month,
        prompt_day
    );

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clear_street_eod_txn_updated_at
    ON clear_street.eod_transactions (
        updated_at DESC
    );
