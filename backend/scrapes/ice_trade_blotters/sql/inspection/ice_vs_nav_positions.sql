-- Read-only first-pass ICE trade blotter vs latest NAV position comparison.
--
-- Source contracts:
--   ICE: ice_trade_blotter.ice_trade_blotter raw rows, one row per deal leg.
--   NAV: nav.positions raw rows, latest sftp upload for latest nav_date by fund.
-- Grain inspected: account/fund x product hint x contract/month x option/strike.
-- Notes: this query surfaces review candidates. It does not persist matching
-- decisions or mutate source tables.

WITH latest_nav_dates AS (
    SELECT
        fund_code,
        MAX(nav_date) AS nav_date
    FROM nav.positions
    GROUP BY fund_code
),
latest_nav_uploads AS (
    SELECT
        positions.fund_code,
        positions.nav_date,
        MAX(positions.sftp_upload_timestamp) AS sftp_upload_timestamp
    FROM nav.positions AS positions
    INNER JOIN latest_nav_dates
        ON latest_nav_dates.fund_code = positions.fund_code
       AND latest_nav_dates.nav_date = positions.nav_date
    GROUP BY positions.fund_code, positions.nav_date
),
nav_latest AS (
    SELECT
        positions.fund_code,
        positions.nav_date,
        upper(trim(coalesce(positions.account, ''))) AS nav_account,
        upper(trim(coalesce(positions.product, ''))) AS nav_product,
        upper(trim(coalesce(positions.client_symbol, ''))) AS nav_client_symbol,
        upper(trim(coalesce(positions.month_year, ''))) AS nav_month_year,
        upper(trim(coalesce(positions.long_short, ''))) AS nav_long_short,
        upper(trim(coalesce(positions.call_put, ''))) AS nav_call_put,
        round(coalesce(positions.strike_price, 0)::numeric, 8) AS nav_strike,
        SUM(coalesce(positions.quantity_1, 0)) AS nav_quantity,
        COUNT(*) AS nav_rows
    FROM nav.positions AS positions
    INNER JOIN latest_nav_uploads AS latest
        ON latest.fund_code = positions.fund_code
       AND latest.nav_date = positions.nav_date
       AND latest.sftp_upload_timestamp = positions.sftp_upload_timestamp
    GROUP BY
        positions.fund_code,
        positions.nav_date,
        nav_account,
        nav_product,
        nav_client_symbol,
        nav_month_year,
        nav_long_short,
        nav_call_put,
        nav_strike
),
ice_latest_files AS (
    SELECT file_hash
    FROM ice_trade_blotter.file_manifest
    WHERE status = 'managed'
      AND is_loaded
),
ice_trades AS (
    SELECT
        upper(trim(coalesce(clearing_acct, cust_acct, ''))) AS ice_account,
        upper(trim(coalesce(product, ''))) AS ice_product,
        upper(trim(coalesce(contract, ''))) AS ice_contract,
        upper(trim(coalesce(strip, ''))) AS ice_strip,
        CASE
            WHEN upper(trim(b_s)) IN ('B', 'BUY', 'BOUGHT') THEN 'LONG'
            WHEN upper(trim(b_s)) IN ('S', 'SELL', 'SOLD') THEN 'SHORT'
            ELSE upper(trim(b_s))
        END AS ice_long_short,
        upper(trim(coalesce(option, ''))) AS ice_option,
        round(coalesce(strike, 0)::numeric, 8) AS ice_strike,
        SUM(coalesce(total_quantity, 0)) AS ice_quantity,
        SUM(coalesce(lots, 0)) AS ice_lots,
        COUNT(*) AS ice_rows,
        MIN(trade_date) AS first_trade_date,
        MAX(trade_date) AS last_trade_date
    FROM ice_trade_blotter.ice_trade_blotter
    WHERE file_hash IN (SELECT file_hash FROM ice_latest_files)
    GROUP BY
        ice_account,
        ice_product,
        ice_contract,
        ice_strip,
        ice_long_short,
        ice_option,
        ice_strike
),
paired AS (
    SELECT
        nav.fund_code,
        nav.nav_date,
        coalesce(nav.nav_account, ice.ice_account) AS account_hint,
        nav.nav_product,
        nav.nav_client_symbol,
        nav.nav_month_year,
        ice.ice_product,
        ice.ice_contract,
        ice.ice_strip,
        coalesce(nav.nav_long_short, ice.ice_long_short) AS long_short,
        nav.nav_call_put,
        ice.ice_option,
        coalesce(nav.nav_strike, ice.ice_strike) AS strike,
        nav.nav_quantity,
        ice.ice_quantity,
        ice.ice_lots,
        nav.nav_rows,
        ice.ice_rows,
        ice.first_trade_date,
        ice.last_trade_date,
        CASE
            WHEN nav.fund_code IS NULL THEN 'missing_in_nav_latest'
            WHEN ice.ice_product IS NULL THEN 'missing_in_ice_latest'
            WHEN abs(coalesce(nav.nav_quantity, 0) - coalesce(ice.ice_quantity, 0)) > 0.000001
                THEN 'quantity_mismatch'
            ELSE 'matched_by_review_key'
        END AS review_status
    FROM nav_latest AS nav
    FULL OUTER JOIN ice_trades AS ice
        ON ice.ice_account = nav.nav_account
       AND ice.ice_long_short = nav.nav_long_short
       AND ice.ice_strike = nav.nav_strike
       AND (
            (
                nav.nav_client_symbol <> ''
                AND ice.ice_contract <> ''
                AND ice.ice_contract LIKE '%' || nav.nav_client_symbol || '%'
            )
            OR (
                ice.ice_product <> ''
                AND nav.nav_product <> ''
                AND nav.nav_product LIKE '%' || ice.ice_product || '%'
            )
       )
),
FINAL AS (
    SELECT *
    FROM paired
)
SELECT *
FROM FINAL
ORDER BY nav_date DESC NULLS LAST, review_status, account_hint, nav_product, ice_product;
