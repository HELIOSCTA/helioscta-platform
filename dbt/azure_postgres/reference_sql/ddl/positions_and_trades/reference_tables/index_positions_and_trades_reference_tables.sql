-- Reference-table indexes for positions/trades product matching.
--
-- This file is reference/operator SQL only. It is outside dbt model-paths and
-- should not be run by dbt. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role after
-- table_positions_and_trades_reference_tables.sql.

CREATE INDEX IF NOT EXISTS idx_product_catalog_product_code
    ON positions_and_trades_ref.product_catalog (product_code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_alias_rules_source_pattern
    ON positions_and_trades_ref.product_alias_rules (
        source,
        match_type,
        pattern,
        coalesce(option_type, '')
    );

CREATE INDEX IF NOT EXISTS idx_product_alias_rules_source_priority
    ON positions_and_trades_ref.product_alias_rules (source, source_priority);

CREATE INDEX IF NOT EXISTS idx_product_alias_rules_product_code
    ON positions_and_trades_ref.product_alias_rules (product_code);

CREATE INDEX IF NOT EXISTS idx_account_lookup_source_account
    ON positions_and_trades_ref.account_lookup (source, account);

CREATE UNIQUE INDEX IF NOT EXISTS uq_month_codes_month_code
    ON positions_and_trades_ref.month_codes (month_code);
