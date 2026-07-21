{{
  config(
    materialized='ephemeral'
  )
}}

-------------------------------------------------------------
-------------------------------------------------------------

WITH NAV AS (
    SELECT

        sftp_date
        ,sftp_upload_timestamp
        ,nav_reference_number
        ,account
        ,exchange_name
        -- ,exchange_code  -- TODO: we override this in the NAV_EXCHANGE_CODE CTE
        ,is_option
        ,put_call_long
        ,put_call
        ,strike_price
        ,contract_yyyymm
        ,contract_yyyymmdd
        ,contract_year
        ,contract_month
        ,contract_day
        ,trade_date
        ,last_trade_date
        ,nav_product
        ,buy_sell
        ,qty
        ,lots
        ,settlement_price
        ,trade_price
        ,market_value

    FROM {{ ref('staging_v6_nav_positions_1_combined') }}
),

-- SELECT * FROM NAV
-- ORDER BY sftp_date desc, contract_yyyymm, account

-------------------------------------------------------------
-- PRODUCT_LOOKUP_TABLE
-------------------------------------------------------------

PRODUCT_LOOKUP_TABLE AS (
    SELECT distinct

        -- bbg_exchange_code
        exchange_code
        ,exchange_code_underlying
        ,exchange_code_grouping
        ,exchange_code_region
        ,nav_product
        ,marex_product

    FROM {{ ref('utils_v1_positions_and_trades_product_lookup') }}
),

-- SELECT * FROM PRODUCT_LOOKUP_TABLE

NAV_EXCHANGE_CODE AS (
    select

        nav.*
        -- exchange_code
        ,(CASE
            WHEN nav.nav_product = 'ICE PHH' AND nav.is_option = TRUE::BOOLEAN THEN 'PHE'
            ELSE lookup.exchange_code::VARCHAR
        END) as exchange_code
        -- exchange_code
        ,lookup.marex_product::VARCHAR as marex_product

    from NAV nav
    LEFT JOIN PRODUCT_LOOKUP_TABLE lookup ON nav.nav_product = lookup.nav_product
),

-- SELECT * FROM NAV_EXCHANGE_CODE

-------------------------------------------------------------
-- MAREX DESCRIPTION
-------------------------------------------------------------

NAV_DESCRIPTION AS (
    SELECT

        nav.*
        -- marex_description
        ,(CASE

            -- OPTIONS
            WHEN is_option = True THEN
                TRIM(CONCAT(
                    put_call_long, ' ',
                    TO_CHAR(TO_DATE(contract_yyyymm, 'YYYYMM'), 'MON YY'), ' ',
                    exchange_name, ' ',
                    marex_product, ' ',
                    TO_CHAR(strike_price::NUMERIC, 'FM999990.00'), ' '
                ))

            -- SHORT TERM
            WHEN contract_day IS NOT NULL THEN
                TRIM(CONCAT(
                    TO_CHAR(contract_yyyymmdd::DATE, 'DD MON YY'), ' ',
                    exchange_name, ' ',
                    marex_product, ' '
                ))

            -- OTHER
            WHEN contract_day IS NULL AND is_option = False THEN
                TRIM(CONCAT(
                    TO_CHAR(TO_DATE(contract_yyyymm, 'YYYYMM'), 'MON YY'), ' ',
                    exchange_name, ' ',
                    marex_product, ' '
                ))

            ELSE NULL
        END) AS marex_description

    from NAV_EXCHANGE_CODE nav
),

-- SELECT * FROM NAV_DESCRIPTION
-- ORDER BY sftp_date desc

-------------------------------------------------------------
-- DUPLICATES
-------------------------------------------------------------

DUPLICATES AS (
    SELECT
        *
        ,ROW_NUMBER() OVER (
            PARTITION BY sftp_date, nav_reference_number, account, exchange_code, contract_yyyymm, buy_sell
            ORDER BY sftp_upload_timestamp DESC
        ) AS nav_row_number

    FROM NAV_DESCRIPTION
),

FINAL AS (
    SELECT * FROM DUPLICATES
)

SELECT * FROM FINAL

ORDER BY sftp_date desc
