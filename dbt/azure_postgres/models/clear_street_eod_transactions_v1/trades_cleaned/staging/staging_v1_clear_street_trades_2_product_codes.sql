{{
  config(
    materialized='ephemeral'
  )
}}

-------------------------------------------------------------
-------------------------------------------------------------

WITH TRADES AS (
    SELECT * FROM {{ ref('staging_v1_clear_street_trades_1_additional_cols') }}
),

-- SELECT * FROM TRADES
-- ORDER BY sftp_date DESC, sftp_upload_timestamp DESC

-------------------------------------------------------------
-- PRODUCT_LOOKUP_LOOKUP
-------------------------------------------------------------

PRODUCT_LOOKUP_TABLE AS (
    SELECT distinct
        bbg_exchange_code
        ,exchange_code
        ,exchange_code_grouping as product_code_grouping
        ,exchange_code_region as product_code_region
        ,exchange_code_underlying as product_code_underlying
    FROM {{ ref('utils_v1_positions_and_trades_product_lookup') }}
),

TRADES_WITH_PRODUCT_LOOKUP AS (
    SELECT

        trades.*

        -- product_code_grouping
        ,(CASE
            WHEN trades.is_option = TRUE AND trades.exch_comm_cd IN ('PMI') THEN 'POWER_OPTIONS'
            -- PJM RT
            WHEN EXTRACT(DAY FROM trades.trade_date) = contract_day AND trades.exch_comm_cd IN ('PDP', 'PWA', 'DDP') THEN 'SHORT_TERM_POWER_RT'
            ELSE lookup.product_code_grouping
        END) as product_code_grouping

        -- product_code_region
        ,lookup.product_code_region as product_code_region

        -- product_code_underlying
        ,(CASE
            WHEN trades.is_option = TRUE THEN lookup.product_code_underlying
            ELSE NULL
        END)::VARCHAR as product_code_underlying

        ,bbg_exchange_code

    FROM TRADES trades
    LEFT JOIN PRODUCT_LOOKUP_TABLE lookup ON trades.exch_comm_cd = lookup.exchange_code
),

-- SELECT * FROM TRADES_WITH_PRODUCT_LOOKUP
-- ORDER BY sftp_date DESC, contract_year_month, put_call, strike_price

-------------------------------------------------------------
-- ICE XL
-------------------------------------------------------------

TRADES_WITH_ICE_XL AS (
    SELECT
        trades.*

        -- ice_product_code
        ,(CASE
            -- FUTURES
            -- e.g. PMI X25-IUS
            WHEN exchange_name_cleaned in ('IFED') AND is_option = FALSE AND contract_day IS NULL THEN
                CONCAT(
                    exch_comm_cd,
                    ' ',
                    futures_contract_month_yy,
                    '-IUS'
                )

            -- OPTION
            -- e.g. PMI Z25P50-IUS
            WHEN exchange_name_cleaned in ('IFED') AND is_option = TRUE THEN
                CONCAT(
                    exch_comm_cd,
                    ' ',
                    futures_contract_month_yy,
                    put_call,
                    strike_price::INTEGER,
                    '-IUS'
                )

            -- BALMO
            -- e.g. HHD B0-IUS
            WHEN exchange_name_cleaned in ('IFED') AND is_option = FALSE AND contract_day IS NOT NULL AND exch_comm_cd = 'HHD' THEN
                CONCAT(
                    exch_comm_cd,
                    ' ',
                    'B0-IUS'
                )

            -- RT
            -- e.g. PDP D0-IUS
            WHEN product_code_grouping = 'SHORT_TERM_POWER_RT' THEN
                CONCAT(
                    exch_comm_cd,
                    ' ',
                    'D0-IUS'
                )

            -- TODO: SHORT TERM POWER

            ELSE NULL
        END) as ice_product_code

        -- ice_product_code_underlying
        ,(CASE
            -- OPTION
            -- e.g. PMI X25-IUS
            WHEN exchange_name_cleaned in ('IFED') AND is_option = TRUE AND product_code_underlying IS NOT NULL THEN
                CONCAT(
                    product_code_underlying,
                    ' ',
                    futures_contract_month_yy,
                    '-IUS'
                )

            ELSE NULL
        END) as ice_product_code_underlying

    FROM TRADES_WITH_PRODUCT_LOOKUP trades
),

-- SELECT * FROM TRADES_WITH_ICE_XL
-- ORDER BY sftp_date DESC, contract_year_month, put_call, strike_price

-------------------------------------------------------------
-- CME EXCEL
-------------------------------------------------------------

