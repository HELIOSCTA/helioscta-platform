{{
  config(
    materialized='ephemeral'
  )
}}

-------------------------------------------------------------
-------------------------------------------------------------

WITH COMBINED AS (
    select * FROM {{ ref('staging_v6_nav_positions_3_add_cols') }}
),

-- SELECT * FROM COMBINED
-- ORDER BY sftp_date desc, contract_yyyymm ASC

-------------------------------------------------------------
-- PRODUCT_LOOKUP_TABLE
-------------------------------------------------------------

PRODUCT_LOOKUP_TABLE AS (
    SELECT distinct
        bbg_exchange_code
        ,exchange_code
        ,exchange_code_grouping
        ,exchange_code_region
        ,exchange_code_underlying
    FROM {{ ref('utils_v1_positions_and_trades_product_lookup') }}
),

COMBINED_WITH_PRODUCT_LOOKUP AS (
    SELECT

        combined.*

        -- exchange_code_grouping
        ,(CASE
            WHEN combined.is_option = TRUE AND combined.exchange_code IN ('PMI') THEN 'POWER_OPTIONS'
            -- PJM RT
            WHEN combined.exchange_code IN ('PDP', 'PWA', 'DDP') THEN 'SHORT_TERM_POWER_RT'
            ELSE lookup.exchange_code_grouping
        END) as exchange_code_grouping

        -- exchange_code_region
        ,lookup.exchange_code_region as exchange_code_region

        -- exchange_code_underlying
        ,(CASE
            WHEN combined.is_option = TRUE THEN lookup.exchange_code_underlying
            ELSE NULL
        END)::VARCHAR as exchange_code_underlying

        ,lookup.bbg_exchange_code as bbg_exchange_code

    FROM COMBINED combined
    LEFT JOIN PRODUCT_LOOKUP_TABLE lookup ON combined.exchange_code = lookup.exchange_code
),

-- SELECT * FROM COMBINED_WITH_PRODUCT_LOOKUP
-- ORDER BY sftp_date desc, contract_yyyymm ASC

-------------------------------------------------------------
-- ICE XL
-------------------------------------------------------------

COMBINED_WITH_ICE_XL AS (
    SELECT
        combined.*

        ,(CASE

            -- BALMO (e.g. HHD B0-IUS)
            WHEN exchange_name = 'IFED' AND exchange_code = 'HHD' THEN
                CONCAT(
                    exchange_code,
                    ' ',
                    'B0-IUS'
                )

            -- SHORT TERM POWER (e.g. PDP D0-IUS)
            WHEN exchange_name = 'IFED' AND exchange_code_grouping = 'SHORT_TERM_POWER_RT' THEN
                CONCAT(
                    exchange_code,
                    ' ',
                    'D0-IUS'
                )

            -- POWER OPTIONS (e.g. PMI Z25P50-IUS)
            WHEN exchange_name = 'IFED' AND is_option = TRUE THEN
                CONCAT(
                    exchange_code,
                    ' ',
                    futures_contract_month_yy,
                    put_call,
                    strike_price::INTEGER,
                    '-IUS'
                )

            -- POWER FUTURES (e.g. PMI X25-IUS)
            WHEN exchange_name = 'IFED' AND is_option = FALSE AND contract_day IS NULL THEN
                CONCAT(
                    exchange_code,
                    ' ',
                    futures_contract_month_yy,
                    '-IUS'
                )

            ELSE NULL
        END) as ice_xl_symbol

        ,(CASE

            -- POWER OPTIONS (e.g. PMI Z25P50-IUS)
            WHEN exchange_name = 'IFED' AND is_option = TRUE THEN
                CONCAT(
                    exchange_code_underlying,
                    ' ',
                    futures_contract_month_yy,
                    '-IUS'
                )

            ELSE NULL
        END) as ice_xl_symbol_underlying

    FROM COMBINED_WITH_PRODUCT_LOOKUP combined
),

-- SELECT * FROM COMBINED_WITH_ICE_XL
-- ORDER BY sftp_date DESC, contract_yyyymm

-------------------------------------------------------------
-- CME EXCEL
-------------------------------------------------------------

