-- Reference-table DDL for positions/trades product matching.
--
-- This file is reference/operator SQL only. It is outside dbt model-paths and
-- should not be run by dbt. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role before running
-- the active positions/trades ref-table dbt tests against Azure Postgres.
--
-- Source system: manually reviewed positions/trades product matching changes.
-- Grain: one current approved runtime row per table-specific business key.
-- Safe rerun: CREATE IF NOT EXISTS statements are idempotent; current lookup
-- values are maintained by the transactional values sync script. dbt and
-- backend automation do not write these tables.

CREATE SCHEMA IF NOT EXISTS positions_and_trades_ref AUTHORIZATION helios_admin;

CREATE TABLE IF NOT EXISTS positions_and_trades_ref.product_catalog (
    product_code TEXT NOT NULL,
    product_family TEXT NOT NULL,
    market_name TEXT NOT NULL,
    underlying_product_code TEXT,
    bbg_exchange_code TEXT,
    default_exchange_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL DEFAULT CURRENT_USER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT NOT NULL DEFAULT CURRENT_USER,
    PRIMARY KEY (product_code),
    CONSTRAINT product_catalog_product_code_upper_ck
        CHECK (product_code = upper(product_code)),
    CONSTRAINT product_catalog_product_family_ck
        CHECK (product_family IN ('Gas', 'Power', 'Basis'))
);

CREATE TABLE IF NOT EXISTS positions_and_trades_ref.product_alias_rules (
    source TEXT NOT NULL,
    source_priority INTEGER NOT NULL,
    match_type TEXT NOT NULL,
    pattern TEXT NOT NULL,
    product_code TEXT NOT NULL,
    option_type TEXT,
    marex_product TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL DEFAULT CURRENT_USER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT NOT NULL DEFAULT CURRENT_USER,
    PRIMARY KEY (source, source_priority),
    CONSTRAINT product_alias_rules_source_ck
        CHECK (source IN ('nav', 'clear_street')),
    CONSTRAINT product_alias_rules_source_priority_ck
        CHECK (source_priority > 0),
    CONSTRAINT product_alias_rules_match_type_ck
        CHECK (match_type IN ('exact', 'regex', 'cusip_prefix')),
    CONSTRAINT product_alias_rules_option_type_ck
        CHECK (option_type IS NULL OR option_type IN ('future', 'option')),
    CONSTRAINT product_alias_rules_pattern_not_blank_ck
        CHECK (length(trim(pattern)) > 0),
    CONSTRAINT product_alias_rules_product_catalog_fk
        FOREIGN KEY (product_code)
        REFERENCES positions_and_trades_ref.product_catalog (product_code)
);

CREATE TABLE IF NOT EXISTS positions_and_trades_ref.account_lookup (
    source TEXT NOT NULL,
    account TEXT NOT NULL,
    account_name TEXT NOT NULL,
    source_label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL DEFAULT CURRENT_USER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT NOT NULL DEFAULT CURRENT_USER,
    PRIMARY KEY (source, account),
    CONSTRAINT account_lookup_source_ck
        CHECK (source IN ('nav', 'clear_street')),
    CONSTRAINT account_lookup_account_not_blank_ck
        CHECK (length(trim(account)) > 0),
    CONSTRAINT account_lookup_account_name_not_blank_ck
        CHECK (length(trim(account_name)) > 0)
);

CREATE TABLE IF NOT EXISTS positions_and_trades_ref.month_codes (
    month_number INTEGER NOT NULL,
    month_name TEXT NOT NULL,
    month_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT NOT NULL DEFAULT CURRENT_USER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT NOT NULL DEFAULT CURRENT_USER,
    PRIMARY KEY (month_number),
    CONSTRAINT month_codes_month_number_ck
        CHECK (month_number BETWEEN 1 AND 12),
    CONSTRAINT month_codes_month_code_ck
        CHECK (month_code ~ '^[FGHJKMNQUVXZ]$'),
    CONSTRAINT month_codes_month_name_not_blank_ck
        CHECK (length(trim(month_name)) > 0)
);

GRANT USAGE ON SCHEMA positions_and_trades_ref TO helios_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA positions_and_trades_ref TO helios_readonly;
