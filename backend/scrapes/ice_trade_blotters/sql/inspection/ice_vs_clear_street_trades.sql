-- Read-only first-pass ICE trade blotter vs Clear Street EOD trade comparison.
--
-- Source contracts:
--   ICE: ice_trade_blotter.ice_trade_blotter raw rows, one row per deal leg.
--   Clear Street: clear_street.eod_transactions raw rows, one row per EOD trade row.
-- Grain inspected: trade_date x normalized_side x product_hint x contract_month.
-- Notes: product keys are intentionally conservative hints. Review unmatched
-- rows before promoting any downstream matching rules.

WITH ice_latest_files AS (
    SELECT file_hash
    FROM ice_trade_blotter.file_manifest
    WHERE status = 'managed'
      AND is_loaded
),
ice_trades AS (
    SELECT
        trade_date,
        CASE
            WHEN upper(trim(b_s)) IN ('B', 'BUY', 'BOUGHT') THEN 'BUY'
            WHEN upper(trim(b_s)) IN ('S', 'SELL', 'SOLD') THEN 'SELL'
            ELSE upper(trim(b_s))
        END AS normalized_side,
        upper(trim(coalesce(product, ''))) AS ice_product,
        upper(trim(coalesce(hub, ''))) AS ice_hub,
        upper(trim(coalesce(contract, ''))) AS ice_contract,
        upper(trim(coalesce(strip, ''))) AS ice_strip,
        round(price::numeric, 8) AS trade_price,
        SUM(total_quantity) AS ice_total_quantity,
        SUM(lots) AS ice_lots,
        COUNT(*) AS ice_rows,
        COUNT(DISTINCT deal_id) AS ice_deals
    FROM ice_trade_blotter.ice_trade_blotter
    WHERE file_hash IN (SELECT file_hash FROM ice_latest_files)
    GROUP BY
        trade_date,
        normalized_side,
        ice_product,
        ice_hub,
        ice_contract,
        ice_strip,
        trade_price
),
clear_street_latest_uploads AS (
    SELECT
        trade_date_from_sftp,
        MAX(sftp_upload_timestamp) AS sftp_upload_timestamp
    FROM clear_street.eod_transactions
    GROUP BY trade_date_from_sftp
),
clear_street_scoped AS (
    SELECT
        to_date(transactions.trade_date_from_sftp, 'YYYYMMDD') AS trade_date,
        CASE
            WHEN upper(trim(transactions.buy_sell)) IN ('B', 'BUY') THEN 'BUY'
            WHEN upper(trim(transactions.buy_sell)) IN ('S', 'SELL') THEN 'SELL'
            ELSE upper(trim(transactions.buy_sell))
        END AS normalized_side,
        upper(trim(coalesce(transactions.exch_comm_cd, ''))) AS clear_exchange_code,
        upper(trim(coalesce(transactions.futures_code, ''))) AS clear_futures_code,
        NULLIF(transactions.contract_year_month::text, '') AS clear_contract_month,
        round(transactions.trade_price::numeric, 8) AS trade_price,
        transactions.quantity
    FROM clear_street.eod_transactions AS transactions
    INNER JOIN clear_street_latest_uploads AS latest
        ON latest.trade_date_from_sftp = transactions.trade_date_from_sftp
       AND latest.sftp_upload_timestamp = transactions.sftp_upload_timestamp
),
clear_street_trades AS (
    SELECT
        trade_date,
        normalized_side,
        clear_exchange_code,
        clear_futures_code,
        clear_contract_month,
        trade_price,
        SUM(transactions.quantity) AS clear_quantity,
        COUNT(*) AS clear_rows
    FROM clear_street_scoped AS transactions
    GROUP BY
        trade_date,
        normalized_side,
        clear_exchange_code,
        clear_futures_code,
        clear_contract_month,
        trade_price
),
paired AS (
    SELECT
        coalesce(ice.trade_date, clear_street.trade_date) AS trade_date,
        coalesce(ice.normalized_side, clear_street.normalized_side) AS normalized_side,
        ice.ice_product,
        ice.ice_hub,
        ice.ice_contract,
        ice.ice_strip,
        clear_street.clear_exchange_code,
        clear_street.clear_futures_code,
        clear_street.clear_contract_month,
        coalesce(ice.trade_price, clear_street.trade_price) AS trade_price,
        ice.ice_total_quantity,
        clear_street.clear_quantity,
        ice.ice_lots,
        ice.ice_rows,
        clear_street.clear_rows,
        ice.ice_deals,
        CASE
            WHEN ice.trade_date IS NULL THEN 'missing_in_ice'
            WHEN clear_street.trade_date IS NULL THEN 'missing_in_clear_street'
            WHEN abs(coalesce(ice.ice_total_quantity, 0) - coalesce(clear_street.clear_quantity, 0)) > 0.000001
                THEN 'quantity_mismatch'
            ELSE 'matched_by_review_key'
        END AS review_status
    FROM ice_trades AS ice
    FULL OUTER JOIN clear_street_trades AS clear_street
        ON clear_street.trade_date = ice.trade_date
       AND clear_street.normalized_side = ice.normalized_side
       AND clear_street.trade_price = ice.trade_price
       AND (
            clear_street.clear_futures_code <> ''
            AND ice.ice_contract LIKE '%' || clear_street.clear_futures_code || '%'
       )
),
FINAL AS (
    SELECT *
    FROM paired
)
SELECT *
FROM FINAL
ORDER BY trade_date DESC, review_status, normalized_side, ice_product, clear_futures_code;