COMBINED_WITH_CME_EXCEL AS (
    SELECT
        combined.*

        ,(CASE

            -- HP: Penultimate (EXPIRES DAY BEFORE)
            -- https://www.cmegroup.com/markets/energy/natural-gas/natural-gas-penultimate.contractSpecs.html
            -- WHEN exchange_code in ('HP', 'PHH') THEN CONCAT('1|', 'G', '|', 'XNYM:F:HP', ':', contract_yyyymm)
            WHEN exchange_code in ('HP', 'PHH') THEN CONCAT('1|', 'G', '|', 'XNYM:F:NG', ':', contract_yyyymm)

            -- HH: Last Day Financial
            -- https://www.cmegroup.com/markets/energy/natural-gas/natural-gas-last-day.contractSpecs.html
            -- WHEN exchange_code in ('HH', 'H') THEN CONCAT('1|', 'G', '|', 'XNYM:F:HH', ':', contract_yyyymm)
            WHEN exchange_code in ('HH', 'H') THEN CONCAT('1|', 'G', '|', 'XNYM:F:NG', ':', contract_yyyymm)

            -- NG
            WHEN exchange_code = 'NG' THEN CONCAT('1|', 'G', '|', 'XNYM:F:NG', ':', contract_yyyymm)

            -- OPTION
            WHEN exchange_code in ('LN', 'PHE') THEN CONCAT('1|', 'G', '|', 'XNYM:O:LN', ':', contract_yyyymm, ':', put_call, ':', RTRIM(TO_CHAR(strike_price, 'FM999999999.999'), '.'))

            -- WEEKLY
            WHEN exchange_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') THEN CONCAT('1|', 'G', '|', 'XNYM:O:KN', SUBSTRING(exchange_code, 3, 2), ':', contract_yyyymm, ':', put_call, ':', RTRIM(TO_CHAR(strike_price, 'FM999999999.999'), '.'))

            -- TODO: CAL SPREAD
            WHEN exchange_code in ('G3', 'G4') THEN 'CAL_SPREAD_CME_EXCEL_CODE'

            ELSE NULL
        END) as cme_excel_symbol

    FROM COMBINED_WITH_ICE_XL combined
),

-- SELECT * FROM COMBINED_WITH_CME_EXCEL
-- ORDER BY sftp_date DESC, contract_yyyymm

-------------------------------------------------------------
-- BLOOMBERG
-------------------------------------------------------------

COMBINED_WITH_BLOOMBERG AS (
    SELECT
        combined.*

        -- bloomberg_symbol
        ,(CASE

            -- NG OPTION
            WHEN is_option = True AND exchange_code in ('LN', 'PHE') THEN
            CONCAT(
                bbg_exchange_code,
                futures_contract_month_y,
                put_call,
                ' ',
                RTRIM(TO_CHAR(strike_price, 'FM999999999.999'), '.')
            )

            ELSE NULL
        END) as bbg_symbol

        -- option_description
        ,(CASE

            -- EXAMPLE: 'CALL JUL 2025 9.00'
            WHEN is_option = True AND exchange_code in ('LN', 'PHE') THEN
                CONCAT(
                    CASE WHEN put_call = 'C' THEN 'CALL' ELSE 'PUT' END,
                    ' ',
                    TO_CHAR(TO_DATE(SUBSTRING(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                    ' ',
                    contract_year,
                    ' ',
                    TO_CHAR(strike_price, 'FM90.00')
                )

            -- WEEKLIES
            -- EXAMPLE: 'CALL JUL 2025 WKLY WK1 9.00'
            WHEN is_option = True AND exchange_code in ('LN1', 'LN2', 'LN3', 'LN4', 'LN5') THEN
                CONCAT(
                    CASE WHEN put_call = 'C' THEN 'CALL' ELSE 'PUT' END,
                    ' ',
                    TO_CHAR(TO_DATE(SUBSTRING(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                    ' ',
                    contract_year,
                    ' ',
                    'WKLY WEEK', SUBSTRING(exchange_code, 3, 2),
                    ' ',
                    TO_CHAR(strike_price, 'FM90.00')
                )

            -- EXAMPLE: 'PUT OCT 25 NYME NAT GAS CAL SPRD FIN 3MO -1.50'
            WHEN is_option = True AND exchange_code in ('G3', 'G4') THEN
                CONCAT(
                    CASE WHEN put_call = 'C' THEN 'CALL' ELSE 'PUT' END,
                    ' ',
                    TO_CHAR(TO_DATE(SUBSTRING(contract_yyyymm, 5, 2), 'MM'), 'MON'),
                    ' ',
                    contract_year,
                    ' ',
                    'CAL SPREAD ', SUBSTRING(exchange_code, 2, 1), ' MONTHS',
                    ' ',
                    TO_CHAR(strike_price, 'FM90.00')
                )

            ELSE NULL

        END) as bbg_option_description


    FROM COMBINED_WITH_CME_EXCEL combined
),

FINAL AS (
    SELECT * FROM COMBINED_WITH_BLOOMBERG
)

SELECT * FROM FINAL

ORDER BY sftp_date DESC, contract_yyyymm
