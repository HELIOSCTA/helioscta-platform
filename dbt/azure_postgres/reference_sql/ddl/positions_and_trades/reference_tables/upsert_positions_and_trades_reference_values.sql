-- Actual approved lookup values for positions/trades product matching.
--
-- This file is reference/operator SQL only. It is outside dbt model-paths and
-- should not be run by dbt. Read-only dbt credentials cannot run this.
-- Apply it manually with the helios_admin role after
-- table_positions_and_trades_reference_tables.sql.
--
-- Source system: archived 2026_07_21_sql_embedded utility model values.
-- Grain: one approved current runtime row per reference-table business key.
-- Safe rerun: this transaction syncs the live reference tables to the expected
-- rows represented here. Rows removed from this file are removed from
-- positions_and_trades_ref when this file is applied.

BEGIN;

CREATE TEMP TABLE expected_product_catalog (
    product_code TEXT NOT NULL,
    product_family TEXT NOT NULL,
    market_name TEXT NOT NULL,
    underlying_product_code TEXT,
    bbg_exchange_code TEXT,
    default_exchange_name TEXT
) ON COMMIT DROP;

INSERT INTO expected_product_catalog (
    product_code,
    product_family,
    market_name,
    underlying_product_code,
    bbg_exchange_code,
    default_exchange_name
) VALUES
    ('HHD', 'Gas', 'Henry Hub', NULL, NULL, 'IFED'),
    ('NG', 'Gas', 'Henry Hub', NULL, 'NG', 'NYME'),
    ('HH', 'Gas', 'Henry Hub', NULL, 'IW', 'NYME'),
    ('HP', 'Gas', 'Henry Hub', NULL, 'ZA', 'NYME'),
    ('H', 'Gas', 'Henry Hub', NULL, NULL, 'IFED'),
    ('PHH', 'Gas', 'Henry Hub', NULL, NULL, 'IFED'),
    ('PHE', 'Gas', 'Henry Hub', 'NG', 'NG', 'IFED'),
    ('LN', 'Gas', 'Henry Hub', 'NG', 'NG', 'NYME'),
    ('LN1', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),
    ('LN2', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),
    ('LN3', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),
    ('LN4', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),
    ('LN5', 'Gas', 'Henry Hub', 'NG', 'NGW', 'NYME'),
    ('JN1', 'Gas', 'Henry Hub', 'NG', NULL, 'NYME'),
    ('KN2', 'Gas', 'Henry Hub', 'NG', NULL, 'NYME'),
    ('KN3', 'Gas', 'Henry Hub', 'NG', NULL, 'NYME'),
    ('KN4', 'Gas', 'Henry Hub', 'NG', 'HZI', 'NYME'),
    ('G3', 'Gas', 'Henry Hub', 'NG', NULL, 'NYME'),
    ('G4', 'Gas', 'Henry Hub', 'NG', 'IW', 'NYME'),
    ('PDP', 'Power', 'PJM', NULL, NULL, 'IFED'),
    ('PWA', 'Power', 'PJM', NULL, NULL, 'IFED'),
    ('DDP', 'Power', 'PJM', NULL, NULL, 'IFED'),
    ('PDA', 'Power', 'PJM', NULL, NULL, 'IFED'),
    ('PJL', 'Power', 'PJM', NULL, NULL, 'IFED'),
    ('PDO', 'Power', 'PJM', NULL, NULL, 'IFED'),
    ('PMI', 'Power', 'PJM', 'PMI', NULL, 'IFED'),
    ('P1X', 'Power', 'PJM', 'PMI', NULL, 'IFED'),
    ('OPJ', 'Power', 'PJM', NULL, NULL, 'IFED'),
    ('ODP', 'Power', 'PJM', NULL, NULL, 'IFED'),
    ('ERA', 'Power', 'ERCOT', NULL, NULL, 'IFED'),
    ('ERN', 'Power', 'ERCOT', NULL, NULL, 'IFED'),
    ('END', 'Power', 'ERCOT', NULL, NULL, 'IFED'),
    ('ECI', 'Power', 'ERCOT', NULL, NULL, 'IFED'),
    ('NEZ', 'Power', 'NEPOOL', NULL, NULL, 'IFED'),
    ('NEP', 'Power', 'NEPOOL', NULL, NULL, 'IFED'),
    ('SPM', 'Power', 'CAISO', NULL, NULL, 'IFED'),
    ('SDP', 'Power', 'CAISO', NULL, NULL, 'IFED'),
    ('NPM', 'Power', 'CAISO', NULL, NULL, 'IFED'),
    ('MDC', 'Power', 'Mid-C', NULL, NULL, 'IFED'),
    ('AEC', 'Basis', 'AECO', NULL, NULL, 'IFED'),
    ('ALQ', 'Basis', 'Algonquin', NULL, NULL, 'IFED'),
    ('CRI', 'Basis', 'CIG Rockies', NULL, NULL, 'IFED'),
    ('DGD', 'Basis', 'Chicago', NULL, NULL, 'IFED'),
    ('DOM', 'Basis', 'Eastern Gas South', NULL, NULL, 'IFED'),
    ('HXS', 'Basis', 'Houston Ship Channel', NULL, NULL, 'IFED'),
    ('UCS', 'Basis', 'Houston Ship Channel', NULL, NULL, 'IFED'),
    ('NTO', 'Basis', 'NGPL TXOK', NULL, NULL, 'IFED'),
    ('NWR', 'Basis', 'Northwest Rockies', NULL, NULL, 'IFED'),
    ('PGE', 'Basis', 'PG&E Citygate', NULL, NULL, 'IFED'),
    ('TMT', 'Basis', 'Tetco M3', NULL, NULL, 'IFED'),
    ('TRZ', 'Basis', 'Transco Zone 4', NULL, NULL, 'IFED');

