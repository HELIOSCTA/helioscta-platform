-- Read-only validation checks for positions/trades reference lookup tables.
--
-- These queries should return zero rows except the final row-count summary.
-- They are useful after applying DDL or manually reviewing lookup changes.

WITH duplicate_alias_priorities AS (
    SELECT
        source,
        source_priority,
        count(*) AS row_count
    FROM positions_and_trades_ref.product_alias_rules
    GROUP BY source, source_priority
    HAVING count(*) > 1
)
SELECT *
FROM duplicate_alias_priorities;

WITH duplicate_accounts AS (
    SELECT
        source,
        account,
        count(*) AS row_count
    FROM positions_and_trades_ref.account_lookup
    GROUP BY source, account
    HAVING count(*) > 1
)
SELECT *
FROM duplicate_accounts;

WITH aliases_without_catalog_rows AS (
    SELECT
        product_alias_rules.source,
        product_alias_rules.source_priority,
        product_alias_rules.pattern,
        product_alias_rules.product_code
    FROM positions_and_trades_ref.product_alias_rules
    LEFT JOIN positions_and_trades_ref.product_catalog
        ON product_alias_rules.product_code = product_catalog.product_code
    WHERE product_catalog.product_code IS NULL
)
SELECT *
FROM aliases_without_catalog_rows;

WITH missing_month_codes AS (
    SELECT month_number
    FROM generate_series(1, 12) AS expected_months(month_number)
    EXCEPT
    SELECT month_number
    FROM positions_and_trades_ref.month_codes
)
SELECT *
FROM missing_month_codes;

SELECT
    'product_catalog' AS table_name,
    count(*) AS current_row_count
FROM positions_and_trades_ref.product_catalog
UNION ALL
SELECT
    'product_alias_rules' AS table_name,
    count(*) AS current_row_count
FROM positions_and_trades_ref.product_alias_rules
UNION ALL
SELECT
    'account_lookup' AS table_name,
    count(*) AS current_row_count
FROM positions_and_trades_ref.account_lookup
UNION ALL
SELECT
    'month_codes' AS table_name,
    count(*) AS current_row_count
FROM positions_and_trades_ref.month_codes
