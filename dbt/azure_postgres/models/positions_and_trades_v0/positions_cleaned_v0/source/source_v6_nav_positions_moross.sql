{{
  config(
    materialized='ephemeral'
  )
}}

-------------------------------------------------------------
-------------------------------------------------------------

WITH NAV_MOROSS_POSITIONS as (
    SELECT

        -- DATES
        nav_date::DATE as sftp_date
        ,sftp_upload_timestamp::TIMESTAMP as sftp_upload_timestamp

        -- REFERENCE NUMBER
        ,product_id_internal::VARCHAR as nav_reference_number

        -- ACCOUNTS
        ,account::VARCHAR as account

        -- EXCHANGE
        ,CASE
            WHEN TRIM(exchange_name) = 'NYM' THEN 'NYME'
            ELSE 'IFED'
        END AS exchange_name
        -- TODO: we don't get accurate exchange_code
        ,NULL::VARCHAR as exchange_code

        -- OPTIONS
        ,CASE
            WHEN TRIM(call_put) IN ('CALL', 'PUT') THEN TRUE::BOOLEAN
            ELSE FALSE::BOOLEAN
        END AS is_option
        ,CASE
            WHEN TRIM(call_put) = 'CALL' THEN 'CALL'
            WHEN TRIM(call_put) = 'PUT' THEN 'PUT'
            ELSE NULL
        END AS put_call_long
        ,CASE
            WHEN TRIM(call_put) = 'CALL' THEN 'C'
            WHEN TRIM(call_put) = 'PUT' THEN 'P'
            ELSE NULL
        END AS put_call
        ,CASE
            WHEN TRIM(call_put) IN ('CALL', 'PUT') THEN ROUND(strike_price::NUMERIC, 3)
            ELSE NULL::NUMERIC
        END AS strike_price

        -- CONTRACT DATES
        ,CASE
            WHEN month_year ~ '^\s*\d{2}/\d{2}/\d{4}$' THEN TO_CHAR(TO_DATE(TRIM(month_year), 'MM/DD/YYYY'), 'YYYYMM')
            WHEN month_year ~* '^\s*[A-Z]{3}\d{2}$' THEN TO_CHAR(TO_DATE(UPPER(TRIM(month_year)), 'MONYY'), 'YYYYMM')
            ELSE NULL
        END AS contract_yyyymm
        ,CASE
            WHEN month_year ~ '^\s*\d{2}/\d{2}/\d{4}$' THEN TO_CHAR(TO_DATE(TRIM(month_year), 'MM/DD/YYYY'), 'YYYYMMDD')
            ELSE NULL
        END AS contract_yyyymmdd

        ,CASE
            WHEN month_year ~ '^\s*\d{2}/\d{2}/\d{4}$' THEN TO_CHAR(TO_DATE(TRIM(month_year), 'MM/DD/YYYY'), 'YYYY')
            WHEN month_year ~* '^\s*[A-Z]{3}\d{2}$' THEN TO_CHAR(TO_DATE(UPPER(TRIM(month_year)), 'MONYY'), 'YYYY')
            ELSE NULL
        END AS contract_year
        ,CASE
            WHEN month_year ~ '^\s*\d{2}/\d{2}/\d{4}$' THEN TO_CHAR(TO_DATE(TRIM(month_year), 'MM/DD/YYYY'), 'MM')
            WHEN month_year ~* '^\s*[A-Z]{3}\d{2}$' THEN TO_CHAR(TO_DATE(UPPER(TRIM(month_year)), 'MONYY'), 'MM')
            ELSE NULL
        END AS contract_month
        ,CASE
            WHEN month_year ~ '^\s*\d{2}/\d{2}/\d{4}$' THEN TO_CHAR(TO_DATE(TRIM(month_year), 'MM/DD/YYYY'), 'DD')
            ELSE NULL
        END AS contract_day

        -- TRADE DATES
        ,trade_date::DATE as trade_date
        -- TODO:
        ,NULL::DATE as last_trade_date

        -- DESCRIPTION
        ,product as nav_product

        -- BUY/SELL, QTY, LOTS
        ,CASE
            WHEN TRIM(long_short) = 'SHORT' THEN 'S'
            WHEN TRIM(long_short) = 'LONG' THEN 'B'
        END AS buy_sell
        ,quantity_1 as qty
        ,multiplier_and_tick_value::FLOAT::INTEGER as lots

        -- PRICES
        ,market_settlement_price::FLOAT as settlement_price
        ,trade_price::FLOAT as trade_price
        ,market_value_in_native_currency::FLOAT as market_value

    FROM {{ source('nav_v6', 'positions') }}
    WHERE LOWER(fund_code) = 'moross'
),

-- SELECT * FROM NAV_MOROSS_POSITIONS
-- ORDER BY sftp_date desc, contract_yyyymm ASC

-------------------------------------------------------------
-------------------------------------------------------------

LATEST_SFTP_UPLOAD_TIMESTAMP as (
    SELECT
        sftp_date
        ,MAX(sftp_upload_timestamp) as max_timestamp
    FROM NAV_MOROSS_POSITIONS
    GROUP BY sftp_date
),

-- SELECT * FROM LATEST_SFTP_UPLOAD_TIMESTAMP
-- ORDER BY sftp_date desc

-- -------------------------------------------------------------
-- -------------------------------------------------------------

NAV_MOROSS_POSITIONS_FORMATTED as (
    SELECT

        a.sftp_date
        ,a.sftp_upload_timestamp
        ,nav_reference_number
        ,account
        ,exchange_name
        ,exchange_code
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

    FROM NAV_MOROSS_POSITIONS a
    INNER JOIN LATEST_SFTP_UPLOAD_TIMESTAMP b ON a.sftp_date = b.sftp_date AND a.sftp_upload_timestamp = b.max_timestamp
),

FINAL AS (
    SELECT * FROM NAV_MOROSS_POSITIONS_FORMATTED
)

SELECT * FROM FINAL

ORDER BY sftp_date desc, contract_yyyymm ASC