CREATE TEMP TABLE expected_account_lookup (
    account_name TEXT NOT NULL,
    account TEXT NOT NULL,
    source TEXT NOT NULL,
    source_label TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_account_lookup (
    account_name,
    account,
    source,
    source_label
) VALUES
    ('ACIM', 'UBE 10051', 'nav', 'NAV Position File'),
    ('ACIM', '51014112.0', 'nav', 'NAV Position File'),
    ('ACIM', '51014112', 'nav', 'NAV Position File'),
    ('ACIM', 'EFD', 'clear_street', 'Clear Street Trades'),
    ('ACIM', '365', 'clear_street', 'Clear Street Trades'),
    ('PNT', 'ABN AMRO_1251PT034', 'nav', 'NAV Position File'),
    ('PNT', 'FCR', 'clear_street', 'Clear Street Trades'),
    ('PNT', '690', 'clear_street', 'Clear Street Trades'),
    ('DICKSON', 'RJO_35511229', 'nav', 'NAV Position File'),
    ('DICKSON', 'RJO', 'clear_street', 'Clear Street Trades'),
    ('DICKSON', '685', 'clear_street', 'Clear Street Trades'),
    ('TITAN', '969 ESKHL', 'nav', 'NAV Position File'),
    ('TITAN', 'ADU', 'clear_street', 'Clear Street Trades'),
    ('TITAN', '905', 'clear_street', 'Clear Street Trades');

CREATE TEMP TABLE expected_month_codes (
    month_number INTEGER NOT NULL,
    month_name TEXT NOT NULL,
    month_code TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_month_codes (
    month_number,
    month_name,
    month_code
) VALUES
    (1, 'Jan', 'F'),
    (2, 'Feb', 'G'),
    (3, 'Mar', 'H'),
    (4, 'Apr', 'J'),
    (5, 'May', 'K'),
    (6, 'Jun', 'M'),
    (7, 'Jul', 'N'),
    (8, 'Aug', 'Q'),
    (9, 'Sep', 'U'),
    (10, 'Oct', 'V'),
    (11, 'Nov', 'X'),
    (12, 'Dec', 'Z');

CREATE TEMP TABLE expected_product_alias_rules (
    source_priority INTEGER NOT NULL,
    source TEXT NOT NULL,
    match_type TEXT NOT NULL,
    pattern TEXT NOT NULL,
    product_code TEXT NOT NULL,
    option_type TEXT,
    marex_product TEXT
) ON COMMIT DROP;

INSERT INTO expected_product_alias_rules (
    source_priority,
    source,
    match_type,
    pattern,
    product_code,
    option_type,
    marex_product
) VALUES
    (1, 'clear_street', 'cusip_prefix', 'IFEDPMI', 'PMI', 'option', NULL),
    (2, 'clear_street', 'cusip_prefix', 'IFEDP1X', 'P1X', 'option', NULL),
    (1, 'nav', 'regex', '^ICE NGAS HH SWG DLY DAY-[0-9]+$', 'HHD', NULL, 'HENRY SWING'),
    (2, 'nav', 'exact', 'ICE NGAS HH SWING DAILY', 'HHD', NULL, 'HENRY SWING'),
    (3, 'nav', 'exact', 'NATURAL GAS', 'NG', NULL, 'NAT GAS'),
    (4, 'nav', 'exact', 'GLOBEX NATURAL GAS LD', 'HH', NULL, 'NAT GAS LAST DAY FINAN'),
    (5, 'nav', 'exact', 'NYMEX HENRY HUB FINANCIAL LDO', 'HH', NULL, 'NAT GAS LAST DAY FINAN'),
    (6, 'nav', 'exact', 'NYMEX HENRY HUB NATURAL GAS', 'HP', NULL, 'HENRY HUB FINANCIAL'),
    (7, 'nav', 'exact', 'HENRY PENULTIMATE NATURAL GAS', 'HP', NULL, 'HENRY HUB FINANCIAL'),
    (8, 'nav', 'exact', 'NATURAL GAS LD1 FUTURE', 'H', NULL, 'HENRY LD1 FIXED'),
    (9, 'nav', 'exact', 'HENRY HUB NATURAL GAS', 'H', NULL, 'HENRY LD1 FIXED'),
    (10, 'nav', 'exact', 'ICE PHH', 'PHH', NULL, 'HENRY PENULT FIXED'),
    (11, 'nav', 'exact', 'ICE PHE', 'PHE', 'option', 'HENRY PENULT FIXED'),
    (12, 'nav', 'exact', 'ICE HH EQ', 'PHE', 'option', 'HENRY PENULT FIXED'),
    (13, 'nav', 'exact', 'ICE NGAS PEN HENRY HUB', 'PHE', 'option', 'HENRY PENULT FIXED'),
    (14, 'nav', 'exact', 'NYM EUR NATURAL GAS', 'LN', 'option', 'EUR NAT GAS'),
    (15, 'nav', 'exact', 'NATURAL GAS CLEARPORT', 'LN', 'option', 'EUR NAT GAS'),
    (16, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 1', 'LN1', 'option', 'NAT GAS FIN WKLY WK1'),
    (17, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 2', 'LN2', 'option', 'NAT GAS FIN WKLY WK2'),
    (18, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 3', 'LN3', 'option', 'NAT GAS FIN WKLY WK3'),
    (19, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 4', 'LN4', 'option', 'NAT GAS FIN WKLY WK4'),
    (20, 'nav', 'exact', 'NATURAL GAS FINANCIAL WEEK 5', 'LN5', 'option', 'NAT GAS FIN WKLY WK5'),
    (21, 'nav', 'exact', 'NATURAL GAS 3M CSO', 'G3', 'option', 'NAT GAS CAL SPRD FIN 3MO'),
    (22, 'nav', 'exact', 'NATURAL GAS FINANCIAL 1M SO', 'G4', 'option', 'NAT GAS FINAN 1 MNTH SPRD'),
    (23, 'nav', 'exact', 'NATURAL GAS 1M CSO', 'G4', 'option', 'NAT GAS FINAN 1 MNTH SPRD'),
    (24, 'nav', 'exact', 'ICE PJM WH RTD', 'PDP', NULL, 'PJM WH REAL T PEAK DAILY'),
    (25, 'nav', 'exact', 'ICE PWA', 'PWA', NULL, 'PJM W HUB RT PEAK DAILY'),
    (26, 'nav', 'exact', 'ICE PJMWHPKDAY', 'PDA', NULL, 'PJM WEST DAY AHEAD PK DA'),
    (27, 'nav', 'exact', 'ICE PJL', 'PJL', NULL, 'PJM WST HUB D APDM FP FU'),
    (28, 'nav', 'exact', 'ICE PDA', 'PDA', NULL, 'PJM WEST DAY AHEAD PK DA'),
    (29, 'nav', 'exact', 'ICE PJL DAILY', 'PJL', NULL, 'PJM WST HUB D APDM FP FU'),
    (30, 'nav', 'regex', '^ICE (PJM MINI|MINIPJMRT|PJM WHREAL TYM PK MINI)([-_][0-9]+)?$', 'PMI', NULL, 'PJM WST HUB REAL PEAK FIXED'),
    (31, 'nav', 'exact', 'ICE PJM WHRT PEAK OPT_4096', 'P1X', 'option', 'PJM WEST HUB RT'),
    (32, 'nav', 'regex', '^ICE PJM OFF PK[-_][0-9]+$', 'OPJ', NULL, 'PJM WST HUB REAL OFF PEAK FIXED'),
    (33, 'nav', 'exact', 'ICE ERA', 'ERA', NULL, 'EMINI ERCOT 345RT PK DAILY'),
    (34, 'nav', 'exact', 'ERCOT N 345 KV RT PEAK DLY', 'ERN', NULL, 'ERCOT NORTH PEAK FIXED'),
    (35, 'nav', 'exact', 'ICE END', 'END', NULL, NULL),
    (36, 'nav', 'regex', '^ICE ERCOT NORTH 345KV 7X8[-_][0-9]+$', 'ECI', NULL, 'ERCT NORTH 345KVRT 7x8 FXD'),
    (37, 'nav', 'regex', '^(ISO ENG MASS HUB D-PK-[0-9]+|ICE NEPOOL PK MNTH-[0-9]+)$', 'NEP', NULL, 'ISO MASS HUB PEAK FIXED'),
    (38, 'nav', 'regex', '^ICE SP 15 PEAK([_-][0-9]+)?$', 'SPM', NULL, 'CAISO SP15 PEAK FIXED'),
    (39, 'nav', 'regex', '^ICE NP 15 PEAK([_-][0-9]+)?$', 'NPM', NULL, 'CAISO NP15 PEAK FIXED'),
    (40, 'nav', 'regex', '^ICE MID-C PEAK([_-][0-9]+)?$', 'MDC', NULL, 'MID C FIN PEAK ELEC'),
    (41, 'nav', 'exact', 'AB NIT BASIS FUTURE', 'AEC', NULL, 'AB NIT BASIS'),
    (42, 'nav', 'exact', 'ICE ALQCTYGTSW', 'ALQ', NULL, 'ALGONQUIN CITYGATES BASIS'),
    (43, 'nav', 'exact', 'ICE CIG ROCKIES BASIS', 'CRI', NULL, 'CIG ROCKIES BASIS'),
    (44, 'nav', 'exact', 'ICE CHICAGO BASIS FUT', 'DGD', NULL, 'CHICAGO BASIS'),
    (45, 'nav', 'exact', 'ICE EASTERN GAS SOUTH BASIS FU', 'DOM', NULL, 'DOMINION SOUTH BASIS'),
    (46, 'nav', 'exact', 'ICE HSC BASIS', 'HXS', NULL, 'HSC BASIS'),
    (47, 'nav', 'exact', 'NGPL TXOK BASIS FUTURE', 'NTO', NULL, 'NGPL TXOK BASIS'),
    (48, 'nav', 'exact', 'ICE NGAS NYM NWP RK', 'NWR', NULL, 'NAT GAS B/S FERC;ROCKIES'),
    (49, 'nav', 'exact', 'ICE NGAS NYM PG&E', 'PGE', NULL, 'PG&E CITYGATE BASIS'),
    (50, 'nav', 'exact', 'ICE TETCO SWP', 'TMT', NULL, 'TETCO M3 BASIS'),
    (51, 'nav', 'exact', 'ICE TRANSCO STATION 85 ZONE 4', 'TRZ', NULL, 'TRANSCO 85 Z4 BASIS'),
    (52, 'nav', 'exact', 'ICE TCOZN4BASI', 'TRZ', NULL, 'TRANSCO 85 Z4 BASIS'),
    (53, 'nav', 'exact', 'ICE SDP', 'SDP', NULL, NULL);

INSERT INTO positions_and_trades_ref.product_catalog AS target (
    product_code,
    product_family,
    market_name,
    underlying_product_code,
    bbg_exchange_code,
    default_exchange_name
)
SELECT
    product_code,
    product_family,
    market_name,
    underlying_product_code,
    bbg_exchange_code,
    default_exchange_name
FROM expected_product_catalog
ON CONFLICT (product_code) DO UPDATE SET
    product_family = EXCLUDED.product_family,
    market_name = EXCLUDED.market_name,
    underlying_product_code = EXCLUDED.underlying_product_code,
    bbg_exchange_code = EXCLUDED.bbg_exchange_code,
    default_exchange_name = EXCLUDED.default_exchange_name,
    updated_at = now(),
    updated_by = CURRENT_USER
WHERE target.product_family IS DISTINCT FROM EXCLUDED.product_family
    OR target.market_name IS DISTINCT FROM EXCLUDED.market_name
    OR target.underlying_product_code IS DISTINCT FROM EXCLUDED.underlying_product_code
    OR target.bbg_exchange_code IS DISTINCT FROM EXCLUDED.bbg_exchange_code
    OR target.default_exchange_name IS DISTINCT FROM EXCLUDED.default_exchange_name;

INSERT INTO positions_and_trades_ref.account_lookup AS target (
    account_name,
    account,
    source,
    source_label
)
SELECT
    account_name,
    account,
    source,
    source_label
FROM expected_account_lookup
ON CONFLICT (source, account) DO UPDATE SET
    account_name = EXCLUDED.account_name,
    source_label = EXCLUDED.source_label,
    updated_at = now(),
    updated_by = CURRENT_USER
WHERE target.account_name IS DISTINCT FROM EXCLUDED.account_name
    OR target.source_label IS DISTINCT FROM EXCLUDED.source_label;

DELETE FROM positions_and_trades_ref.account_lookup AS target
WHERE NOT EXISTS (
    SELECT 1
    FROM expected_account_lookup AS expected
    WHERE expected.source = target.source
        AND expected.account = target.account
);

INSERT INTO positions_and_trades_ref.month_codes AS target (
    month_number,
    month_name,
    month_code
)
SELECT
    month_number,
    month_name,
    month_code
FROM expected_month_codes
ON CONFLICT (month_number) DO UPDATE SET
    month_name = EXCLUDED.month_name,
    month_code = EXCLUDED.month_code,
    updated_at = now(),
    updated_by = CURRENT_USER
WHERE target.month_name IS DISTINCT FROM EXCLUDED.month_name
    OR target.month_code IS DISTINCT FROM EXCLUDED.month_code;

DELETE FROM positions_and_trades_ref.month_codes AS target
WHERE NOT EXISTS (
    SELECT 1
    FROM expected_month_codes AS expected
    WHERE expected.month_number = target.month_number
);

DELETE FROM positions_and_trades_ref.product_alias_rules AS target
WHERE NOT EXISTS (
    SELECT 1
    FROM expected_product_alias_rules AS expected
    WHERE expected.source = target.source
        AND expected.source_priority = target.source_priority
);

INSERT INTO positions_and_trades_ref.product_alias_rules AS target (
    source_priority,
    source,
    match_type,
    pattern,
    product_code,
    option_type,
    marex_product
)
SELECT
    source_priority,
    source,
    match_type,
    pattern,
    product_code,
    option_type,
    marex_product
FROM expected_product_alias_rules
ON CONFLICT (source, source_priority) DO UPDATE SET
    match_type = EXCLUDED.match_type,
    pattern = EXCLUDED.pattern,
    product_code = EXCLUDED.product_code,
    option_type = EXCLUDED.option_type,
    marex_product = EXCLUDED.marex_product,
    updated_at = now(),
    updated_by = CURRENT_USER
WHERE target.match_type IS DISTINCT FROM EXCLUDED.match_type
    OR target.pattern IS DISTINCT FROM EXCLUDED.pattern
    OR target.product_code IS DISTINCT FROM EXCLUDED.product_code
    OR target.option_type IS DISTINCT FROM EXCLUDED.option_type
    OR target.marex_product IS DISTINCT FROM EXCLUDED.marex_product;

DELETE FROM positions_and_trades_ref.product_catalog AS target
WHERE NOT EXISTS (
    SELECT 1
    FROM expected_product_catalog AS expected
    WHERE expected.product_code = target.product_code
);

COMMIT;