TRADES_WITH_CME_EXCEL AS (
    SELECT
        trades.*

        ,(CASE

            -- HP: Penultimate (EXPIRES DAY BEFORE)
            -- https://www.cmegroup.com/markets/energy/natural-gas/natural-gas-penultimate.contractSpecs.html
            WHEN exch_comm_cd in ('HP') THEN CONCAT('1|', 'G', '|', 'XNYM:F:NG', ':', contract_year_month)

            -- HH: Last Day Financial
            -- https://www.cmegroup.com/markets/energy/natural-gas/natural-gas-last-day.contractSpecs.html
            WHEN exch_comm_cd in ('HH') THEN CONCAT('1|', 'G', '|', 'XNYM:F:NG', ':', contract_year_month)

            -- NG
            WHEN exch_comm_cd in ('NG') THEN CONCAT('1|', 'G', '|', 'XNYM:F:NG', ':', contract_year_month)

            -- OPTION
            WHEN exch_comm_cd in ('LN') THEN CONCAT('1|', 'G', '|', 'XNYM:O:LN', ':', contract_year_month, ':', put_call, ':', RTRIM(TO_CHAR(strike_price, 'FM999999999.999'), '.'))

            -- WEEKLY
            WHEN exch_comm_cd in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') THEN CONCAT('1|', 'G', '|', 'XNYM:O:KN', SUBSTRING(exch_comm_cd, 3, 2), ':', contract_year_month, ':', put_call, ':', RTRIM(TO_CHAR(strike_price, 'FM999999999.999'), '.'))

            -- DAILY
            WHEN exch_comm_cd in ('KN4') THEN CONCAT('1|', 'G', '|', 'XNYM:O:KN', SUBSTRING(exch_comm_cd, 3, 2), ':', contract_year_month, ':', put_call, ':', RTRIM(TO_CHAR(strike_price, 'FM999999999.999'), '.'))

            -- TODO: CAL SPREAD
            WHEN exch_comm_cd in ('G3', 'G4') THEN ''

            ELSE NULL
        END) as cme_product_code

    FROM TRADES_WITH_ICE_XL trades
),

-- SELECT * FROM TRADES_WITH_CME_EXCEL
-- ORDER BY sftp_date DESC, contract_year_month, put_call, strike_price

-------------------------------------------------------------
-- BBG CODES
-------------------------------------------------------------

TRADES_WITH_BBG_CODES AS (
    SELECT
        trades.*

        ,(CASE

            -- HP
            -- e.g. ZAZ6 COMDTY
            WHEN exch_comm_cd IN ('HP') AND bbg_exchange_code = 'ZA' THEN
                CONCAT(
                    bbg_exchange_code,
                    futures_contract_month_y,
                    ' COMDTY'
                )

            -- HH
            -- e.g. ZAZ6 COMDTY
            WHEN exch_comm_cd IN ('HH') AND bbg_exchange_code = 'IW' THEN
                CONCAT(
                    bbg_exchange_code,
                    futures_contract_month_y,
                    ' COMDTY'
                )

            -- NG
            -- e.g. NGG26 COMDTY
            WHEN exch_comm_cd IN ('NG') AND bbg_exchange_code = 'NG' THEN
                CONCAT(
                    bbg_exchange_code,
                    futures_contract_month_yy,
                    ' COMDTY'
                )


            -- LN (e.g. )
            -- e.g. NGG26 COMDTY
            WHEN exch_comm_cd in ('LN', 'PHE') AND bbg_exchange_code = 'NG' THEN
                CONCAT(
                    bbg_exchange_code,
                    futures_contract_month_y,
                    put_call,
                    ' ',
                    RTRIM(TO_CHAR(strike_price, 'FM999999999.999'), '.'),
                    ' COMDTY'
                )

            -- WEEKLY (e.g. NGWG26C3 3.05 COMB)
            WHEN exch_comm_cd in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') THEN
                CONCAT(
                    bbg_exchange_code,
                    futures_contract_month_yy,
                    put_call,
                    SUBSTRING(exch_comm_cd, 3, 2),  -- week number
                    ' ',
                    RTRIM(TO_CHAR(strike_price, 'FM999999999.999'), '.'),
                    ' COMB'
                )

            -- DAILY
            WHEN exch_comm_cd in ('KN4') THEN
                CONCAT(
                    bbg_exchange_code,
                    futures_contract_month_yy,
                    put_call,
                    SUBSTRING(exch_comm_cd, 3, 2),  -- day number
                    ' ',
                    RTRIM(TO_CHAR(strike_price, 'FM999999999.999'), '.'),
                    ' Comdty'
                )

            ELSE NULL
        END) as bbg_product_code

    FROM TRADES_WITH_CME_EXCEL trades
)

SELECT * FROM TRADES_WITH_BBG_CODES
ORDER BY sftp_date DESC, contract_year_month, put_call, strike_price
