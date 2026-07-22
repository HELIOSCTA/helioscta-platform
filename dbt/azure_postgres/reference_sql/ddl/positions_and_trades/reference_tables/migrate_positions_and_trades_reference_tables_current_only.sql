-- One-time migration from active-window lookup tables to current-only lookup
-- tables for positions/trades product matching. This also updates the
-- product-alias match-type contract for Clear Street CUSIP-prefix rules.
--
-- This file is reference/operator SQL only. It is outside dbt model-paths and
-- should not be run by dbt. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role if the reference tables were
-- created with is_active, valid_from, valid_to, and change_reason columns.

BEGIN;

DROP INDEX IF EXISTS positions_and_trades_ref.idx_product_catalog_active_current;
DROP INDEX IF EXISTS positions_and_trades_ref.uq_product_alias_rules_source_pattern_current;
DROP INDEX IF EXISTS positions_and_trades_ref.idx_product_alias_rules_active_priority;
DROP INDEX IF EXISTS positions_and_trades_ref.idx_account_lookup_active_source_account;
DROP INDEX IF EXISTS positions_and_trades_ref.uq_month_codes_month_code_current;

ALTER TABLE positions_and_trades_ref.product_catalog
    DROP CONSTRAINT IF EXISTS product_catalog_valid_window_ck,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS valid_from,
    DROP COLUMN IF EXISTS valid_to,
    DROP COLUMN IF EXISTS change_reason;

ALTER TABLE positions_and_trades_ref.product_alias_rules
    DROP CONSTRAINT IF EXISTS product_alias_rules_valid_window_ck,
    DROP CONSTRAINT IF EXISTS product_alias_rules_match_type_ck,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS valid_from,
    DROP COLUMN IF EXISTS valid_to,
    DROP COLUMN IF EXISTS change_reason;

ALTER TABLE positions_and_trades_ref.product_alias_rules
    ADD CONSTRAINT product_alias_rules_match_type_ck
        CHECK (match_type IN ('exact', 'regex', 'cusip_prefix'));

ALTER TABLE positions_and_trades_ref.account_lookup
    DROP CONSTRAINT IF EXISTS account_lookup_valid_window_ck,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS valid_from,
    DROP COLUMN IF EXISTS valid_to,
    DROP COLUMN IF EXISTS change_reason;

ALTER TABLE positions_and_trades_ref.month_codes
    DROP CONSTRAINT IF EXISTS month_codes_valid_window_ck,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS valid_from,
    DROP COLUMN IF EXISTS valid_to,
    DROP COLUMN IF EXISTS change_reason;

COMMIT;
